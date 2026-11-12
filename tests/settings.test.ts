import { describe, expect, test } from 'bun:test';
import { downloadSettingsSchemaProperties } from '@light-launcher/plugin-sdk';
import schemaFile from '../settings.schema.json';
import { DEFAULT_SETTINGS, readSettings, type PluginSettings } from '../src/settings';

type SettingSchema = {
  type: string;
  default: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  'x-ll-group'?: string;
};

const properties = schemaFile.properties as Record<string, SettingSchema>;
const DOWNLOAD_KEYS = ['downloadRoot', 'gameSubfolder', 'installAfterDownload', 'deleteArchiveAfterInstall'];

/** The parts of a setting that must match the SDK. Titles and descriptions may differ. */
function structureOf(prop: Record<string, unknown>) {
  return {
    type: prop.type,
    enum: prop.enum ?? null,
    default: prop.default,
    group: prop['x-ll-group'],
    advanced: prop['x-ll-advanced'] === true,
  };
}

describe('settings.schema.json', () => {
  test('every setting has a default that equals DEFAULT_SETTINGS', () => {
    for (const [name, value] of Object.entries(DEFAULT_SETTINGS)) {
      expect(properties[name]?.default).toEqual(value);
    }
  });

  test('the schema declares exactly the settings the code reads', () => {
    expect(Object.keys(properties).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  test('every setting has a title and a known group', () => {
    const groups = ['Downloads', 'Platform', 'Library', 'Updates', 'Network', 'Debug'];
    for (const prop of Object.values(properties as Record<string, SettingSchema & { title?: string }>)) {
      expect(typeof prop.title).toBe('string');
      expect(groups).toContain(prop['x-ll-group'] ?? '');
    }
  });

  test('compiles as JSON Schema 2020-12', async () => {
    const { default: Ajv2020 } = await import('ajv/dist/2020');
    // strict off: the x-ll-* keywords are host UI hints that validators ignore
    const ajv = new Ajv2020({ strict: false });
    expect(() => ajv.compile(schemaFile)).not.toThrow();
  });

  test('numeric settings have bounds that contain their default', () => {
    for (const prop of Object.values(properties)) {
      if (prop.type !== 'integer') continue;
      expect(prop.default as number).toBeGreaterThanOrEqual(prop.minimum ?? 0);
      expect(prop.default as number).toBeLessThanOrEqual(prop.maximum ?? Number.MAX_SAFE_INTEGER);
    }
  });

  test('enum settings list their default', () => {
    expect(properties.preferredPlatform.enum).toContain(properties.preferredPlatform.default);
    expect(properties.downloadRoot.enum).toContain(properties.downloadRoot.default);
  });

  test('download settings match the SDK schema structurally', () => {
    for (const key of DOWNLOAD_KEYS) {
      expect(structureOf(properties[key] as Record<string, unknown>)).toEqual(
        structureOf(downloadSettingsSchemaProperties[key]),
      );
    }
  });
});

describe('readSettings', () => {
  test('no saved values gives the defaults, which keep the old behaviour', () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.downloadRoot).toBe('downloads');
    expect(DEFAULT_SETTINGS.gameSubfolder).toBe(true);
    expect(DEFAULT_SETTINGS.installAfterDownload).toBe(false);
    expect(DEFAULT_SETTINGS.deleteArchiveAfterInstall).toBe(false);
    expect(DEFAULT_SETTINGS.preferredPlatform).toBe('any');
    expect(DEFAULT_SETTINGS.syncOwnedGames).toBe(true);
    expect(DEFAULT_SETTINGS.requestDelayMs).toBe(1000);
    expect(DEFAULT_SETTINGS.dumpDir).toBe('');
  });

  test('valid saved values are used', () => {
    const saved: PluginSettings = {
      downloadRoot: 'games',
      gameSubfolder: false,
      installAfterDownload: true,
      deleteArchiveAfterInstall: true,
      preferredPlatform: 'osx',
      skipSoundtracksAndExtras: true,
      syncOwnedGames: false,
      syncIntervalHours: 24,
      updateCheckIntervalHours: 6,
      requestDelayMs: 500,
      userAgent: '  custom agent  ',
      verboseLogging: true,
      dumpDir: '/tmp/dumps',
    };
    expect(readSettings(saved)).toEqual({ ...saved, userAgent: 'custom agent' });
  });

  test('invalid saved values fall back to the default', () => {
    expect(
      readSettings({
        downloadRoot: '/opt/steam',
        gameSubfolder: 'yes',
        installAfterDownload: 0,
        deleteArchiveAfterInstall: null,
        preferredPlatform: 'amiga',
        skipSoundtracksAndExtras: 'yes',
        syncOwnedGames: 0,
        syncIntervalHours: -1,
        updateCheckIntervalHours: 1.5,
        requestDelayMs: 10_001,
        userAgent: 42,
        verboseLogging: null,
        dumpDir: undefined,
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });
});
