/**
 * Services the provider needs. main.ts builds them from the SDK host client, so
 * network calls go through the host and secrets live in the host keyring.
 */

import type { HttpClient } from '@light-launcher/plugin-sdk/helpers';
import type { HostClient } from '@light-launcher/plugin-sdk/runtime';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface HostServices {
  /** outbound HTTP through the host: allow-listed, rate-limited and retried there */
  http: Pick<HttpClient, 'request' | 'json'>;
  secrets: HostClient['secrets'];
  /** keep a raw page when parsing fails */
  dump(name: string, body: string): void;
  log(level: LogLevel, msg: string, extra?: unknown): void;
}
