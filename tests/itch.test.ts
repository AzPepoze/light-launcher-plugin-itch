import { describe, expect, test } from 'bun:test';
import { fetchTransport, HttpClient } from '@light-launcher/plugin-sdk/helpers';
import type { HostServices } from '../src/host';
import { readSettings, type PluginSettings } from '../src/settings';
import { createItchProvider, parseRef } from '../src/providers/itch';
import {
  mapGame,
  ownedKeyGameIds,
  parseGameIdFromHtml,
  type ItchGamePayload,
} from '../src/providers/itch/library';
import {
  chooseUploads,
  isDemo,
  pickNewest,
  preferPlatform,
  versionFromUpload,
  type ItchUpload,
} from '../src/providers/itch/uploads';

const UPLOADS: ItchUpload[] = [
  // deliberately reversed `position`: the array order is newest-first but the
  // API's position is oldest-first, so position must never pick the winner
  {
    id: 1,
    filename: 'game-demo-win.zip',
    size: 100,
    created_at: '2024-01-01T00:00:00Z',
    position: 3,
    traits: ['p_windows', 'demo'],
  },
  {
    id: 2,
    filename: 'game-v1.2.0-linux.zip',
    size: 300,
    created_at: '2025-05-01T00:00:00Z',
    position: 0,
    traits: ['p_linux'],
  },
  {
    id: 3,
    filename: 'game-v1.1.0-win.zip',
    size: 200,
    created_at: '2024-06-01T00:00:00Z',
    position: 1,
    traits: ['p_windows'],
  },
];

describe('parseRef', () => {
  test('slug url', () => {
    expect(parseRef('https://krasuepi.itch.io/hotpw')).toEqual({
      kind: 'game',
      id: 'krasuepi/hotpw',
      url: 'https://krasuepi.itch.io/hotpw',
    });
  });

  test('scheme-less slug url', () => {
    expect(parseRef('krasuepi.itch.io/hotpw/')).toEqual({
      kind: 'game',
      id: 'krasuepi/hotpw',
      url: 'https://krasuepi.itch.io/hotpw',
    });
  });

  test('/games/<id> numeric url', () => {
    expect(parseRef('https://itch.io/games/2828037')?.id).toBe('2828037');
    expect(parseRef('https://itch.io/games/2828037')?.kind).toBe('game');
  });

  test('bare digits', () => {
    expect(parseRef(' 2828037 ')).toEqual({
      kind: 'game',
      id: '2828037',
      url: 'https://itch.io/games/2828037',
    });
  });

  test('rejects other hosts', () => {
    expect(parseRef('https://example.com/games/123')).toBeNull();
    expect(parseRef('')).toBeNull();
  });
});

describe('upload ranking', () => {
  test('pickNewest sorts by created_at, never by position', () => {
    expect(pickNewest(UPLOADS)?.id).toBe(2);
    expect(pickNewest([])).toBeNull();
  });

  test('position alone never changes the winner', () => {
    const bumped = UPLOADS.map((u) => ({ ...u, position: (u.position ?? 0) + 100 }));
    const inverted = UPLOADS.map((u) => ({ ...u, position: 99 - (u.position ?? 0) }));
    expect(pickNewest(bumped)?.id).toBe(2);
    expect(pickNewest(inverted)?.id).toBe(2);
  });

  test('demo detected by filename when the trait is missing', () => {
    const upload = { id: 9, filename: 'MyGame-DEMO-linux.zip', traits: ['p_linux'] };
    expect(isDemo(upload)).toBe(true);
  });

  test('demo detected by trait when the filename is neutral', () => {
    const upload = { id: 10, filename: 'MyGame-linux.zip', traits: ['demo', 'p_linux'] };
    expect(isDemo(upload)).toBe(true);
    expect(isDemo({ id: 11, filename: 'MyGame-linux.zip', traits: ['p_linux'] })).toBe(false);
  });

  test('platform preference from traits', () => {
    expect(preferPlatform({ id: 1, filename: 'a.zip', traits: ['p_windows'] })).toBe('windows');
    expect(preferPlatform({ id: 2, filename: 'a.zip', traits: ['p_linux'] })).toBe('linux');
    expect(preferPlatform({ id: 3, filename: 'a.zip', traits: ['p_osx'] })).toBe('mac');
    expect(preferPlatform({ id: 4, filename: 'a.zip', traits: [] })).toBe('other');
  });

  test('chooseUploads ranks full builds above demos, newest first', () => {
    const withNewDemo: ItchUpload[] = [
      ...UPLOADS,
      {
        id: 4,
        filename: 'game-v1.3.0-demo.zip',
        created_at: '2026-01-01T00:00:00Z',
        position: 9,
        traits: ['demo'],
      },
    ];
    expect(chooseUploads(withNewDemo).map((u) => u.id)).toEqual([2, 3, 4, 1]);
    expect(chooseUploads(withNewDemo, { demosFirst: true })[0].id).toBe(4);
  });

  test('versionFromUpload prefers the filename version', () => {
    expect(versionFromUpload({ id: 1, filename: 'MyGame-v0.7.3-win.zip' })).toBe('0.7.3');
    expect(versionFromUpload({ id: 2, filename: 'MyGame_1.0.12.7.zip' })).toBe('1.0.12.7');
  });

  test('versionFromUpload falls back to the ISO upload date', () => {
    expect(
      versionFromUpload({ id: 3, filename: 'game.zip', created_at: '2025-05-01T12:34:56Z' }),
    ).toBe('2025-05-01');
  });
});

