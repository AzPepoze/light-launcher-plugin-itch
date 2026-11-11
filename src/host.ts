/**
 * Services the provider needs. main.ts builds them from the SDK host client, so
 * network calls go through the host and secrets live in the host keyring.
 */

import type { HttpClient } from '@light-launcher/plugin-sdk/helpers';
import type { HostClient } from '@light-launcher/plugin-sdk/runtime';
import type { PluginSettings } from './settings';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface HostServices {
  /** outbound HTTP through the host: allow-listed, rate-limited and retried there */
  http: Pick<HttpClient, 'request' | 'json'>;
  secrets: HostClient['secrets'];
  /** read on each call, so a saved change applies at once */
  settings(): Promise<PluginSettings>;
  /** keep a raw page when parsing fails */
  dump(name: string, body: string): void;
  log(level: LogLevel, msg: string, extra?: unknown): void;
}
