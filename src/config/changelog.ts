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
  { version: '0.1.0', line: 'Spell levels 2 and 3 for Fire, Ice, Lightning and Earth' },
  { version: '0.1.0', line: 'New foes: ranged, exploder, splitter, shielded, elites' },
  { version: '0.1.0', line: 'Music, and a cast sound for every spell' },
  { version: '0.1.0', line: '20-minute runs that end in a boss fight' },
  { version: '0.1.0', line: 'Progress saves, with permanent upgrades between runs' },
];
