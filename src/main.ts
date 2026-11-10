/**
 * itch.io plugin entry. The host starts this process and talks JSON-RPC over stdio.
 */

import manifest from '../plugin.json';
import { HttpClient, hostTransport } from '@light-launcher/plugin-sdk/helpers';
import {
  servePlugin,
  type HostClient,
  type PluginContext,
  type PluginHandlers,
} from '@light-launcher/plugin-sdk/runtime';
import type {
  CheckUpdateParams,
  CheckUpdateResult,
  FetchGameParams,
  FetchGameResult,
  InitializeParams,
  InitializeResult,
  ResolveFilesParams,
  ResolveFilesResult,
  SearchParams,
  SearchResult,
} from '@light-launcher/plugin-sdk/types';
import type { HostServices } from './host';
import { writeLog } from './logger';
import { createItchProvider, type ItchProvider } from './providers/itch';

const CATEGORY = 'itch';

let provider: ItchProvider | null = null;

function requireProvider(): ItchProvider {
  if (!provider) throw new Error('plugin is not initialized');
  return provider;
}

function createHostServices(host: HostClient): HostServices {
  return {
    http: new HttpClient(hostTransport(host)),
    secrets: host.secrets,
    dump(name, body) {
      writeLog(CATEGORY, 'debug', `parse dump skipped: ${name}`, { bytes: body.length });
    },
    log(level, msg, extra) {
      writeLog(CATEGORY, level, msg, extra);
    },
  };
}

function initialize(_params: InitializeParams, ctx: PluginContext): InitializeResult {
  provider = createItchProvider(createHostServices(ctx.host));
  return { pluginVersion: manifest.version, capabilities: { [provider.id]: provider.capabilities } };
}

async function search(params: SearchParams): Promise<SearchResult> {
  return { games: await requireProvider().fetchList(params) };
}

async function fetchGame({ ref }: FetchGameParams): Promise<FetchGameResult> {
  return { game: await requireProvider().fetchGame(ref) };
}

async function resolveFiles({ game }: ResolveFilesParams): Promise<ResolveFilesResult> {
  return { files: await requireProvider().resolveFiles(game) };
}

async function checkUpdate({ game }: CheckUpdateParams): Promise<CheckUpdateResult> {
  return { update: await requireProvider().checkUpdate(game) };
}

const handlers: PluginHandlers = {
  initialize,
  'source.authStatus': () => requireProvider().authStatus(),
  'source.setCredential': ({ value }) => requireProvider().setCredential(value),
  'source.clearCredential': () => requireProvider().clearCredential(),
  'source.parseRef': ({ url }) => requireProvider().parseRef(url),
  'source.search': search,
  'source.fetchGame': fetchGame,
  'source.resolveFiles': resolveFiles,
  'source.prepareDownload': ({ file, game }) => requireProvider().prepareDownload(file, game),
  'source.checkUpdate': checkUpdate,
  'source.sync': () => requireProvider().sync(),
};

async function main(): Promise<void> {
  writeLog('plugin', 'info', `itch plugin ${manifest.version} waiting for initialize`);
  await servePlugin(handlers);
  process.exit(0);
}

void main();
