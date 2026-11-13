/**
 * itch.io provider.
 *
 * Credential: a personal itch.io API key, stored by the host in its keyring under
 * `apikey`. The key is read once, on first use, and cached in memory. Setting or
 * clearing it updates both the keyring and the cache.
 */

import type {
  AuthState,
  FileCandidate,
  GameDTO,
  GameRef,
  ListGamesParams,
  ListGamesResult,
  Platform,
  PrepareDownloadResult,
  Ref,
  UpdateInfo,
} from '@light-launcher/plugin-sdk/types';
import type { ListOptions, SourceProvider } from '@light-launcher/plugin-sdk/runtime';
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
  isSoundtrack,
  pickNewest,
  preferPlatform,
  versionFromUpload,
  type ItchUpload,
  type UploadPlatform,
} from './uploads';
import { downloadSettingsOf, preferredFilePlatform, type PreferredPlatform } from '../../settings';
import { downloadHints } from '@light-launcher/plugin-sdk';
import { ErrorCode, RpcFailure } from '@light-launcher/plugin-sdk/types';

const SECRET_KEY = 'apikey';
const MAX_SYNC_GAMES = 40;
const LIBRARY_CACHE_KEY = 'library-cache';
const UPDATE_CHECKED_PREFIX = 'update-checked:';
const HOUR_MS = 60 * 60 * 1000;
/** How long the owned game ids are reused while the launcher pages through the list */
const OWNED_IDS_TTL_MS = 10 * 60 * 1000;

interface LibraryCache {
  syncedAt: number;
  games: GameDTO[];
}

function isLibraryCache(value: unknown): value is LibraryCache {
  if (!value || typeof value !== 'object') return false;
  const cache = value as Partial<LibraryCache>;
  return typeof cache.syncedAt === 'number' && Array.isArray(cache.games);
}

/** true when a time stamp in ms is less than `hours` old */
function isFresh(stampMs: number, hours: number): boolean {
  return Date.now() - stampMs < hours * HOUR_MS;
}

export interface ItchProvider extends SourceProvider {
  readonly label: string;
  /** stores a key without checking it online */
  importCredential(value: string): Promise<void>;
  listGames(params: ListGamesParams): Promise<ListGamesResult>;
}

function toPlatform(platform: UploadPlatform): Platform {
  return platform === 'other' ? 'unknown' : platform;
}

function withoutExtras(uploads: ItchUpload[], skip: boolean): ItchUpload[] {
  return skip ? uploads.filter((upload) => !isSoundtrack(upload)) : uploads;
}

/** Moves files for the preferred platform to the front. Keeps the order inside each group. */
function preferredFirst(files: FileCandidate[], setting: PreferredPlatform): FileCandidate[] {
  const wanted = preferredFilePlatform(setting);
  if (!wanted) return files;
  return [
    ...files.filter((file) => file.platform === wanted),
    ...files.filter((file) => file.platform !== wanted),
  ];
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

/** The listing cursor is the offset of the next owned game. Missing means the first page. */
function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  if (!/^\d+$/.test(cursor)) throw new Error(`invalid listGames cursor: ${cursor}`);
  return Number(cursor);
}

function unconfigured(): AuthState {
  return { status: 'unconfigured', checkedAt: new Date().toISOString() };
}

