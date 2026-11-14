import { describe, expect, test } from 'bun:test';
import { fetchTransport } from '@light-launcher/plugin-sdk/helpers';
import { createNetworkHttp } from '../src/http';
import { settingsFrom } from '../src/settings';

interface Sent {
  url: string;
  headers: Record<string, string>;
  at: number;
}

/** a fetch that records each request and answers 200 with an empty JSON object */
function recordingFetch(): { fetch: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      at: Date.now(),
    });
    return new Response('{}', { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: fetchImpl, sent };
}

function networkHttp(saved: Parameters<typeof settingsFrom>[0], fetchImpl: typeof fetch) {
  return createNetworkHttp(fetchTransport(fetchImpl), async () => settingsFrom(saved));
}

describe('createNetworkHttp', () => {
  test('defaults send no User-Agent override', async () => {
    const recorder = recordingFetch();
    await networkHttp({}, recorder.fetch).request('https://itch.io/a');
    expect(recorder.sent[0].headers['User-Agent']).toContain('Mozilla/5.0');
  });

  test('userAgent replaces the default User-Agent', async () => {
    const recorder = recordingFetch();
    await networkHttp({ userAgent: 'my-agent/1.0' }, recorder.fetch).request('https://itch.io/a');
    expect(recorder.sent[0].headers['User-Agent']).toBe('my-agent/1.0');
  });

  test('requestDelayMs spaces the requests', async () => {
    const recorder = recordingFetch();
    const http = networkHttp({ requestDelayMs: 60 }, recorder.fetch);
    await Promise.all([http.request('https://itch.io/a'), http.request('https://itch.io/b')]);
    expect(recorder.sent[1].at - recorder.sent[0].at).toBeGreaterThanOrEqual(55);
  });

  test('json goes through the same settings', async () => {
    const recorder = recordingFetch();
    await networkHttp({ userAgent: 'json-agent' }, recorder.fetch).json('https://itch.io/a');
    expect(recorder.sent[0].headers['User-Agent']).toBe('json-agent');
  });
});
