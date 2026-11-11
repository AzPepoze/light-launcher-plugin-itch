/**
 * Typed plugin settings. The values come from settings.get; each one falls back to its
 * default when it is missing or not valid. Defaults match settings.schema.json.
 */

import type { Platform } from '@light-launcher/plugin-sdk/types';

export const PREFERRED_PLATFORMS = ['any', 'windows', 'linux', 'osx'] as const;
export type PreferredPlatform = (typeof PREFERRED_PLATFORMS)[number];

export interface PluginSettings {
  preferredPlatform: PreferredPlatform;
  skipSoundtracksAndExtras: boolean;
  syncOwnedGames: boolean;
  syncIntervalHours: number;
  updateCheckIntervalHours: number;
  requestDelayMs: number;
  userAgent: string;
  verboseLogging: boolean;
  dumpDir: string;
}

export const DEFAULT_SETTINGS: Readonly<PluginSettings> = {
  preferredPlatform: 'any',
  skipSoundtracksAndExtras: false,
  syncOwnedGames: true,
  syncIntervalHours: 0,
  updateCheckIntervalHours: 0,
  requestDelayMs: 0,
  userAgent: '',
  verboseLogging: false,
  dumpDir: '',
};

const MAX_HOURS = 720;
const MAX_DELAY_MS = 10_000;

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function integerInRange(value: unknown, max: number, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max
    ? (value as number)
    : fallback;
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function platformOr(value: unknown, fallback: PreferredPlatform): PreferredPlatform {
  return PREFERRED_PLATFORMS.find((option) => option === value) ?? fallback;
}

/** Reads the saved values, using the default for anything missing or invalid. */
export function readSettings(raw: Partial<Record<keyof PluginSettings, unknown>>): PluginSettings {
  return {
    preferredPlatform: platformOr(raw.preferredPlatform, DEFAULT_SETTINGS.preferredPlatform),
    skipSoundtracksAndExtras: booleanOr(raw.skipSoundtracksAndExtras, DEFAULT_SETTINGS.skipSoundtracksAndExtras),
    syncOwnedGames: booleanOr(raw.syncOwnedGames, DEFAULT_SETTINGS.syncOwnedGames),
    syncIntervalHours: integerInRange(raw.syncIntervalHours, MAX_HOURS, DEFAULT_SETTINGS.syncIntervalHours),
    updateCheckIntervalHours: integerInRange(
      raw.updateCheckIntervalHours,
      MAX_HOURS,
      DEFAULT_SETTINGS.updateCheckIntervalHours,
    ),
    requestDelayMs: integerInRange(raw.requestDelayMs, MAX_DELAY_MS, DEFAULT_SETTINGS.requestDelayMs),
    userAgent: textOr(raw.userAgent, DEFAULT_SETTINGS.userAgent),
    verboseLogging: booleanOr(raw.verboseLogging, DEFAULT_SETTINGS.verboseLogging),
    dumpDir: textOr(raw.dumpDir, DEFAULT_SETTINGS.dumpDir),
  };
}

const PLATFORM_BY_SETTING: Record<Exclude<PreferredPlatform, 'any'>, Platform> = {
  windows: 'windows',
  linux: 'linux',
  osx: 'mac',
};

/** The file platform to list first, or null when the setting is "any". */
export function preferredFilePlatform(setting: PreferredPlatform): Platform | null {
  return setting === 'any' ? null : PLATFORM_BY_SETTING[setting];
}
