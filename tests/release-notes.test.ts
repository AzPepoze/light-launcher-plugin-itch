import { describe, expect, test } from 'bun:test';
import { renderReleaseNotes } from '../scripts/release-notes';

describe('release notes', () => {
  test('groups commits by conventional type in a fixed order', () => {
    const notes = renderReleaseNotes([
      'fix(parser): keep empty rows',
      'feat(ui): add a settings page',
      'chore: update lockfile',
      'Update readme',
    ]);
    expect(notes).toBe(
      [
        '## Features',
        '',
        '- **ui:** add a settings page',
        '',
        '## Fixes',
        '',
        '- **parser:** keep empty rows',
        '',
        '## Other changes',
        '',
        '- update lockfile',
        '- Update readme',
        '',
      ].join('\n'),
    );
  });

  test('keeps subjects without a conventional prefix', () => {
    expect(renderReleaseNotes(['Update readme'])).toBe('## Other changes\n\n- Update readme\n');
  });

  test('lists breaking changes after the type sections', () => {
    expect(renderReleaseNotes(['feat(api)!: drop old method'])).toBe(
      '## Features\n\n- **api:** drop old method\n\n## Breaking changes\n\n- **api:** drop old method\n',
    );
  });

  test('reports an empty range', () => {
    expect(renderReleaseNotes([])).toBe('No changes.\n');
  });
});