describe('HTML helpers', () => {
  test('parseGameIdFromHtml reads data-game_id', () => {
    expect(parseGameIdFromHtml('<div data-game_id="2828037"></div>')).toBe(2828037);
    expect(parseGameIdFromHtml('<script>game_id: 42</script>')).toBe(42);
    expect(parseGameIdFromHtml('<html></html>')).toBeNull();
  });

  test('ownedKeyGameIds tolerates items / nested shapes', () => {
    expect(ownedKeyGameIds({ owned_keys: [{ game_id: 1 }, { game: { id: 2 } }] })).toEqual([1, 2]);
    expect(ownedKeyGameIds({ items: [{ game_id: 3 }] })).toEqual([3]);
    expect(ownedKeyGameIds({ owned_keys: { items: [{ game: { id: 4 } }] } })).toEqual([4]);
    expect(ownedKeyGameIds({ nope: true })).toEqual([]);
  });
});

const SAMPLE_GAME: ItchGamePayload = {
  id: 2828037,
  title: 'Hot PW',
  url: 'https://krasuepi.itch.io/hotpw',
  short_text: 'A <demo> game',
  description: '<p>long description</p>',
  cover_url: 'https://img.itch.zone/hotpw.png',
  tags: ['action', 'adult'],
  traits: ['p_windows', 'p_linux', 'unity', 'status_ongoing', 'demo'],
  user: { id: 1, username: 'krasuepi', display_name: 'Krasuepi' },
  published_at: '2026-01-02T00:00:00Z',
};

const SAMPLE_UPLOAD: ItchUpload = {
  id: 202,
  filename: 'HotPW-v0.7.3-win.zip',
  size: 1234,
  created_at: '2026-03-04T05:06:07Z',
  position: 0,
  traits: ['p_windows'],
};

describe('mapGame', () => {
  test('maps a /games payload to a GameDTO', () => {
    const dto = mapGame(SAMPLE_GAME, { upload: SAMPLE_UPLOAD, fallbackId: 'krasuepi/hotpw' });
    expect(dto.source).toBe('itch');
    expect(dto.sourceId).toBe('2828037');
    expect(dto.url).toBe('https://krasuepi.itch.io/hotpw');
    expect(dto.title).toBe('Hot PW');
    expect(dto.developer).toBe('Krasuepi');
    expect(dto.engine).toBe('Unity');
    expect(dto.descriptionHtml).toBe('<p>A &lt;demo&gt; game</p>');
    expect(dto.tags).toEqual(['action', 'adult']);
    expect(dto.coverUrl).toBe('https://img.itch.zone/hotpw.png');
    expect(dto.rating).toBeNull();
    expect(dto.status).toBe('ongoing');
    expect(dto.version).toBe('0.7.3');
    expect(dto.updatedAt).toBe('2026-03-04T05:06:07Z');
    expect(dto.extra).toMatchObject({
      gameId: 2828037,
      uploadId: 202,
      uploadFilename: 'HotPW-v0.7.3-win.zip',
      platforms: ['windows', 'linux'],
    });
  });

  test('falls back to traits for tags and to the date for version', () => {
    const dto = mapGame({ id: 7, title: 'Bare', traits: ['godot', 'p_windows'] });
    expect(dto.url).toBe('https://itch.io/games/7');
    expect(dto.engine).toBe('Godot');
    expect(dto.tags).toEqual(['godot']);
    expect(dto.version).toBeNull();
    expect(dto.extra?.platforms).toEqual(['windows']);
  });
});

// -- provider wiring, with in-memory host services (no network) -------------

const UPLOAD_JSON = { uploads: [SAMPLE_UPLOAD] };

function jsonRoute(path: string): unknown {
  if (path === '/games/2828037') return { game: SAMPLE_GAME };
  if (path === '/games/2828037/uploads') return UPLOAD_JSON;
  if (path === '/profile/owned-keys') return { owned_keys: [] };
  if (path === '/profile') return { user: { username: 'krasuepi', display_name: 'Krasuepi' } };
  throw new Error(`unexpected request ${path}`);
}

