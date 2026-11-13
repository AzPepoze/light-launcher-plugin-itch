import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HttpClient, fetchTransport } from '@light-launcher/plugin-sdk/helpers';
import { ErrorCode } from '@light-launcher/plugin-sdk/types';
import type { BrowseParams } from '@light-launcher/plugin-sdk/types';
import type { HostServices } from '../src/host';
import { readSettings } from '../src/settings';
import { createItchProvider } from '../src/providers/itch';
import {
  buildBrowseUrl,
  decodeBrowseCursor,
  encodeBrowseCursor,
  filterOptions,
  hasNextPage,
  planBrowse,
} from '../src/providers/itch/browse';
import { parseGameCells } from '../src/providers/itch/library';

const FIXTURE = readFileSync(path.join(import.meta.dir, 'fixtures', 'itch-search.html'), 'utf8');
const BASE = 'https://itch.io/search?q=alpha';

const PAGE_TWO = `<!doctype html><html><body>
  <div class="game_cell" data-game_id="505">
    <div class="game_thumb"><a class="thumb_link" href="https://studio-e.itch.io/epsilon"><img src="https://img.itch.zone/epsilon.png" /></a></div>
    <div class="game_cell_data">
      <div class="game_title"><a class="title" href="https://studio-e.itch.io/epsilon">Epsilon</a></div>
      <div class="game_author"><a href="https://studio-e.itch.io">Studio E</a></div>
    </div>
  </div>
</body></html>`;

function params(extra: Partial<BrowseParams> = {}): BrowseParams {
  return { source: 'itch', limit: 10, ...extra };
}

function fakeHost(fetchImpl: typeof fetch): HostServices {
  return {
    http: new HttpClient(fetchTransport(fetchImpl)),
    settings: async () => readSettings({}),
    storage: {
      async get() {
        return null;
      },
      async set() {},
    },
    secrets: {
      async get() {
        return null;
      },
      async set() {},
      async delete() {},
    },
    dump() {},
    log() {},
  };
}

describe('browse URL', () => {
  test('defaults to the popular top-games page', () => {
    const url = new URL(buildBrowseUrl(planBrowse(params())));
    expect(url.origin + url.pathname).toBe('https://itch.io/search');
    expect(url.searchParams.get('q')).toBeNull();
    expect(url.searchParams.get('page')).toBeNull();
    expect(url.searchParams.get('sort')).toBe('popular');
    expect(url.searchParams.has('price')).toBe(false);
    expect(url.searchParams.has('facets')).toBe(false);
    expect(url.searchParams.has('classification')).toBe(false);
  });

  test('sends the query, page, sort, price and classification values', () => {
    const plan = planBrowse(
      params({
        query: '  pixel art  ',
        sort: 'new',
        filters: { price: 'free', classification: 'mods', unknown: 'ignored' },
      }),
    );
    const url = new URL(buildBrowseUrl(plan, 2));
    expect(url.searchParams.get('q')).toBe('pixel art');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('sort')).toBe('new');
    expect(url.searchParams.get('price')).toBe('free');
    expect(url.searchParams.get('facets')).toBe('m.free');
    expect(url.searchParams.get('classification')).toBe('game_mod');
  });

  test('maps the classification and price choices the search page understands', () => {
    const assets = new URL(buildBrowseUrl(planBrowse(params({ filters: { classification: 'assets' } }))));
    expect(assets.searchParams.get('classification')).toBe('assets');

    const paid = new URL(buildBrowseUrl(planBrowse(params({ filters: { price: 'paid' } }))));
    expect(paid.searchParams.get('price')).toBe('paid');
    expect(paid.searchParams.get('facets')).toBe('m.paid');
  });

  test('ignores unknown sort, filter values and booleans', () => {
    const plan = planBrowse(
      params({ sort: 'bogus', filters: { price: 'bogus', classification: true, engine: 'unity' } }),
    );
    expect(plan.sort).toBe('popular');
    expect(plan.price).toBe('all');
    expect(plan.classification).toBeNull();
  });

  test('accepts a list of values for a group', () => {
    const plan = planBrowse(params({ filters: { price: ['paid'], classification: ['assets'] } }));
    expect(plan.price).toBe('paid');
    expect(plan.classification).toBe('assets');
  });
});

