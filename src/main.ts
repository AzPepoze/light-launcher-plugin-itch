/**
 * itch.io plugin entry. The host starts this process and talks JSON-RPC over stdio.
 */

import manifest from '../plugin.json';
import { createItchProvider } from './providers/itch';
import { createMemoryStore, type HostServices } from './host';
import { writeLog } from './logger';
import { serve, type Handler } from './rpc';
import { HttpClient } from './vendor/http';
import type { FileCandidate, GameRef, Provider, Ref } from './vendor/types';

const CATEGORY = 'itch';

interface InitializeParams {
  credential?: string | null;
}

interface CredentialParams {
  value: string;
}

interface PrepareParams {
  file: FileCandidate;
  game: GameRef;
}

type SearchParams = Parameters<Provider['fetchList']>[0];

let provider: Provider | null = null;

function requireProvider(): Provider {
  if (!provider) throw new Error('plugin is not initialized');
  return provider;
}

function createHostServices(credential: string | null): HostServices {
  return {
    http: new HttpClient(),
    credential,
    dump(name, body) {
      writeLog(CATEGORY, 'debug', `parse dump skipped: ${name}`, { bytes: body.length });
    },
    log(level, msg, extra) {
      writeLog(CATEGORY, level, msg, extra);
    },
    storage: createMemoryStore(),
  };
}

function initialize(params: unknown) {
  const { credential } = (params ?? {}) as InitializeParams;
  provider = createItchProvider(createHostServices(credential ?? null));
  return { pluginVersion: manifest.version, capabilities: provider.capabilities };
}

function setCredential(params: unknown) {
  return requireProvider().setCredential((params as CredentialParams).value);
}

function prepareDownload(params: unknown) {
  const { file, game } = params as PrepareParams;
  return requireProvider().prepareDownload(file, game);
}

function sync() {
  const current = requireProvider();
  if (!current.sync) throw new Error('itch provider cannot sync');
  return current.sync();
}

const handlers = new Map<string, Handler>([
  ['initialize', initialize],
  ['shutdown', () => ({})],
  ['source.authStatus', () => requireProvider().authStatus()],
  ['source.setCredential', setCredential],
  ['source.search', (params) => requireProvider().fetchList(params as SearchParams)],
  ['source.fetchGame', (params) => requireProvider().fetchGame(params as Ref)],
  ['source.resolveFiles', (params) => requireProvider().resolveFiles(params as GameRef)],
  ['source.prepareDownload', prepareDownload],
  ['source.checkUpdate', (params) => requireProvider().checkUpdate(params as GameRef)],
  ['source.sync', sync],
]);

writeLog('plugin', 'info', `itch plugin ${manifest.version} waiting for initialize`);
serve(handlers);
