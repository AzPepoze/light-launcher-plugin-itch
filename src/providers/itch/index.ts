/**
 * itch.io provider.
 *
 * Credential: a personal itch.io API key, given by the host at startup
 * (`host.credential`). `setCredential` only validates it and must not persist;
 * the host stores the secret.
 */

import type {
  AuthState,
  FileCandidate,
  GameDTO,
  GameRef,
  Platform,
  Provider,
  Ref,
  UpdateInfo,
} from '../../vendor/types';
import type { HostServices } from '../../host';
import {
  mapGame,
  parseGameCells,
  parseItchRef,
  uploadDownloadUrl,
} from './library';
import {
  checkKey,
  fetchGamePayload,
  fetchUploads,
  gameIdOf,
  ownedDownloadKeyId,
  ownedGameIds,
  resolveGameId,
} from './api';
import {
  chooseUploads,
  isDemo,
  pickNewest,
  preferPlatform,
  versionFromUpload,
  type UploadPlatform,
} from './uploads';

const MAX_SYNC_GAMES = 40;

function toPlatform(platform: UploadPlatform): Platform {
  return platform === 'other' ? 'unknown' : platform;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function downloadKeyParams(keyId: number | null): Record<string, string> {
  return keyId == null ? {} : { download_key_id: String(keyId) };
}

function noUploadsError(keyId: number | null): Error {
  if (keyId == null) {
    return new Error(
      'itch.io account does not own this game: add a download key or claim it on itch.io',
    );
  }
  return new Error('itch.io returned no uploads for this game');
}

function isItchUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'itch.io' || host.endsWith('.itch.io');
  } catch {
    return false;
  }
}

export function createItchProvider(host: HostServices): Provider {
  let key = host.credential?.trim() || null;

  function requireKey(): string {
    if (!key) throw new Error('itch.io API key is not configured');
    return key;
  }

  async function authStatus(): Promise<AuthState> {
    if (!key) return { status: 'unconfigured', checkedAt: new Date().toISOString() };
    return checkKey(host, key);
  }

  async function setCredential(value: string): Promise<AuthState> {
    const trimmed = value.trim();
    if (!trimmed) {
      key = null;
      return { status: 'unconfigured', checkedAt: new Date().toISOString() };
    }
    const state = await checkKey(host, trimmed);
    if (state.status === 'ok') key = trimmed;
    // Intentionally NOT persisted here: the API layer writes the secret and
    // recreates the provider, which re-reads it from the database.
    return state;
  }

  async function fetchGame(ref: Ref): Promise<GameDTO> {
    const gameId = await resolveGameId(host, ref);
    const game = await fetchGamePayload(host, gameId, requireKey());
    const uploads = await fetchUploads(host, gameId, requireKey());
    return mapGame(game, {
      upload: pickNewest(uploads),
      fallbackId: ref.id,
      pageUrl: ref.url,
    });
  }

  async function fetchList(opts: {
    url?: string;
    query?: string;
    page?: number;
  }): Promise<GameDTO[]> {
    const target = opts.url?.trim();
    if (!target || !isItchUrl(target)) return [];
    let res;
    try {
      res = await host.http.get(target, { headers: { Accept: 'text/html' } });
    } catch (err) {
      throw new Error(`itch.io listing failed: ${errorMessage(err)}`);
    }
    if (res.status >= 400) {
      throw new Error(`itch.io listing returned HTTP ${res.status}`);
    }
    const games = parseGameCells(res.text, res.url || target);
    if (!games.length) host.dump('listing', res.text);
    return games;
  }

  async function resolveFiles(game: GameRef): Promise<FileCandidate[]> {
    const apiKey = requireKey();
    const gameId = await gameIdOf(host, game);
    const downloadKeyId = await ownedDownloadKeyId(host, gameId, apiKey);
    const uploads = await fetchUploads(host, gameId, apiKey);
    if (!uploads.length) throw noUploadsError(downloadKeyId);
    const params = downloadKeyParams(downloadKeyId);
    return chooseUploads(uploads).map((upload) => {
      const platform = preferPlatform(upload);
      return {
        id: `itch-upload-${upload.id}`,
        label: `${upload.filename} (${platform}, ${isDemo(upload) ? 'demo' : 'full'})`,
        url: uploadDownloadUrl(upload.id, apiKey, params),
        filename: upload.filename || null,
        size: typeof upload.size === 'number' ? upload.size : null,
        host: 'api.itch.io',
        kind: 'direct' as const,
        platform: toPlatform(platform),
        requiresAuth: false,
        rangeHint: true,
        headers: {},
      };
    });
  }

  async function prepareDownload(
    file: FileCandidate,
    _game: GameRef,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    return { url: file.url, headers: {} };
  }

  async function checkUpdate(game: GameRef): Promise<UpdateInfo | null> {
    const uploads = await fetchUploads(host, await gameIdOf(host, game), requireKey());
    const newest = pickNewest(uploads);
    if (!newest) return null;

    const knownId = Number(game.extra?.uploadId);
    const idChanged = !Number.isFinite(knownId) || newest.id !== knownId;
    const created = Date.parse(newest.created_at ?? '');
    const knownAt = game.updatedAt ? Date.parse(game.updatedAt) : NaN;
    const timeMoved = Number.isFinite(created) && Number.isFinite(knownAt) && created > knownAt;

    if (!idChanged && !timeMoved) return null;
    return {
      version: versionFromUpload(newest),
      updatedAt: newest.created_at ?? null,
      changelog: null,
    };
  }

  async function sync(): Promise<GameDTO[]> {
    const ids = await ownedGameIds(host, requireKey());
    if (!ids.length) {
      host.log('warn', 'itch.io sync found no owned games; key may lack library scope');
      return [];
    }

    const games: GameDTO[] = [];
    for (const id of ids.slice(0, MAX_SYNC_GAMES)) {
      try {
        const payload = await fetchGamePayload(host, id, requireKey());
        const uploads = await fetchUploads(host, id, requireKey());
        games.push(mapGame(payload, { upload: pickNewest(uploads) }));
      } catch (err) {
        host.log('warn', `itch.io sync skipped game ${id}`, errorMessage(err));
      }
    }
    return games;
  }

  return {
    id: 'itch',
    label: 'itch.io',
    capabilities: {
      browse: true,
      auth: 'apikey',
      updateCheck: true,
      resolveFiles: true,
      versioned: true,
    },
    parseRef: parseItchRef,
    authStatus,
    setCredential,
    clearCredential() {
      key = null;
    },
    fetchGame,
    fetchList,
    resolveFiles,
    prepareDownload,
    checkUpdate,
    sync,
  };
}

export { parseItchRef as parseRef } from './library';