describe('search card parsing', () => {
  const games = parseGameCells(FIXTURE, BASE);

  test('parses every game cell with the title link and lazy cover', () => {
    expect(games).toHaveLength(4);
    expect(games[0]).toMatchObject({
      source: 'itch',
      sourceId: '101',
      url: 'https://studio-a.itch.io/alpha',
      title: 'Alpha Quest',
      developer: 'Studio A',
      coverUrl: 'https://img.itch.zone/alpha-cover.png',
      descriptionHtml: '<p>A short &amp; sweet platformer.</p>',
      tags: [],
      engine: null,
      version: null,
      status: 'unknown',
      updatedAt: null,
    });
    expect(games[0].extra).toMatchObject({ fromListing: true, price: '$4.99' });
  });

  test('falls back to the URL for the id, src for the cover, and the title for the description', () => {
    expect(games[1]).toMatchObject({
      sourceId: 'studio-b/beta',
      url: 'https://studio-b.itch.io/beta',
      title: 'Beta Build',
      developer: 'Studio B',
      coverUrl: 'https://img.itch.zone/beta-thumb.png',
      descriptionHtml: null,
    });
    expect(games[2]).toMatchObject({
      sourceId: '303',
      coverUrl: 'https://img.itch.zone/gamma-cover.png',
      extra: { fromListing: true, price: 'Sale' },
    });
    expect(games[3]).toMatchObject({
      sourceId: '404',
      title: 'Delta',
      developer: 'Delta Team',
      coverUrl: null,
      descriptionHtml: '<p>A tiny game</p>',
    });
  });

  test('skips a blank card and an empty page gives no games', () => {
    const noTitle = '<div class="game_cell"><div class="game_title"><a class="title" href="/x"></a></div></div>';
    expect(parseGameCells(noTitle, BASE)).toEqual([]);
    expect(parseGameCells('<html><body></body></html>', BASE)).toEqual([]);
  });
});

describe('next page evidence', () => {
  test('follows a pager next link, not a filter link', () => {
    expect(hasNextPage(FIXTURE, 1)).toBe(true);
    expect(hasNextPage(FIXTURE, 2)).toBe(false);
    expect(hasNextPage('<a href="/search?q=alpha&amp;page=2&amp;facets=c.1">Games</a>', 1)).toBe(false);
    expect(hasNextPage('<html></html>', 1)).toBe(false);
  });

  test('cursor round-trips only for the same query', () => {
    const plan = planBrowse(params({ query: 'alpha', filters: { price: 'free' } }));
    const cursor = encodeBrowseCursor(plan, { page: 2, offset: 4 });
    expect(decodeBrowseCursor(plan, cursor)).toEqual({ page: 2, offset: 4 });
    expect(() => decodeBrowseCursor(plan, 'not-a-cursor')).toThrow('invalid_cursor');
    const other = planBrowse(params({ query: 'beta', filters: { price: 'free' } }));
    expect(() => decodeBrowseCursor(other, cursor)).toThrow('invalid_cursor');
  });
});

describe('listFilters options', () => {
  test('offers every static group and narrows by its search box', () => {
    expect(filterOptions('sort', '', 200).map((option) => option.value)).toEqual(['popular', 'new', 'updated']);
    expect(filterOptions('price', '', 200).map((option) => option.value)).toEqual(['all', 'free', 'paid']);
    expect(filterOptions('classification', '', 200).map((option) => option.value)).toEqual([
      'games',
      'assets',
      'mods',
    ]);
    expect(filterOptions('price', 'pa', 200)).toEqual([{ value: 'paid', label: 'Paid' }]);
    expect(filterOptions('price', '', 1)).toHaveLength(1);
    expect(filterOptions('unknown', '', 200)).toEqual([]);
  });
});

