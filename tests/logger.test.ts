import { describe, expect, test } from 'bun:test';
import { categoryRgb, fnv1a } from '../src/logger';

describe('fnv1a', () => {
  test('matches the published 32-bit FNV-1a values', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
  });
});

describe('categoryRgb', () => {
  test('is the same for the same category every time', () => {
    expect(categoryRgb('itch')).toEqual(categoryRgb('itch'));
  });

  test('stays pastel: every channel is high', () => {
    for (const category of ['itch', 'plugin', 'f95', 'downloads']) {
      for (const channel of categoryRgb(category)) {
        expect(channel).toBeGreaterThanOrEqual(150);
      }
    }
  });
});
