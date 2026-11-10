/**
 * itch.io parsing helpers (refs, ids, owned keys, listing cards, URLs).
 * Kept free of network access so they can be unit tested directly.
 */

import type { GameDTO, Ref } from '../../vendor/types';
import { absUrl, load, txt } from '../../vendor/html';
import type { ItchGamePayload } from './mapping';

export const ITCH_API = 'https://api.itch.io';

export interface ItchGameResponse {
  game?: ItchGamePayload;
}

export interface ItchUploadsResponse {
  uploads?: import('./uploads').ItchUpload[];
}

const SLUG_RE = /(?:https?:\/\/)?([\w.-]+)\.itch\.io\/([\w-]+)/i;
const NUMERIC_PAGE_RE = /\/games\/(\d+)(?:[/?#]|$)/i;

function absoluteUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.itch\.io(\/|$)/i.test(raw)) return `https://${raw}`;
  return `https://itch.io${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function isItchHost(raw: string): boolean {
  try {
    const host = new URL(absoluteUrl(raw)).hostname.toLowerCase();
    return host === 'itch.io' || host.endsWith('.itch.io');
  } catch {
    return false;
  }
}

/** URL -> ref. Purely syntactic; returns null for anything not an itch game. */
export function parseItchRef(input: string): Ref | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    return { kind: 'game', id: raw, url: `https://itch.io/games/${raw}` };
  }

  const numeric = raw.match(NUMERIC_PAGE_RE);
  if (numeric) {
    // only itch hosts: `/games/123` on example.com belongs to someone else
    if (!raw.startsWith('/games/') && !isItchHost(raw)) return null;
    return { kind: 'game', id: numeric[1], url: absoluteUrl(raw) };
  }

  const slug = raw.match(SLUG_RE);
  if (!slug) return null;
  const user = slug[1].toLowerCase();
  const name = slug[2];
  return { kind: 'game', id: `${user}/${name}`, url: `https://${user}.itch.io/${name}` };
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

/** parse `div.game_cell` cards from an itch browse/search page */
export function parseGameCells(html: string, baseUrl: string): GameDTO[] {
  const doc = load(html);
  const out: GameDTO[] = [];
  doc('div.game_cell').each((_, el) => {
    const cell = doc(el);
    const img = cell.find('img').first();
    const coverUrl = absUrl(
      baseUrl,
      img.attr('data-lazy_src') ?? img.attr('data-src') ?? img.attr('src') ?? null,
    );
    const link = cell.find('a.title').first();
    const href = absUrl(baseUrl, link.attr('href') ?? null);
    const title = txt(cell.find('.title').first()) || txt(link);
    if (!title) return;
    const ref = href ? parseItchRef(href) : null;
    const sourceId = ref?.id ?? href ?? title;
    out.push({
      source: 'itch',
      sourceId,
      url: href ?? ref?.url ?? baseUrl,
      title,
      developer: txt(cell.find('.game_author').first()) || null,
      tags: [],
      coverUrl,
      screenshots: [],
      descriptionHtml: null,
      rating: null,
      status: 'unknown',
      version: null,
      updatedAt: null,
      extra: { fromListing: true },
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