describe('createItchProvider browse', () => {
  function browseFetch(): { fetch: typeof fetch; urls: string[] } {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      const page = new URL(url).searchParams.get('page');
      return new Response(page === '2' ? PAGE_TWO : FIXTURE, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }) as typeof fetch;
    return { fetch: fetchImpl, urls };
  }

  test('is declared as a capability', () => {
    const provider = createItchProvider(fakeHost(browseFetch().fetch));
    expect(provider.capabilities.browse).toBe(true);
  });

  test('returns games, spends the rest of a page through its cursor, then follows page 2', async () => {
    const { fetch, urls } = browseFetch();
    const provider = createItchProvider(fakeHost(fetch));
    const query = {
      source: 'itch',
      query: 'alpha',
      filters: { price: 'free', classification: 'mods' },
      sort: 'new',
      limit: 2,
    } as const;

    const first = await provider.browse(query);
    expect(first.games.map((game) => game.title)).toEqual(['Alpha Quest', 'Beta Build']);
    expect(first.games[0].source).toBe('itch');
    expect(first.nextCursor).toBeString();

    const firstUrl = new URL(urls[0]);
    expect(firstUrl.searchParams.get('q')).toBe('alpha');
    expect(firstUrl.searchParams.get('sort')).toBe('new');
    expect(firstUrl.searchParams.get('price')).toBe('free');
    expect(firstUrl.searchParams.get('facets')).toBe('m.free');
    expect(firstUrl.searchParams.get('classification')).toBe('game_mod');
    expect(firstUrl.searchParams.has('page')).toBe(false);

    const second = await provider.browse({ ...query, cursor: first.nextCursor });
    expect(second.games.map((game) => game.title)).toEqual(['Gamma Toolkit', 'Delta']);
    expect(second.nextCursor).toBeString();
    expect(new URL(urls[1]).searchParams.has('page')).toBe(false);

    const third = await provider.browse({ ...query, cursor: second.nextCursor });
    expect(third.games.map((game) => game.title)).toEqual(['Epsilon']);
    expect(third.nextCursor).toBeUndefined();
    expect(new URL(urls[2]).searchParams.get('page')).toBe('2');
  });

  test('never returns more games than the limit', async () => {
    const { fetch } = browseFetch();
    const provider = createItchProvider(fakeHost(fetch));
    expect((await provider.browse(params({ query: 'alpha', limit: 1 }))).games).toHaveLength(1);
  });

  test('an empty search page gives no games and no cursor', async () => {
    const empty = (async (_input: string | URL | Request) =>
      new Response('<html><body></body></html>')) as typeof fetch;
    const provider = createItchProvider(fakeHost(empty));
    expect(await provider.browse(params({ query: 'nothing' }))).toEqual({ games: [] });
  });

  test('rejects a cursor from another query', async () => {
    const { fetch } = browseFetch();
    const provider = createItchProvider(fakeHost(fetch));
    const first = await provider.browse(params({ query: 'alpha', limit: 2 }));
    await expect(
      provider.browse(params({ query: 'beta', limit: 2, cursor: first.nextCursor })),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidCursor, message: 'invalid_cursor' });
  });

  test('reports an HTTP failure', async () => {
    const failing = (async (_input: string | URL | Request) =>
      new Response('nope', { status: 503 })) as typeof fetch;
    const provider = createItchProvider(fakeHost(failing));
    await expect(provider.browse(params({ query: 'alpha' }))).rejects.toThrow('HTTP 503');
  });

  test('serves the static filter groups through source.listFilters', async () => {
    const provider = createItchProvider(fakeHost(browseFetch().fetch));
    expect(await provider.listFilters({ source: 'itch', group: 'sort', limit: 200 })).toEqual({
      options: [
        { value: 'popular', label: 'Popular' },
        { value: 'new', label: 'New' },
        { value: 'updated', label: 'Updated' },
      ],
    });
    expect(await provider.listFilters({ source: 'itch', group: 'price', query: 'fr', limit: 200 })).toEqual({
      options: [{ value: 'free', label: 'Free' }],
    });
    expect(await provider.listFilters({ source: 'itch', group: 'classification', limit: 2 })).toEqual({
      options: [
        { value: 'games', label: 'Games' },
        { value: 'assets', label: 'Assets' },
      ],
    });
    expect(await provider.listFilters({ source: 'itch', group: 'missing', limit: 200 })).toEqual({
      options: [],
    });
  });
});
