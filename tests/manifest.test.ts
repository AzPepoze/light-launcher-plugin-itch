import { describe, expect, test } from 'bun:test';
import schema from '@light-launcher/plugin-sdk/schema/plugin.schema.json';
import manifest from '../plugin.json';

function hasModule(name: string): boolean {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

const ajvInstalled = hasModule('ajv/dist/2020');
if (!ajvInstalled) console.warn('plugin.json schema test skipped: ajv is not installed');

describe('plugin.json', () => {
  test.skipIf(!ajvInstalled)('matches the SDK manifest schema', async () => {
    const { default: Ajv2020 } = await import('ajv/dist/2020');
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const valid = validate(manifest);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });
});
