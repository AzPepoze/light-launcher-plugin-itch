import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setVerboseLogging, writeLog } from '../src/logger';
import { writeDump } from '../src/dump';

/** captures what writeLog sends to stderr */
function captureStderr(run: () => void): string {
  const original = process.stderr.write.bind(process.stderr);
  let text = '';
  process.stderr.write = ((chunk: string | Uint8Array) => {
    text += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    run();
  } finally {
    process.stderr.write = original;
  }
  return text;
}

describe('verbose logging', () => {
  afterEach(() => setVerboseLogging(false));

  test('debug lines are hidden by default', () => {
    expect(captureStderr(() => writeLog('itch', 'debug', 'hidden'))).toBe('');
  });

  test('debug lines show when verbose logging is on', () => {
    setVerboseLogging(true);
    expect(captureStderr(() => writeLog('itch', 'debug', 'shown'))).toContain('shown');
  });

  test('info and warn lines show either way', () => {
    expect(captureStderr(() => writeLog('itch', 'info', 'info line'))).toContain('info line');
    expect(captureStderr(() => writeLog('itch', 'warn', 'warn line'))).toContain('warn line');
  });
});

describe('writeDump', () => {
  let root: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'itch-dump-test-'));
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test('writes the page into the folder, creating it when needed', async () => {
    const dir = path.join(root, 'nested', 'dumps');
    const file = await writeDump(dir, 'listing', '<html>page</html>', 1234);
    expect(path.dirname(file)).toBe(dir);
    expect(path.basename(file)).toBe('listing-1234.html');
    expect(await fs.readFile(file, 'utf8')).toBe('<html>page</html>');
  });

  test('replaces characters that are unsafe in a file name', async () => {
    const file = await writeDump(root, 'game page/../x', 'body', 5);
    expect(path.basename(file)).toBe('game-page-..-x-5.html');
    expect(path.dirname(file)).toBe(root);
  });
});
