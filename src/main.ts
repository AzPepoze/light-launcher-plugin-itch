/**
 * itch.io plugin entry. The host starts this process and talks JSON-RPC over stdio.
 */

import manifest from '../plugin.json';
import { hostTransport, readSettings, writeDump } from '@light-launcher/plugin-sdk/helpers';
import {
  createLogger,
  servePlugin,
  sourceHandlers,
  stdioIo,
  type HostClient,
  type HostServices,
  type Logger,
  type LogLevel,
  type PluginContext,
  type PluginHandlers,
} from '@light-launcher/plugin-sdk/runtime';
import type { InitializeParams, InitializeResult } from '@light-launcher/plugin-sdk/types';
import { readItchApiKey } from './library/itch-key';
import { createItchProvider, type ItchProvider } from './providers/itch';
import { createNetworkHttp } from './http';
import { DEFAULT_SETTINGS, settingsFrom, type PluginSettings } from './settings';

const CATEGORY = 'itch';
/** Responses are small JSON or game pages. Anything bigger is not from the itch API. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Plugin-defined methods, named in contributes.commands. */
type ItchMethods = {
  'itch.importDesktopKey': { params: Record<string, never>; result: { found: boolean } };
};

let provider: ItchProvider | null = null;
let verboseLogging = false;
const loggers = new Map<string, Logger>();

function requireProvider(): ItchProvider {
  if (!provider) throw new Error('plugin is not initialized');
  return provider;
}

function loggerFor(category: string): Logger {
  let logger = loggers.get(category);
  if (!logger) {
    logger = createLogger(category);
    loggers.set(category, logger);
  }
  return logger;
}

function withExtra(message: string, extra: unknown): string {
  if (extra === undefined) return message;
  if (extra instanceof Error) return `${message} ${extra.message}`;
  if (typeof extra === 'string') return `${message} ${extra}`;
  try {
    return `${message} ${JSON.stringify(extra)}`;
  } catch {
    return `${message} ${String(extra)}`;
  }
}

function writeLog(category: string, level: LogLevel, message: string, extra?: unknown): void {
  if (level === 'debug' && !verboseLogging) return;
  loggerFor(category)[level](withExtra(message, extra));
}

/** Saved settings with defaults applied. A failed read uses the defaults. */
async function loadSettings(host: HostClient): Promise<PluginSettings> {
  return readSettings(host, settingsFrom, DEFAULT_SETTINGS);
}

/** Saves the page when a dump folder is set. Failures are logged, never thrown. */
function dumpPage(settings: () => Promise<PluginSettings>, name: string, body: string): void {
  void settings()
    .then((current) => {
      if (!current.dumpDir) {
        writeLog(CATEGORY, 'debug', `parse dump skipped: ${name}`, { bytes: body.length });
        return;
      }
      writeDump(current.dumpDir, name, body);
      writeLog(CATEGORY, 'info', `saved raw page: ${name}`);
    })
    .catch((err) => writeLog(CATEGORY, 'warn', `could not save raw page ${name}`, String(err)));
}

function createHostServices(host: HostClient): HostServices<PluginSettings> {
  const settings = async () => {
    const current = await loadSettings(host);
    verboseLogging = current.verboseLogging;
    return current;
  };
  return {
    http: createNetworkHttp(hostTransport(host), settings, MAX_BODY_BYTES),
    secrets: host.secrets,
    storage: host.storage,
    settings,
    dump(name, body) {
      dumpPage(settings, name, body);
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
  await servePlugin(handlers, stdioIo(), {}, { validateParams: true });
  process.exit(0);
}

void main();
