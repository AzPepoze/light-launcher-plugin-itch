/**
 * Typed plugin settings. The values come from settings.get; each one falls back to its
 * default when it is missing or not valid. Defaults match settings.schema.json.
 */

import {
  boolOr,
  intInRange,
  parseDownloadSettings,
  textOr,
} from '@light-launcher/plugin-sdk/helpers';
import type { DownloadRoot, DownloadSettings, Platform } from '@light-launcher/plugin-sdk/types';

export const PREFERRED_PLATFORMS = ['any', 'windows', 'linux', 'osx'] as const;
export type PreferredPlatform = (typeof PREFERRED_PLATFORMS)[number];

export interface PluginSettings {
  downloadRoot: DownloadRoot;
  gameSubfolder: boolean;
  installAfterDownload: boolean;
  deleteArchiveAfterInstall: boolean;
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
  downloadRoot: 'downloads',
  gameSubfolder: true,
  installAfterDownload: false,
  deleteArchiveAfterInstall: false,
  preferredPlatform: 'any',
  skipSoundtracksAndExtras: false,
  syncOwnedGames: true,
  syncIntervalHours: 0,
  updateCheckIntervalHours: 0,
  requestDelayMs: 1000,
  userAgent: '',
  verboseLogging: false,
  dumpDir: '',
};

const MAX_HOURS = 720;
const MAX_DELAY_MS = 10_000;
const hoursInRange = intInRange(0, MAX_HOURS);
const delayInRange = intInRange(0, MAX_DELAY_MS);

function platformOr(value: unknown, fallback: PreferredPlatform): PreferredPlatform {
  return PREFERRED_PLATFORMS.find((option) => option === value) ?? fallback;
}

/** The raw settings from the host: every known key is optional and may hold any value. */
type SettingsInput = { [K in keyof PluginSettings]?: unknown };

/** Reads the saved values, using the default for anything missing or invalid. */
export function settingsFrom(raw: SettingsInput): PluginSettings {
  return {
    ...parseDownloadSettings(raw as Record<string, unknown>),
    preferredPlatform: platformOr(raw.preferredPlatform, DEFAULT_SETTINGS.preferredPlatform),
    skipSoundtracksAndExtras: boolOr(raw.skipSoundtracksAndExtras, DEFAULT_SETTINGS.skipSoundtracksAndExtras),
    syncOwnedGames: boolOr(raw.syncOwnedGames, DEFAULT_SETTINGS.syncOwnedGames),
    syncIntervalHours: hoursInRange(raw.syncIntervalHours, DEFAULT_SETTINGS.syncIntervalHours),
    updateCheckIntervalHours: hoursInRange(
      raw.updateCheckIntervalHours,
      DEFAULT_SETTINGS.updateCheckIntervalHours,
    ),
    requestDelayMs: delayInRange(raw.requestDelayMs, DEFAULT_SETTINGS.requestDelayMs),
    userAgent: textOr(raw.userAgent, DEFAULT_SETTINGS.userAgent),
    verboseLogging: boolOr(raw.verboseLogging, DEFAULT_SETTINGS.verboseLogging),
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

/** The four download settings, in the shape the SDK's downloadHints reads. */
export function downloadSettingsOf(settings: PluginSettings): DownloadSettings {
  return {
    downloadRoot: settings.downloadRoot,
    gameSubfolder: settings.gameSubfolder,
    installAfterDownload: settings.installAfterDownload,
    deleteArchiveAfterInstall: settings.deleteArchiveAfterInstall,
  };
}
