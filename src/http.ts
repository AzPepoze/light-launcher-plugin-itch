/**
 * Applies the Network settings to every request: a wait between requests and an
 * optional User-Agent. Each request reads the settings, so a change applies at once.
 */

import type { HttpClient, HttpOptions } from '@light-launcher/plugin-sdk/helpers';
import type { PluginSettings } from './settings';

export type HttpService = Pick<HttpClient, 'request' | 'json'>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Gives each request its own send time, one delay after the previous one. Safe for concurrent calls. */
export class RequestSpacer {
  private nextSlot = 0;

  async wait(delayMs: number): Promise<void> {
    if (delayMs <= 0) return;
    const now = Date.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + delayMs;
    if (start > now) await sleep(start - now);
  }
}

function withUserAgent(options: HttpOptions, userAgent: string): HttpOptions {
  if (!userAgent) return options;
  return { ...options, headers: { 'User-Agent': userAgent, ...options.headers } };
}

export function createNetworkHttp(
  client: HttpClient,
  settings: () => Promise<PluginSettings>,
): HttpService {
  const spacer = new RequestSpacer();

  async function prepare(options: HttpOptions = {}): Promise<HttpOptions> {
    const current = await settings();
    await spacer.wait(current.requestDelayMs);
    return withUserAgent(options, current.userAgent);
  }

  return {
    request: async (url, options) => client.request(url, await prepare(options)),
    json: async <T>(url: string, options?: HttpOptions) => client.json<T>(url, await prepare(options)),
  };
}
