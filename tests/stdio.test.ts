import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const MAIN = path.join(import.meta.dir, '..', 'src', 'main.ts');

type Json = Record<string, any>;
type HostReply = (params: Json) => unknown;

interface Reply {
  id: unknown;
  result?: any;
  error?: { code: number; message: string };
}

/** JSON lines from a stream, one string per line */
async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffered = '';
  for await (const chunk of stream) {
    buffered += decoder.decode(chunk, { stream: true });
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      yield buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
    }
  }
}

/**
 * Starts the plugin as the host does. Requests from the plugin (secrets, http) are
 * answered by `hostReplies`; a service without a fake gets a method-not-found error.
 */
function startPlugin(hostReplies: Record<string, HostReply>) {
  const proc = Bun.spawn([process.execPath, MAIN], { stdin: 'pipe', stdout: 'pipe', stderr: 'ignore' });
  const lines = readLines(proc.stdout)[Symbol.asyncIterator]();
  let nextId = 1;

  function send(message: Json): void {
    proc.stdin.write(`${JSON.stringify(message)}\n`);
    proc.stdin.flush();
  }

  /** sends a request and waits for its reply, answering any service calls on the way */
  async function call(method: string, params?: Json): Promise<Reply> {
    const id = `host-${nextId++}`;
    send({ jsonrpc: '2.0', id, method, params });
    for (;;) {
      const next = await lines.next();
      if (next.done) throw new Error('plugin closed its output');
      const message = JSON.parse(next.value);
      if (message.method && message.id !== undefined) {
        answerServiceCall(message);
      } else if (message.id === id) {
        return message;
      }
    }
  }

  function answerServiceCall(request: Json): void {
    const reply = hostReplies[request.method];
    if (reply) {
      send({ jsonrpc: '2.0', id: request.id, result: reply(request.params) });
    } else {
      send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: `no fake for ${request.method}` } });
    }
  }

  return {
    call,
    async shutdown(): Promise<{ reply: Reply; exitCode: number }> {
      const reply = await call('shutdown', {});
      return { reply, exitCode: await proc.exited };
    },
    kill(): void {
      if (proc.exitCode === null) proc.kill();
    },
  };
}

const NO_KEY = { 'secrets.get': () => ({ value: null }), 'settings.get': () => ({ settings: {} }) };

async function withPlugin(hostReplies: Record<string, HostReply>, body: (plugin: ReturnType<typeof startPlugin>) => Promise<void>) {
  const plugin = startPlugin(hostReplies);
  try {
    await body(plugin);
  } finally {
    plugin.kill();
  }
}

describe('plugin over stdio', () => {
  test('initialize returns the version and capabilities keyed by source id', () =>
    withPlugin(NO_KEY, async (plugin) => {
      const reply = await plugin.call('initialize', {
        hostVersion: '2.0.0',
        apiVersion: '1',
        platform: 'linux',
        grantedPermissions: { network: [], fs: [], secrets: true, browser: false, exec: false },
        dataDir: '/tmp/itch-test',
      });
      expect(reply.result.pluginVersion).toBe('0.1.2');
      expect(reply.result.capabilities.itch).toMatchObject({ auth: 'apikey', browse: true, versioned: true });
    }), 15_000);

  test('source.parseRef returns the ref for an itch.io url', () =>
    withPlugin(NO_KEY, async (plugin) => {
      await plugin.call('initialize', {});
      const reply = await plugin.call('source.parseRef', { url: 'https://krasuepi.itch.io/hotpw' });
      expect(reply.result).toEqual({
        kind: 'game',
        id: 'krasuepi/hotpw',
        url: 'https://krasuepi.itch.io/hotpw',
      });
    }), 15_000);

  test('source.browse parses the injected search page and source.listFilters answers', () => {
    const searchPage = `<div class="game_cell" data-game_id="77">
      <div class="game_title"><a class="title" href="https://studio.itch.io/bar">Bar</a></div>
      <div class="game_author"><a href="https://studio.itch.io">Studio</a></div>
    </div>`;
    const replies: Record<string, HostReply> = {
      'secrets.get': () => ({ value: null }),
      'settings.get': () => ({ settings: {} }),
      'http.request': (params) => ({
        status: 200,
        url: params.url,
        text: searchPage,
        headers: {},
        notModified: false,
      }),
    };
    return withPlugin(replies, async (plugin) => {
      await plugin.call('initialize', {});
      const browse = await plugin.call('source.browse', {
        source: 'itch',
        query: 'bar',
        limit: 10,
      });
      expect(browse.result.games).toHaveLength(1);
      expect(browse.result.games[0]).toMatchObject({ sourceId: '77', title: 'Bar', developer: 'Studio' });
      expect(browse.result.nextCursor).toBeUndefined();

      const filters = await plugin.call('source.listFilters', {
        source: 'itch',
        group: 'price',
        limit: 10,
      });
      expect(filters.result.options.map((option: Json) => option.value)).toEqual(['all', 'free', 'paid']);
    });
  }, 15_000);

  test('source.authStatus is unconfigured when the host has no key', () =>
    withPlugin(NO_KEY, async (plugin) => {
      await plugin.call('initialize', {});
      const reply = await plugin.call('source.authStatus', { source: 'itch' });
      expect(reply.result.status).toBe('unconfigured');
    }), 15_000);

  test('source.authStatus checks the stored key through the host http service', () => {
    const calls: Json[] = [];
    const replies: Record<string, HostReply> = {
      'secrets.get': () => ({ value: 'stored-key' }),
      'settings.get': () => ({ settings: {} }),
      'http.request': (params) => {
        calls.push(params);
        return { status: 401, url: params.url, text: '', headers: {}, notModified: false };
      },
    };
    return withPlugin(replies, async (plugin) => {
      await plugin.call('initialize', {});
      const reply = await plugin.call('source.authStatus', { source: 'itch' });
      expect(reply.result.status).toBe('invalid');
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain('https://api.itch.io/profile');
    });
  }, 15_000);

  test('a failed settings read still answers with the defaults', () => {
    const replies: Record<string, HostReply> = {
      'secrets.get': () => ({ value: 'stored-key' }),
      'http.request': (params) => ({ status: 401, url: params.url, text: '', headers: {}, notModified: false }),
    };
    return withPlugin(replies, async (plugin) => {
      await plugin.call('initialize', {});
      const reply = await plugin.call('source.authStatus', { source: 'itch' });
      expect(reply.result.status).toBe('invalid');
    });
  }, 15_000);

  test('an unknown method gets a method-not-found error', () =>
    withPlugin(NO_KEY, async (plugin) => {
      await plugin.call('initialize', {});
      const reply = await plugin.call('source.nope', {});
      expect(reply.error?.code).toBe(-32601);
    }), 15_000);

  test('shutdown answers null and the process exits with 0', () =>
    withPlugin(NO_KEY, async (plugin) => {
      await plugin.call('initialize', {});
      const { reply, exitCode } = await plugin.shutdown();
      expect(reply.result).toBeNull();
      expect(exitCode).toBe(0);
    }), 15_000);
});
