import { describe, expect, test } from 'bun:test';
import { fetchTransport, HttpClient } from '@light-launcher/plugin-sdk/helpers';
import { createNetworkHttp, RequestSpacer } from '../src/http';
import { readSettings } from '../src/settings';

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

function networkHttp(saved: Parameters<typeof readSettings>[0], fetchImpl: typeof fetch) {
  const client = new HttpClient(fetchTransport(fetchImpl));
  return createNetworkHttp(client, async () => readSettings(saved));
}

describe('RequestSpacer', () => {
  test('a zero delay never waits', async () => {
    const spacer = new RequestSpacer();
    const started = Date.now();
    await Promise.all([spacer.wait(0), spacer.wait(0), spacer.wait(0)]);
    expect(Date.now() - started).toBeLessThan(50);
  });

  test('concurrent waits start one delay apart', async () => {
    const spacer = new RequestSpacer();
    const starts: number[] = [];
    await Promise.all(
      [0, 1, 2].map(async () => {
        await spacer.wait(50);
        starts.push(Date.now());
      }),
    );
    starts.sort((a, b) => a - b);
    expect(starts[2] - starts[0]).toBeGreaterThanOrEqual(90);
  });
});

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
