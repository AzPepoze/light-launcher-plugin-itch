/**
 * Services the host hands to a plugin. A plugin never opens the app database,
 * config file or secrets file itself.
 */

import type { HttpClient } from './vendor/http';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface HostServices {
  /** outbound HTTP, already rate-limited and retrying */
  http: Pick<HttpClient, 'get' | 'json'>;
  /** the saved API key for this source, or null */
  credential: string | null;
  /** keep a raw page when parsing fails */
  dump(name: string, body: string): void;
  log(level: LogLevel, msg: string, extra?: unknown): void;
  /** per-plugin key/value storage */
  storage: KeyValueStore;
}

/** storage that lives only as long as the process; the host has no storage RPC yet */
export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
  };
}