export function createItchProvider(host: HostServices): ItchProvider {
  /** undefined until the first read from host secrets */
  let key: string | null | undefined;

  async function currentKey(): Promise<string | null> {
    if (key === undefined) key = (await host.secrets.get(SECRET_KEY))?.trim() || null;
    return key;
  }

  async function requireKey(): Promise<string> {
    const apiKey = await currentKey();
    if (!apiKey) throw new RpcFailure(ErrorCode.AuthRequired, 'itch.io needs an API key');
    return apiKey;
  }

  /** owned game ids, reused for OWNED_IDS_TTL_MS so the pages of one listing share one walk */
  let ownedCache: { at: number; ids: number[] } | null = null;

  async function ownedIds(apiKey: string): Promise<number[]> {
    if (ownedCache && Date.now() - ownedCache.at < OWNED_IDS_TTL_MS) return ownedCache.ids;
    const ids = await ownedGameIds(host, apiKey);
    ownedCache = { at: Date.now(), ids };
    return ids;
  }

  async function storeKey(value: string): Promise<void> {
    await host.secrets.set(SECRET_KEY, value);
    key = value;
    ownedCache = null;
  }

  async function authStatus(): Promise<AuthState> {
    const apiKey = await currentKey();
    if (!apiKey) return unconfigured();
    return checkKey(host, apiKey);
  }

  async function setCredential(value: string): Promise<AuthState> {
    const trimmed = value.trim();
    if (!trimmed) return clearCredential();
    const state = await checkKey(host, trimmed);
    if (state.status === 'ok') await storeKey(trimmed);
    return state;
  }

  async function clearCredential(): Promise<AuthState> {
    await host.secrets.delete(SECRET_KEY);
    key = null;
    ownedCache = null;
    return unconfigured();
  }

  async function fetchGame(ref: Ref): Promise<GameDTO> {
    const gameId = await resolveGameId(host, ref);
    const game = await fetchGamePayload(host, gameId, await requireKey());
    const uploads = await fetchUploads(host, gameId, await requireKey());
    return mapGame(game, {
      upload: pickNewest(uploads),
      fallbackId: ref.id,
      pageUrl: ref.url,
    });
  }

  async function fetchList(opts: ListOptions): Promise<GameDTO[]> {
    const target = opts.url?.trim();
    if (!target || !isItchUrl(target)) return [];
    let res;
    try {
      res = await host.http.request(target, { headers: { Accept: 'text/html' } });
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
    const apiKey = await requireKey();
    const gameId = await gameIdOf(host, game);
    const downloadKeyId = await ownedDownloadKeyId(host, gameId, apiKey);
    const uploads = await fetchUploads(host, gameId, apiKey);
    if (!uploads.length) throw noUploadsError(downloadKeyId);
    const settings = await host.settings();
    const params = downloadKeyParams(downloadKeyId);
    const files = chooseUploads(withoutExtras(uploads, settings.skipSoundtracksAndExtras)).map((upload) => {
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
    return preferredFirst(files, settings.preferredPlatform);
  }

  async function prepareDownload(
    file: FileCandidate,
    game: GameRef,
  ): Promise<PrepareDownloadResult> {
    const settings = await host.settings();
    return { url: file.url, headers: {}, ...downloadHints(downloadSettingsOf(settings), game) };
  }

  async function checkUpdate(game: GameRef): Promise<UpdateInfo | null> {
    const settings = await host.settings();
    const stampKey = `${UPDATE_CHECKED_PREFIX}${game.sourceId}`;
    if (await checkedRecently(stampKey, settings.updateCheckIntervalHours)) return null;
    const update = await findUpdate(game);
    if (settings.updateCheckIntervalHours > 0) await host.storage.set(stampKey, Date.now());
    return update;
  }

  /** true when the game was checked less than `hours` ago. Always false when hours is 0. */
  async function checkedRecently(stampKey: string, hours: number): Promise<boolean> {
    if (hours <= 0) return false;
    const last = await host.storage.get(stampKey);
    return typeof last === 'number' && isFresh(last, hours);
  }

  async function findUpdate(game: GameRef): Promise<UpdateInfo | null> {
    const uploads = await fetchUploads(host, await gameIdOf(host, game), await requireKey());
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

  /** Returns no games when syncOwnedGames is off. Reuses the last import within syncIntervalHours. */
  async function sync(): Promise<GameDTO[]> {
    const settings = await host.settings();
    if (!settings.syncOwnedGames) return [];
    const cached = await cachedLibrary(settings.syncIntervalHours);
    if (cached) return cached;
    const games = await importLibrary();
    if (settings.syncIntervalHours > 0) {
      await host.storage.set(LIBRARY_CACHE_KEY, { syncedAt: Date.now(), games });
    }
    return games;
  }

  /**
   * One page of the owned games. Each game costs two API calls, so a game that fails is
   * skipped, but the cursor still moves past it.
   */
  async function listGames({ cursor, limit }: ListGamesParams): Promise<ListGamesResult> {
    const apiKey = await requireKey();
    const ids = await ownedIds(apiKey);
    const start = offsetOf(cursor);
    const pageIds = ids.slice(start, start + limit);

    const games: GameDTO[] = [];
    for (const id of pageIds) {
      try {
        games.push(await fetchOwnedGame(id, apiKey));
      } catch (err) {
        host.log('warn', `itch.io list skipped game ${id}`, errorMessage(err));
      }
    }

    const next = start + pageIds.length;
    const nextCursor = next < ids.length ? String(next) : undefined;
    return { games, total: ids.length, nextCursor };
  }

  async function cachedLibrary(hours: number): Promise<GameDTO[] | null> {
    if (hours <= 0) return null;
    const cache = await host.storage.get(LIBRARY_CACHE_KEY);
    if (!isLibraryCache(cache) || !isFresh(cache.syncedAt, hours)) return null;
    return cache.games;
  }

  async function importLibrary(): Promise<GameDTO[]> {
    const apiKey = await requireKey();
    const ids = await ownedGameIds(host, apiKey);
    if (!ids.length) {
      host.log('warn', 'itch.io sync found no owned games; key may lack library scope');
      return [];
    }

    const games: GameDTO[] = [];
    for (const id of ids.slice(0, MAX_SYNC_GAMES)) {
      try {
        games.push(await fetchOwnedGame(id, apiKey));
      } catch (err) {
        host.log('warn', `itch.io sync skipped game ${id}`, errorMessage(err));
      }
    }
    return games;
  }

  /** One owned game as a GameDTO: its page payload plus the newest upload. Throws when either call fails. */
  async function fetchOwnedGame(id: number, apiKey: string): Promise<GameDTO> {
    const payload = await fetchGamePayload(host, id, apiKey);
    const uploads = await fetchUploads(host, id, apiKey);
    return mapGame(payload, { upload: pickNewest(uploads) });
  }

  return {
    id: 'itch',
    label: 'itch.io',
    capabilities: {
      browse: false,
      auth: 'apikey',
      updateCheck: true,
      resolveFiles: true,
      versioned: true,
      listGames: true,
    },
    parseRef: parseItchRef,
    authStatus,
    setCredential,
    clearCredential,
    importCredential: storeKey,
    fetchGame,
    fetchList,
    resolveFiles,
    prepareDownload,
    checkUpdate,
    sync,
    listGames,
  };
}

export { parseItchRef as parseRef } from './library';
