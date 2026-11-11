import type { GameRef, PrepareDownloadResult } from '@light-launcher/plugin-sdk/types';
import type { PluginSettings } from '../../settings';

/** Name used when nothing safe is left of the game title. */
export const FALLBACK_GAME_FOLDER = 'game';
const MAX_FOLDER_LENGTH = 80;
const UNSAFE_PATH_CHARS = /[/\\:*?"<>|\u0000-\u001f\u007f-\u009f]/g;

/** Makes a game title safe as one folder name under the download root. */
export function sanitizeGameFolder(title: string): string {
  const cleaned = title
    .replace(UNSAFE_PATH_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '');
  const capped = [...cleaned].slice(0, MAX_FOLDER_LENGTH).join('').trimEnd();
  return capped || FALLBACK_GAME_FOLDER;
}

type DownloadHints = Pick<
  PrepareDownloadResult,
  'root' | 'subfolder' | 'install' | 'installSubfolder' | 'deleteArchive'
>;

/** The prepareDownload result fields the host needs to queue the file. */
export function downloadHints(settings: PluginSettings, game: GameRef): DownloadHints {
  const hints: DownloadHints = { root: settings.downloadRoot };
  if (settings.gameSubfolder) hints.subfolder = sanitizeGameFolder(game.title);
  if (settings.installAfterDownload) {
    hints.install = true;
    if (hints.subfolder) hints.installSubfolder = hints.subfolder;
    hints.deleteArchive = settings.deleteArchiveAfterInstall;
  }
  return hints;
}
