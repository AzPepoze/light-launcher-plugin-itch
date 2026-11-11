/**
 * itch.io plugin entry. The host starts this process and talks JSON-RPC over stdio.
 */

import manifest from '../plugin.json';
import { HttpClient, hostTransport } from '@light-launcher/plugin-sdk/helpers';
import {
  servePlugin,
  sourceHandlers,
  type HostClient,
  type PluginContext,
  type PluginHandlers,
} from '@light-launcher/plugin-sdk/runtime';
import type { InitializeParams, InitializeResult } from '@light-launcher/plugin-sdk/types';
import { readItchApiKey } from './library/itch-key';
import type { HostServices } from './host';
import { writeLog } from './logger';
import { createItchProvider, type ItchProvider } from './providers/itch';
import { createNetworkHttp } from './http';
import { readSettings, type PluginSettings } from './settings';

const CATEGORY = 'itch';
/** Responses are small JSON or game pages. Anything bigger is not from the itch API. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Plugin-defined methods, named in contributes.commands. */
type ItchMethods = {
  'itch.importDesktopKey': { params: Record<string, never>; result: { found: boolean } };
};

let provider: ItchProvider | null = null;

function requireProvider(): ItchProvider {
  if (!provider) throw new Error('plugin is not initialized');
  return provider;
}

/** Saved settings with defaults applied. A failed read logs a warning and uses the defaults. */
async function loadSettings(host: HostClient): Promise<PluginSettings> {
  try {
    return readSettings(await host.settings.get());
  } catch (err) {
    writeLog(CATEGORY, 'warn', 'could not read settings, using defaults', String(err));
    return readSettings({});
  }
}

function createHostServices(host: HostClient): HostServices {
  const settings = () => loadSettings(host);
  const client = new HttpClient(hostTransport(host), { maxBodyBytes: MAX_BODY_BYTES });
  return {
    http: createNetworkHttp(client, settings),
    secrets: host.secrets,
    storage: host.storage,
    settings,
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

/** Copies the API key from the itch desktop app. Stores it only when the app has one. */
async function importDesktopKey(): Promise<{ found: boolean }> {
  const apiKey = readItchApiKey();
  if (!apiKey) return { found: false };
  await requireProvider().importCredential(apiKey);
  return { found: true };
}

const handlers: PluginHandlers<ItchMethods> = {
  initialize,
  ...sourceHandlers(requireProvider, 'itch'),
  'itch.importDesktopKey': importDesktopKey,
};

async function main(): Promise<void> {
  writeLog('plugin', 'info', `itch plugin ${manifest.version} waiting for initialize`);
  await servePlugin(handlers);
  process.exit(0);
}

void main();
