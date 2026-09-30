import { describe, expect, it } from 'vitest';
import { MAX_ABOUT_ROWS, aboutRowCount, groupChangelog } from '../core/helpModel';
import { CHANGELOG, MAX_CHANGELOG_ENTRIES, MAX_CHANGELOG_LINE } from './changelog';

describe('CHANGELOG', () => {
  it('has between one and the cap of entries', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(CHANGELOG.length).toBeLessThanOrEqual(MAX_CHANGELOG_ENTRIES);
  });

  it('keeps every line short and non-empty', () => {
    for (const { line } of CHANGELOG) {
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line.length).toBeLessThan(MAX_CHANGELOG_LINE);
    }
  });

  it('starts with the build version, so a bump needs a new line', () => {
    expect(CHANGELOG[0]?.version).toBe(__APP_VERSION__);
  });

  it('fits the About panel once grouped by version (#377)', () => {
    expect(aboutRowCount(groupChangelog(CHANGELOG))).toBeLessThanOrEqual(MAX_ABOUT_ROWS);
  });
});