/** answers API calls from memory through the SDK's local fetch transport */
const routeFetch = (async (input: string | URL | Request) => {
  const body = jsonRoute(new URL(String(input)).pathname);
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

/** host services backed by a map for the keyring; no network */
function fakeHost(
  store: Map<string, string>,
  fetchImpl: typeof fetch = routeFetch,
  saved: Partial<Record<keyof PluginSettings, unknown>> = {},
): HostServices {
  return {
    http: new HttpClient(fetchTransport(fetchImpl)),
    settings: async () => readSettings(saved),
    secrets: {
      async get(key) {
        return store.get(key) ?? null;
      },
      async set(key, value) {
        store.set(key, value);
      },
      async delete(key) {
        store.delete(key);
      },
    },
    dump() {},
    log() {},
  };
}

describe('createItchProvider', () => {
  test('metadata and fetchGame include the newest upload id', async () => {
    const provider = createItchProvider(fakeHost(new Map([['apikey', 'test-key']])));
    expect(provider.id).toBe('itch');
    expect(provider.label).toBe('itch.io');
    expect(provider.capabilities.auth).toBe('apikey');

    const dto = await provider.fetchGame({
      kind: 'game',
      id: '2828037',
      url: 'https://itch.io/games/2828037',
    });
    expect(dto.title).toBe('Hot PW');
    expect(dto.version).toBe('0.7.3');
    expect(dto.extra?.uploadId).toBe(202);
  });

  test('resolveFiles emits one candidate per upload with an authenticated url', async () => {
    const provider = createItchProvider(fakeHost(new Map([['apikey', 'test-key']])));
    const files = await provider.resolveFiles({
      source: 'itch',
      sourceId: '2828037',
      url: 'https://krasuepi.itch.io/hotpw',
      title: 'Hot PW',
      version: null,
      updatedAt: null,
      extra: { gameId: 2828037, uploadId: 202 },
    });
    expect(files).toHaveLength(1);
    expect(files[0].label).toBe('HotPW-v0.7.3-win.zip (windows, full)');
    expect(files[0].url).toContain('/uploads/202/download?api_key=test-key');
    expect(files[0]).toMatchObject({
      kind: 'direct',
      platform: 'windows',
      size: 1234,
      rangeHint: true,
      requiresAuth: false,
    });
  });
});

describe('credentials', () => {
  test('authStatus is unconfigured without a stored key', async () => {
    const provider = createItchProvider(fakeHost(new Map()));
    expect((await provider.authStatus()).status).toBe('unconfigured');
  });

  test('setCredential stores a working key, trimmed, and authStatus reads it back', async () => {
    const store = new Map<string, string>();
    const provider = createItchProvider(fakeHost(store));
    const state = await provider.setCredential('  new-key  ');
    expect(state).toMatchObject({ status: 'ok', user: 'Krasuepi' });
    expect(store.get('apikey')).toBe('new-key');
    expect((await provider.authStatus()).status).toBe('ok');
  });

  test('setCredential does not store a key that itch.io rejects', async () => {
    const store = new Map<string, string>();
    const rejected = (async (_input: string | URL | Request) => new Response('{}', { status: 401 })) as typeof fetch;
    const provider = createItchProvider(fakeHost(store, rejected));
    expect((await provider.setCredential('bad-key')).status).toBe('invalid');
    expect(store.has('apikey')).toBe(false);
  });

  test('clearCredential deletes the stored key', async () => {
    const store = new Map([['apikey', 'test-key']]);
    const provider = createItchProvider(fakeHost(store));
    expect((await provider.clearCredential()).status).toBe('unconfigured');
    expect(store.has('apikey')).toBe(false);
  });
});

describe('resolveFiles with settings', () => {
  const UPLOADS_FOR_SETTINGS: ItchUpload[] = [
    { id: 1, filename: 'Game-win.zip', created_at: '2026-01-01T00:00:00Z', traits: ['p_windows'] },
    { id: 2, filename: 'Game-linux.zip', created_at: '2025-01-01T00:00:00Z', traits: ['p_linux'] },
    { id: 3, filename: 'Game-Soundtrack.zip', created_at: '2026-02-01T00:00:00Z', traits: ['p_windows'] },
  ];

  const GAME_REF = {
    source: 'itch',
    sourceId: '2828037',
    url: 'https://krasuepi.itch.io/hotpw',
    title: 'Hot PW',
    version: null,
    updatedAt: null,
    extra: { gameId: 2828037 },
  };

  function filesWith(saved: Partial<Record<keyof PluginSettings, unknown>>) {
    const fetchUploads = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      const body = path.endsWith('/uploads') ? { uploads: UPLOADS_FOR_SETTINGS } : { owned_keys: [] };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const provider = createItchProvider(fakeHost(new Map([['apikey', 'test-key']]), fetchUploads, saved));
    return provider.resolveFiles(GAME_REF).then((files) => files.map((file) => file.id));
  }

  test('defaults keep the newest-first order', async () => {
    expect(await filesWith({})).toEqual(['itch-upload-3', 'itch-upload-1', 'itch-upload-2']);
  });

  test('preferredPlatform lists that platform first', async () => {
    expect(await filesWith({ preferredPlatform: 'linux' })).toEqual([
      'itch-upload-2',
      'itch-upload-3',
      'itch-upload-1',
    ]);
  });

  test('preferredPlatform osx matches no file and keeps the order', async () => {
    expect(await filesWith({ preferredPlatform: 'osx' })).toEqual([
      'itch-upload-3',
      'itch-upload-1',
      'itch-upload-2',
    ]);
  });

  test('skipSoundtracksAndExtras hides soundtrack files', async () => {
    expect(await filesWith({ skipSoundtracksAndExtras: true })).toEqual(['itch-upload-1', 'itch-upload-2']);
  });
});
