/**
 * itch.io parsing helpers (refs, ids, owned keys, listing cards, URLs).
 * Kept free of network access so they can be unit tested directly.
 */

import { absUrl, load, txt, type El } from '@light-launcher/plugin-sdk/helpers';
import type { GameDTO, Ref } from '@light-launcher/plugin-sdk/types';
import { escapeHtml, type ItchGamePayload } from './mapping';

const ITCH_API = 'https://api.itch.io';

export interface ItchGameResponse {
  game?: ItchGamePayload;
}

export interface ItchUploadsResponse {
  uploads?: import('./uploads').ItchUpload[];
}

const NUMERIC_PAGE_RE = /^\/games\/(\d+)\/?$/;
const SLUG_PATH_RE = /^\/([\w-]+)\/?$/;
const ITCH_ROOT = 'itch.io';

function absoluteUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.itch\.io(\/|$)/i.test(raw)) return `https://${raw}`;
  return `https://itch.io${raw.startsWith('/') ? '' : '/'}${raw}`;
}

/** URL -> ref. Purely syntactic; returns null for anything not an itch game. */
export function parseItchRef(input: string): Ref | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    return { kind: 'game', id: raw, url: `https://itch.io/games/${raw}` };
  }

  let url: URL;
  try {
    url = new URL(absoluteUrl(raw));
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (host !== ITCH_ROOT && !host.endsWith(`.${ITCH_ROOT}`)) return null;

  if (host === ITCH_ROOT || host === `www.${ITCH_ROOT}`) {
    const numeric = url.pathname.match(NUMERIC_PAGE_RE);
    if (!numeric) return null;
    return { kind: 'game', id: numeric[1], url: `https://itch.io/games/${numeric[1]}` };
  }

  // only a single user label in front of itch.io is a game page
  const user = host.slice(0, -`.${ITCH_ROOT}`.length);
  const slug = url.pathname.match(SLUG_PATH_RE);
  if (!user || user.includes('.') || !slug) return null;
  return {
    kind: 'game',
    id: `${user}/${slug[1]}`,
    url: `https://${user}.itch.io/${slug[1]}`,
  };
}

/** itch embeds its numeric game id in the public page, often as `data-game_id` */
export function parseGameIdFromHtml(html: string): number | null {
  const match = html.match(/(?:game_id|data-game_id)"?\s*[:=]\s*"?(\d+)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// owned keys
// ---------------------------------------------------------------------------

function gameIdOfKey(item: unknown): number | null {
  if (typeof item === 'number') return Number.isFinite(item) && item > 0 ? item : null;
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const nested = obj.game && typeof obj.game === 'object'
    ? (obj.game as Record<string, unknown>)
    : null;
  const raw = obj.game_id ?? obj.gameId ?? nested?.id ?? nested?.game_id ?? null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function itemsOf(bucket: unknown): unknown[] {
  if (Array.isArray(bucket)) return bucket;
  if (!bucket || typeof bucket !== 'object') return [];
  const obj = bucket as Record<string, unknown>;
  const inner = obj.items ?? obj.owned_keys ?? obj.ownedKeys ?? null;
  return Array.isArray(inner) ? inner : [];
}

/** tolerate the several shapes itch has used for `owned-keys` responses */
export function ownedKeyGameIds(payload: unknown): number[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const buckets = [obj.owned_keys, obj.items, obj.ownedKeys, obj.keys];
  const out: number[] = [];
  for (const bucket of buckets) {
    for (const item of itemsOf(bucket)) {
      const id = gameIdOfKey(item);
      if (id != null) out.push(id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// browse / search pages
// ---------------------------------------------------------------------------

function numericId(value: string | undefined | null): string | null {
  const raw = value?.trim() ?? '';
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? String(id) : null;
}

/** Text of the first matching element, or an empty string. Icons are not text. */
function textIn(cell: El, selector: string): string {
  const found = cell.find(selector).first();
  if (!found.length) return '';
  const copy = found.clone();
  copy.find('svg').remove();
  return txt(copy).trim();
}

/**
 * Parse `div.game_cell` cards from an itch browse/search page.
 *
 * The search page is plain HTML with no stable API. The title link is the game
 * page, `data-game_id` supplies the numeric source id when present, and the
 * cover is lazy-loaded through `data-lazy_src` (or `data-src`/`src`).
 */
export function parseGameCells(html: string, baseUrl: string): GameDTO[] {
  const doc = load(html);
  const out: GameDTO[] = [];
  doc('div.game_cell').each((_, el) => {
    const cell = doc(el);
    const link = cell.find('.game_title a.title, a.title').first();
    let href = absUrl(baseUrl, link.attr('href') ?? null);
    if (!href) {
      href = absUrl(baseUrl, cell.find('a.thumb_link, a.game_link').first().attr('href') ?? null);
    }
    const title = txt(link).trim() || txt(cell.find('.title').first()).trim();
    if (!title) return;

    const coverImg = cell.find('.game_thumb img').first().length
      ? cell.find('.game_thumb img').first()
      : cell.find('img').first();
    const coverUrl = absUrl(
      baseUrl,
      coverImg.attr('data-lazy_src') ?? coverImg.attr('data-src') ?? coverImg.attr('src') ?? null,
    );

    const ref = href ? parseItchRef(href) : null;
    const gameId = numericId(cell.attr('data-game_id')) ??
      numericId(cell.find('[data-game_id]').first().attr('data-game_id'));
    const sourceId = gameId ?? ref?.id ?? href ?? title;
    const description = textIn(cell, '.game_text') ||
      (cell.find('.game_text').first().attr('title') ?? '').trim();
    const price = textIn(cell, '.price_value') || textIn(cell, '.sale_tag');

    out.push({
      source: 'itch',
      sourceId,
      url: href ?? ref?.url ?? baseUrl,
      title,
      developer: textIn(cell, '.game_author a') || textIn(cell, '.game_author') || null,
      engine: null,
      tags: [],
      coverUrl,
      screenshots: [],
      descriptionHtml: description ? `<p>${escapeHtml(description)}</p>` : null,
      rating: null,
      status: 'unknown',
      version: null,
      updatedAt: null,
      extra: { fromListing: true, price: price || null },
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// urls
// ---------------------------------------------------------------------------

/** uploads are delivered through a 302 to the CDN; this is the stable entry point */
export function uploadDownloadUrl(
  uploadId: number,
  apiKey: string,
  params: Record<string, string> = {},
): string {
  return apiUrl(`/uploads/${uploadId}/download`, apiKey, params);
}

export function apiUrl(
  path: string,
  apiKey: string,
  params: Record<string, string> = {},
): string {
  const url = new URL(`${ITCH_API}${path.startsWith('/') ? path : `/${path}`}`);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export { mapGame, engineFromTraits, platformsFromTraits, tagsFromGame } from './mapping';
export type { ItchGamePayload, ItchUser, MapGameOptions } from './mapping';
