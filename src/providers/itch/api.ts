/**
 * Thin HTTP layer for the itch.io API. Every call takes the provider's current
 * key explicitly so this module remains stateless.
 */

import { HttpError } from '@light-launcher/plugin-sdk/helpers';
import type { AuthState, GameRef, Ref } from '@light-launcher/plugin-sdk/types';
import type { HostServices } from '../../host';
import {
  apiUrl,
  ownedKeyGameIds,
  parseGameIdFromHtml,
  type ItchGamePayload,
  type ItchGameResponse,
  type ItchUploadsResponse,
} from './library';
import type { ItchUpload } from './uploads';

const MAX_LIBRARY_PAGES = 40;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function statusOf(err: unknown): number {
  return err instanceof HttpError ? err.status : 0;
}

export async function checkKey(host: HostServices, value: string): Promise<AuthState> {
  const checkedAt = new Date().toISOString();
  try {
    const res = await host.http.request(apiUrl('/profile', value), {
      headers: { Accept: 'application/json' },
      retries: 0,
    });
    if (res.status === 401 || res.status === 403) {
      return { status: 'invalid', message: 'itch.io rejected the API key', checkedAt };
    }
    if (res.status !== 200) {
      return { status: 'error', message: `profile returned HTTP ${res.status}`, checkedAt };
    }
    const body = JSON.parse(res.text) as {
      user?: { username?: string; display_name?: string };
    };
    const user = body.user;
    if (!user) {
      return { status: 'invalid', message: 'profile response had no user', checkedAt };
    }
    return {
      status: 'ok',
      user: user.display_name?.trim() || user.username?.trim() || null,
      checkedAt,
    };
  } catch (err) {
    return { status: 'error', message: errorMessage(err), checkedAt };
  }
}

export async function fetchGamePayload(
  host: HostServices,
  gameId: number | string,
  key: string,
): Promise<ItchGamePayload> {
  const raw = await host.http.json<ItchGameResponse | ItchGamePayload>(apiUrl(`/games/${gameId}`, key));
  const game = (raw as ItchGameResponse)?.game ?? (raw as ItchGamePayload);
  const numeric = Number(game?.id);
  if (!game || !Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`itch.io returned no game payload for ${gameId}`);
  }
  return game;
}

function uploadsFailure(err: unknown): string {
  const status = statusOf(err);
  return status ? `HTTP ${status}: ${errorMessage(err)}` : errorMessage(err);
}

export async function fetchUploads(
  host: HostServices,
  gameId: number | string,
  key: string,
): Promise<ItchUpload[]> {
  try {
    const raw = await host.http.json<ItchUploadsResponse>(apiUrl(`/games/${gameId}/uploads`, key));
    return Array.isArray(raw?.uploads) ? raw.uploads : [];
  } catch (err) {
    host.log('warn', `itch uploads lookup failed for ${gameId}`, errorMessage(err));
    throw new Error(`itch.io uploads lookup for ${gameId} failed (${uploadsFailure(err)})`);
  }
}

/** numeric id from the ref, resolving the public page when given a slug */
export async function resolveGameId(host: HostServices, ref: Ref): Promise<number> {
  if (/^\d+$/.test(ref.id)) return Number(ref.id);
  const pageUrl = /^https?:\/\//i.test(ref.url) ? ref.url : `https://${ref.id}`;
  const res = await host.http.request(pageUrl, { headers: { Accept: 'text/html' } });
  if (res.status >= 400) {
    throw new Error(`itch.io page ${pageUrl} returned HTTP ${res.status}`);
  }
  const id = parseGameIdFromHtml(res.text);
  if (id == null) {
    host.dump(`game-page-${ref.id.replace(/\W+/g, '-')}`, res.text);
    throw new Error(`could not find an itch.io game id on ${pageUrl}`);
  }
  return id;
}

export async function gameIdOf(host: HostServices, game: GameRef): Promise<number> {
  const extraId = Number(game.extra?.gameId);
  if (Number.isFinite(extraId) && extraId > 0) return extraId;
  if (/^\d+$/.test(game.sourceId)) return Number(game.sourceId);
  return resolveGameId(host, { kind: 'game', id: game.sourceId, url: game.url });
}

/**
 * Walk `/profile/owned-keys` (capped) and return unique itch game ids.
 * Throws a specific message on 404 because that almost always means the key
 * was not minted with library scope.
 */
export async function ownedGameIds(host: HostServices, key: string): Promise<number[]> {
  const ids: number[] = [];
  const seen = new Set<number>();

  for (let page = 1; page <= MAX_LIBRARY_PAGES; page++) {
    let raw: unknown;
    try {
      raw = await host.http.json<unknown>(apiUrl('/profile/owned-keys', key, { page: String(page) }));
    } catch (err) {
      if (statusOf(err) === 404) {
        throw new Error(
          'itch.io returned 404 for /profile/owned-keys: this API key may not have ' +
            'library scope (use a key from the itch.io desktop app or account settings)',
        );
      }
      throw new Error(`itch.io owned-keys page ${page} failed: ${errorMessage(err)}`);
    }

    const pageIds = ownedKeyGameIds(raw);
    const fresh = pageIds.filter((id) => !seen.has(id));
    for (const id of fresh) {
      seen.add(id);
      ids.push(id);
    }
    if (!pageIds.length || !fresh.length) break;
  }

  return ids;
}

interface OwnedKeysResponse {
  owned_keys?: { id: number; game_id: number }[];
}

/** id of the account's owned download key for one game, or null when there is none or the lookup fails */
export async function ownedDownloadKeyId(
  host: HostServices,
  gameId: number,
  key: string,
): Promise<number | null> {
  try {
    const raw = await host.http.json<OwnedKeysResponse>(
      apiUrl('/profile/owned-keys', key, { game_ids: String(gameId) }),
    );
    const match = (raw?.owned_keys ?? []).find((item) => Number(item.game_id) === gameId);
    return match ? Number(match.id) : null;
  } catch (err) {
    host.log('warn', `itch owned-key lookup failed for ${gameId}`, errorMessage(err));
    return null;
  }
}
