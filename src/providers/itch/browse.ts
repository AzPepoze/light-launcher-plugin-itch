/**
 * itch.io search helpers: filter values, URL building, the page cursor and the
 * evidence a page gives that another page exists. The public search page is
 * HTML-only, so this module stays free of network access and is unit tested
 * against a synthetic fixture.
 */

import { createHash } from 'node:crypto';
import { load } from '@light-launcher/plugin-sdk/helpers';
import type {
  BrowseOrder,
  BrowseParams,
  FilterOption,
  FilterValue,
} from '@light-launcher/plugin-sdk/types';
import { ErrorCode, RpcFailure } from '@light-launcher/plugin-sdk/types';

export const SEARCH_URL = 'https://itch.io/search';

export type BrowseSort = 'popular' | 'new' | 'updated';
export type BrowsePrice = 'all' | 'free' | 'paid';
export type BrowseClassification = 'games' | 'assets' | 'mods';

export const SORT_OPTIONS: readonly FilterOption[] = [
  { value: 'popular', label: 'Popular' },
  { value: 'new', label: 'New' },
  { value: 'updated', label: 'Updated' },
];

export const PRICE_OPTIONS: readonly FilterOption[] = [
  { value: 'all', label: 'All prices' },
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
];

export const CLASSIFICATION_OPTIONS: readonly FilterOption[] = [
  { value: 'games', label: 'Games' },
  { value: 'assets', label: 'Assets' },
  { value: 'mods', label: 'Mods' },
];

/**
 * The search page names the project type with the singular `game` value and
 * calls game mods `game_mod`. The launcher sends our stable option values, so
 * the translation lives here.
 */
const CLASSIFICATION_PARAMS: Record<BrowseClassification, string> = {
  games: 'game',
  assets: 'assets',
  mods: 'game_mod',
};

/** One browse request. Page and offset come from the decoded cursor. */
export interface BrowsePlan {
  query: string;
  sort: BrowseSort;
  order: BrowseOrder;
  price: BrowsePrice;
  classification: BrowseClassification | null;
}

export interface BrowseCursor {
  /** 1-based search page */
  page: number;
  /** index inside the parsed cells of that page */
  offset: number;
}

const SORTS = new Set<string>(SORT_OPTIONS.map((option) => option.value));
const PRICES = new Set<string>(PRICE_OPTIONS.map((option) => option.value));
const CLASSIFICATIONS = new Set<string>(CLASSIFICATION_OPTIONS.map((option) => option.value));

function valueOf(value: FilterValue | undefined): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return null;
}

function sortOf(value: string | undefined): BrowseSort {
  const raw = value?.trim().toLowerCase() ?? '';
  return SORTS.has(raw) ? (raw as BrowseSort) : 'popular';
}

function priceOf(value: string | null): BrowsePrice {
  return value && PRICES.has(value) ? (value as BrowsePrice) : 'all';
}

function classificationOf(value: string | null): BrowseClassification | null {
  if (!value) return null;
  return CLASSIFICATIONS.has(value) ? (value as BrowseClassification) : null;
}

/** Reads the known filter keys. Unknown keys, values and boolean switches are ignored. */
export function planBrowse(params: BrowseParams): BrowsePlan {
  return {
    query: params.query?.trim() ?? '',
    sort: sortOf(params.sort),
    order: params.order === 'asc' ? 'asc' : 'desc',
    price: priceOf(valueOf(params.filters?.price)),
    classification: classificationOf(valueOf(params.filters?.classification)),
  };
}

/**
 * Builds a public search URL. `q` is left out for the top-games page, `page=1`
 * is the implicit first page, and a paid/free choice also sends the
 * `facets=m.*` value the search page itself uses for its price filter.
 */
export function buildBrowseUrl(plan: BrowsePlan, page = 1): string {
  const url = new URL(SEARCH_URL);
  if (plan.query) url.searchParams.set('q', plan.query);
  if (page > 1) url.searchParams.set('page', String(page));
  url.searchParams.set('sort', plan.sort);
  if (plan.price !== 'all') {
    url.searchParams.set('price', plan.price);
    url.searchParams.set('facets', `m.${plan.price}`);
  }
  if (plan.classification) {
    url.searchParams.set('classification', CLASSIFICATION_PARAMS[plan.classification]);
  }
  return url.toString();
}

function planKey(plan: BrowsePlan): string {
  return JSON.stringify([
    plan.query,
    plan.sort,
    plan.order,
    plan.price,
    plan.classification,
  ]);
}

/**
 * Cursors are opaque and tied to the filters that made them, so a cursor from
 * another query is rejected instead of returning the wrong page.
 */
export function encodeBrowseCursor(plan: BrowsePlan, cursor: BrowseCursor): string {
  const payload = {
    v: 1,
    f: createHash('sha256').update(planKey(plan)).digest('hex').slice(0, 16),
    p: cursor.page,
    o: cursor.offset,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeBrowseCursor(plan: BrowsePlan, cursor: string): BrowseCursor {
  try {
    const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      v?: unknown;
      f?: unknown;
      p?: unknown;
      o?: unknown;
    };
    const fingerprint = createHash('sha256').update(planKey(plan)).digest('hex').slice(0, 16);
    if (
      raw.v !== 1 ||
      raw.f !== fingerprint ||
      !Number.isInteger(raw.p) ||
      !Number.isInteger(raw.o) ||
      (raw.p as number) < 1 ||
      (raw.o as number) < 0
    ) {
      throw new Error('invalid cursor');
    }
    return { page: raw.p as number, offset: raw.o as number };
  } catch {
    throw new RpcFailure(ErrorCode.InvalidCursor, 'invalid_cursor');
  }
}

/**
 * True only when the page contains its own next-page link. The itch search page
 * has no pagination when first loaded, so absence means "stop" rather than
 * guessing and looping on the same cells.
 */
export function hasNextPage(html: string, page: number): boolean {
  const doc = load(html);
  let found = false;
  doc('a[rel="next"], link[rel="next"], .pagination a, .pager a, a.next').each((_, el) => {
    if (found) return;
    const href = doc(el).attr('href');
    if (!href) return;
    try {
      const target = new URL(href, SEARCH_URL);
      const next = Number(target.searchParams.get('page'));
      if (Number.isInteger(next) && next > page) found = true;
    } catch {
      // a malformed link cannot prove another page exists
    }
  });
  return found;
}

/** The static options of one browse group, optionally narrowed by its search box. */
export function filterOptions(group: string, query: string, limit: number): FilterOption[] {
  const options = group === 'sort'
    ? SORT_OPTIONS
    : group === 'price'
      ? PRICE_OPTIONS
      : group === 'classification'
        ? CLASSIFICATION_OPTIONS
        : [];
  const needle = query.trim().toLowerCase();
  const matching = needle
    ? options.filter(
        (option) =>
          option.value.toLowerCase().includes(needle) ||
          option.label.toLowerCase().includes(needle),
      )
    : options;
  const capped = Math.max(1, Math.min(200, Math.trunc(limit) || 1));
  return matching.slice(0, capped).map((option) => ({ ...option }));
}
