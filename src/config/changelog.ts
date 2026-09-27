/**
 * What's new (#226): the Help screen's About tab lists these, newest first.
 * At most `MAX_CHANGELOG_ENTRIES`, each one short player-facing line; the top
 * entry's version is the build's (`package.json`), which a unit test holds it
 * to, so a version bump without a line here fails.
 *
 * Pure data, no Phaser import.
 */

export interface ChangelogEntry {
  version: string;
  line: string;
}

export const MAX_CHANGELOG_ENTRIES = 5;

export const MAX_CHANGELOG_LINE = 60;

export const CHANGELOG: readonly ChangelogEntry[] = [
  { version: '0.1.0', line: 'Help screen: every pickup explained, plus feedback' },
  { version: '0.1.0', line: 'Ranged enemies keep their distance and shoot' },
  { version: '0.1.0', line: 'The page asks before you leave during a run' },
  { version: '0.1.0', line: 'Reroll, Skip and Ban on level-up offers' },
  { version: '0.1.0', line: 'Pause the run with Esc or Start' },
];
