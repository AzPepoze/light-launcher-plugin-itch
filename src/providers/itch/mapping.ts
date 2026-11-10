/**
 * itch.io payload -> GameDTO mapping. No network here; pure enough to unit test.
 */

import type { GameDTO, GameStatus } from '@light-launcher/plugin-sdk/types';
import { isDemo, versionFromUpload, type ItchUpload } from './uploads';

export interface ItchUser {
  id?: number;
  username?: string;
  display_name?: string;
}

export interface ItchGamePayload {
  id: number;
  title?: string;
  url?: string;
  short_text?: string;
  description?: string;
  cover_url?: string;
  tags?: string[] | { name?: string }[];
  traits?: string[];
  user?: ItchUser;
  classification?: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MapGameOptions {
  /** newest upload, if the caller already fetched uploads */
  upload?: ItchUpload | null;
  /** ref id (numeric or `user/slug`) used when the payload has no id */
  fallbackId?: string;
  /** page url used when the payload has no `url` */
  pageUrl?: string;
}

const ENGINE_TRAITS: [string[], string][] = [
  [['unity'], 'Unity'],
  [['renpy', 'ren_py'], "Ren'Py"],
  [['godot'], 'Godot'],
  [['unreal', 'ue4', 'ue5'], 'Unreal Engine'],
  [['gamemaker', 'gms'], 'GameMaker'],
  [['rpgmaker', 'rpg_maker'], 'RPG Maker'],
  [['construct'], 'Construct'],
  [['love', 'love2d'], 'LÖVE'],
  [['monogame'], 'MonoGame'],
  [['html', 'html5', 'web'], 'HTML5'],
  [['flash'], 'Flash'],
  [['java'], 'Java'],
  [['pico8'], 'PICO-8'],
];

const FLAG_TRAITS = new Set([
  'demo',
  'has_demo',
  'can_be_bought',
  'in_press_system',
  'preorder',
  'p_windows',
  'p_linux',
  'p_osx',
  'p_mac',
  'p_android',
]);

function traitsOf(game: ItchGamePayload): string[] {
  return Array.isArray(game.traits)
    ? game.traits.filter((t): t is string => typeof t === 'string')
    : [];
}

export function engineFromTraits(traits: string[] | null | undefined): string | null {
  const set = new Set((traits ?? []).map((t) => t.toLowerCase()));
  for (const [keys, label] of ENGINE_TRAITS) {
    if (keys.some((key) => set.has(key))) return label;
  }
  return null;
}

export function platformsFromTraits(traits: string[] | null | undefined): string[] {
  const set = new Set(traits ?? []);
  const out: string[] = [];
  if (set.has('p_windows')) out.push('windows');
  if (set.has('p_linux')) out.push('linux');
  if (set.has('p_osx') || set.has('p_mac')) out.push('mac');
  if (set.has('p_android')) out.push('android');
  return out;
}

function statusFromTraits(traits: string[]): GameStatus {
  const set = new Set(traits.map((t) => t.toLowerCase()));
  if (set.has('status_ongoing') || set.has('ongoing')) return 'ongoing';
  if (set.has('status_completed') || set.has('completed')) return 'completed';
  if (set.has('status_abandoned') || set.has('abandoned')) return 'abandoned';
  if (set.has('status_onhold') || set.has('onhold')) return 'onhold';
  return 'unknown';
}

function tagNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const name = typeof item === 'string'
      ? item
      : item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
        ? (item as { name: string }).name
        : '';
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function tagsFromGame(game: ItchGamePayload): string[] {
  const explicit = tagNames(game.tags);
  if (explicit.length) return explicit;
  return traitsOf(game)
    .filter((t) => !FLAG_TRAITS.has(t.toLowerCase()) && !t.toLowerCase().startsWith('status_'))
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 12);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function mapGame(game: ItchGamePayload, opts: MapGameOptions = {}): GameDTO {
  const traits = traitsOf(game);
  const upload = opts.upload ?? null;
  const numericId = Number(game.id);
  const sourceId = Number.isFinite(numericId) && numericId > 0
    ? String(numericId)
    : (opts.fallbackId ?? String(game.id ?? ''));

  let url = game.url ?? '';
  if (!url && opts.pageUrl && /^https?:\/\//i.test(opts.pageUrl)) url = opts.pageUrl;
  if (!url && opts.fallbackId && opts.fallbackId.includes('/')) url = `https://${opts.fallbackId}`;
  if (!url) url = `https://itch.io/games/${sourceId}`;

  const shortText = (game.short_text ?? '').trim();
  const descriptionHtml = shortText
    ? `<p>${escapeHtml(shortText)}</p>`
    : (game.description?.trim() || null);

  return {
    source: 'itch',
    sourceId,
    url,
    title: game.title?.trim() || `itch game ${sourceId}`,
    version: upload ? versionFromUpload(upload) : null,
    developer: game.user?.display_name?.trim() || game.user?.username?.trim() || null,
    engine: engineFromTraits(traits),
    tags: tagsFromGame(game),
    coverUrl: game.cover_url ?? null,
    screenshots: [],
    descriptionHtml,
    changelog: null,
    rating: null,
    status: statusFromTraits(traits),
    // newest upload wins so a fresh fetch does not immediately look outdated
    updatedAt: upload?.created_at ?? game.updated_at ?? game.published_at ?? null,
    extra: {
      gameId: Number.isFinite(numericId) ? numericId : null,
      uploadId: upload?.id ?? null,
      uploadFilename: upload?.filename ?? null,
      platforms: platformsFromTraits(traits),
      traits,
      demo: traits.includes('demo') || (upload ? isDemo(upload) : false),
      classification: game.classification ?? null,
    },
  };
}
