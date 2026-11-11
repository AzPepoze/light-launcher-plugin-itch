import { describe, expect, test } from 'bun:test';
import { downloadHints, sanitizeGameFolder, FALLBACK_GAME_FOLDER } from '../src/providers/itch/downloads';
import { DEFAULT_SETTINGS, readSettings, type PluginSettings } from '../src/settings';

const GAME = {
  source: 'itch',
  sourceId: '2828037',
  url: 'https://krasuepi.itch.io/hotpw',
  title: 'Hot PW',
  version: null,
  updatedAt: null,
  extra: { gameId: 2828037 },
};

function settings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('downloadHints', () => {
  const cases: Array<[string, PluginSettings, ReturnType<typeof downloadHints>]> = [
    [
      'defaults',
      settings(),
      { root: 'downloads', subfolder: 'Hot PW' },
    ],
    [
      'no game subfolder',
      settings({ gameSubfolder: false }),
      { root: 'downloads' },
    ],
    [
      'games root',
      settings({ downloadRoot: 'games' }),
      { root: 'games', subfolder: 'Hot PW' },
    ],
    [
      'install with the launcher default for the archive',
      settings({ installAfterDownload: true }),
      {
        root: 'downloads',
        subfolder: 'Hot PW',
        install: true,
        installSubfolder: 'Hot PW',
        deleteArchive: false,
      },
    ],
    [
      'install and delete the archive',
      settings({ installAfterDownload: true, deleteArchiveAfterInstall: true }),
      {
        root: 'downloads',
        subfolder: 'Hot PW',
        install: true,
        installSubfolder: 'Hot PW',
        deleteArchive: true,
      },
    ],
    [
      'install without a game subfolder',
      settings({ installAfterDownload: true, gameSubfolder: false }),
      { root: 'downloads', install: true, deleteArchive: false },
    ],
  ];

  for (const [name, saved, expected] of cases) {
    test(name, () => {
      expect(downloadHints(saved, GAME)).toEqual(expected);
    });
  }

  test('reads the values it was given instead of the defaults', () => {
    expect(downloadHints(readSettings({ downloadRoot: 'games', gameSubfolder: false }), GAME)).toEqual({
      root: 'games',
    });
  });
});

describe('sanitizeGameFolder', () => {
  const cases: Array<[string, string, string]> = [
    ['plain title', 'Hot PW', 'Hot PW'],
    ['path separators', 'a/b\\c', 'abc'],
    ['windows reserved characters', 'a:b*c?d"e<f>g|h', 'abcdefgh'],
    ['control characters', 'a\u0000b\u001fc', 'abc'],
    ['dots only', '..', FALLBACK_GAME_FOLDER],
    ['leading dots and spaces', '  ...hidden  ', 'hidden'],
    ['collapses runs of spaces', 'Too   many    spaces', 'Too many spaces'],
    ['keeps emoji', 'Game 🎮 edition', 'Game 🎮 edition'],
    ['empty title', '   ', FALLBACK_GAME_FOLDER],
  ];

  for (const [name, title, expected] of cases) {
    test(name, () => {
      expect(sanitizeGameFolder(title)).toBe(expected);
    });
  }

  test('caps a very long title without splitting a character', () => {
    const long = '🎮'.repeat(200);
    const folder = sanitizeGameFolder(long);
    expect([...folder]).toHaveLength(80);
    expect(folder).toBe('🎮'.repeat(80));
  });
});
