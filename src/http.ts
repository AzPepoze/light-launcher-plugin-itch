/**
 * Applies the Network settings to every request: a wait between requests and an
 * optional User-Agent. Each request reads the settings, so a change applies at once.
 */

import {
  HttpClient,
  spacedTransport,
  type HttpOptions,
  type HttpTransport,
} from '@light-launcher/plugin-sdk/helpers';
import { DEFAULT_SETTINGS, type PluginSettings } from './settings';

export type HttpService = Pick<HttpClient, 'request' | 'json'>;

function withUserAgent(options: HttpOptions, userAgent: string): HttpOptions {
  if (!userAgent) return options;
  return { ...options, headers: { 'User-Agent': userAgent, ...options.headers } };
}

export function createNetworkHttp(
  transport: HttpTransport,
  settings: () => Promise<PluginSettings>,
  maxBodyBytes?: number,
): HttpService {
  // The getter keeps later settings changes live; a non-zero start avoids the no-delay fast path.
  let delayMs = DEFAULT_SETTINGS.requestDelayMs;
  const client = new HttpClient(
    spacedTransport(transport, {
      get minDelayMs() {
        return delayMs;
      },
    }),
    { maxBodyBytes },
  );

  async function prepare(options?: HttpOptions): Promise<HttpOptions> {
    const current = await settings();
    delayMs = current.requestDelayMs;
    return withUserAgent(options ?? {}, current.userAgent);
  }

  return {
    request: async (url, options) => client.request(url, await prepare(options)),
    json: async <T>(url: string, options?: HttpOptions) => client.json<T>(url, await prepare(options)),
  };
}
