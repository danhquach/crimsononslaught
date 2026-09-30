import { isRosterSpellId, type RosterSpellId } from './loadout';
import type { SpellStatField } from './spellFields';

/**
 * Spell levels as data (#326): every equipped spell, the element's default
 * included, is level 1 to `MAX_SPELL_LEVEL`. A level-up can offer the next level
 * of a spell; what each level adds is this table's text, and the spell's own
 * ticket (#327-#330) fills its entry in when it builds the behaviour.
 *
 * A spell is offered an upgrade only while it has an entry, the same way only a
 * castable spell is offered as an active, so an element's levels switch on when
 * its ticket fills its entries in, after the behaviour exists. Levels live in
 * the run, never in a save.
 *
 * Pure data, no Phaser import.
 */

/** Level 1 is what a spell is equipped at; 3 is the last upgrade. */
export const MAX_SPELL_LEVEL = 3;

export type SpellLevel = 1 | 2 | 3;

/** True for an integer level from 1 to `MAX_SPELL_LEVEL`, and for nothing else. */
export function isSpellLevel(value: unknown): value is SpellLevel {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SPELL_LEVEL
  );
}

/**
 * Longest level text, so the card shows it in one or two lines: measured in the
 * level-up card (15px Georgia, 192px wide), realistic words wrap to two lines up
 * to 52 to 57 characters, so the cap leaves the room a wider CI font needs.
 */
export const SPELL_LEVEL_TEXT_MAX = 48;

/** What levels 2 and 3 add, as the level-up card reads them. */
export type SpellLevelEntry = Readonly<{ 2: string; 3: string }>;

/** A spell without an entry has no upgrade to offer yet. */
export type SpellLevelTable = Readonly<Partial<Record<RosterSpellId, SpellLevelEntry>>>;

/**
 * What each spell's levels 2 and 3 add. Fire's are here (#327), Ice's (#328),
 * Lightning's (#329) and Earth's (#330). The stat adds that back the first
 * line of each are `SPELL_LEVEL_STATS`, and the behaviour rules are
 * `config/fireLevels.ts`'s, `config/iceLevels.ts`'s, `config/lightningLevels.ts`'s
 * and `config/earthLevels.ts`'s. Written as ASCII, so "degrees" stands for the sign.
 */
export const SPELL_LEVELS: SpellLevelTable = {
  fire: {
    2: 'Fires 2 bolts, at the two nearest enemies.',
    3: 'Ember split: each blast throws 3 small embers.',
  },
  fire_meteor: {
    2: 'Drops 2 meteors per cast, on different targets.',
    3: 'Cataclysm: every 3rd cast drops a giant meteor.',
  },
  fire_column: {
    2: "The wave's arc widens from 95 to 150 degrees.",
    3: 'Fire trail: the wave leaves burning ground.',
  },
  fire_companion: {
    2: 'Fires 2 projectiles per attack.',
    3: 'Fireball: every 4th attack explodes and burns.',
  },
  fire_dragon: {
    2: 'Sends 2 dragons per cast, at different targets.',
    3: 'Dragon swarm: 3 dragons, each hits 2 enemies.',
  },
  ice: {
    2: 'Fires 2 arrows in a fan.',
    3: 'Shatter: hits on slowed enemies throw 3 shards.',
  },
  ice_nova_bomb: {
    2: 'Sprays 4 icicles per throw instead of 2.',
    3: 'Cluster: the burst rolls out 3 small urchins.',
  },
  ice_shield: {
    2: 'Frost aura: enemies touching it are slowed.',
    3: 'Shatter ring: a break fires 8 icicles, freezes.',
  },
  ice_companion: {
    2: 'Fires 2 projectiles per attack.',
    3: 'Frost orb: every 4th attack freezes its target.',
  },
  ice_blizzard: {
    2: 'Hail: every second a hailstone hits one inside.',
    3: 'Deep freeze: the last tick freezes all inside.',
  },
  lightning: {
    2: 'Strikes 2 targets per cast.',
    3: 'Thunderbolt: every 5th cast stuns a small area.',
  },
  lightning_chain: {
    2: 'Chains to 4 enemies instead of 2.',
    3: 'Fork: the chain splits in two at the first hit.',
  },
  lightning_tornado: {
    2: 'Sends 2 tornadoes per cast.',
    3: 'Storm cell: funnels throw a bolt every 0.5 s.',
  },
  lightning_companion: {
    2: 'Attacks twice as fast; hits arc in front of it.',
    3: 'Thunderclap: each strike chains to 3 enemies.',
  },
  lightning_sword: {
    2: 'Adds a 4th blade to the ring.',
    3: '5 blades; each cut arcs to 1-2 enemies nearby.',
  },
  earth: {
    2: 'Flings 2 spikes in a fan.',
    3: 'Splinter: a hit shatters the spike over an area.',
  },
  earth_boulder: {
    2: 'Throws 2 boulders per cast.',
    3: 'Landslide: boulders leave a staggering trail.',
  },
  earth_shield: {
    2: 'Adds a 4th stone to the ring.',
    3: 'Tremor: every 2 s the ring shoves and staggers.',
  },
  earth_quake: {
    2: 'Opens 2 quakes, on the two densest groups.',
    3: 'Aftershock: quakes end in a blast, hurling foes.',
  },
  earth_companion: {
    2: 'Attacks twice as fast; each hit sweeps an arc.',
    3: 'Seismic slam: a slam leaves a staggering quake.',
  },
};

/** Stat adds a level brings, cumulative: level 3 has level 2's adds too (#327). */
export type SpellLevelStatAdds = Readonly<Partial<Record<SpellStatField, number>>>;

export type SpellLevelStatTable = Readonly<
  Partial<Record<RosterSpellId, Readonly<{ 2?: SpellLevelStatAdds; 3?: SpellLevelStatAdds }>>>
>;

/**
 * The stat adds each spell's levels bring (#327), read by the `Spellbook`
 * before the profile scales a block. Every field named is `unscaled`, so a
 * passive never multiplies an add. The row's spell must carry the field in its
 * base block, which `validateSpellLevelStats` checks at boot.
 */
export const SPELL_LEVEL_STATS: SpellLevelStatTable = {
  fire: { 2: { projectiles: 1 } },
  fire_meteor: { 2: { projectiles: 1 } },
  fire_column: { 2: { arc: 55 } }, // 95 -> 150
  fire_companion: { 2: { projectiles: 1 } },
  fire_dragon: { 2: { projectiles: 1 }, 3: { projectiles: 1 } },
  ice: { 2: { projectiles: 1 } },
  ice_nova_bomb: { 2: { icicles: 2 } }, // 2 -> 4
  ice_companion: { 2: { projectiles: 1 } },
  lightning: { 2: { strikes: 1 } },
  lightning_chain: { 2: { chains: 2 } }, // 2 -> 4
  lightning_sword: { 2: { count: 1 }, 3: { count: 1 } }, // 3 -> 4 -> 5
  earth_shield: { 2: { count: 1 } }, // 3 -> 4 stones
};

/** The text for `level` of `id`, or `undefined` when the spell has no entry or the level is 1. */
export function spellLevelText(
  table: SpellLevelTable,
  id: RosterSpellId,
  level: number,
): string | undefined {
  if (!Object.hasOwn(table, id) || (level !== 2 && level !== 3)) return undefined;
  return table[id]?.[level];
}

/** Printable ASCII, so a card never draws a glyph the game's font lacks. */
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

/**
 * Boot-time check of the level table (like `validateLoadoutConfig`): one line
 * per problem, never throws. Every key is a roster spell, every entry has both
 * texts, each non-empty printable ASCII of at most `SPELL_LEVEL_TEXT_MAX`.
 */
export function validateSpellLevels(table: SpellLevelTable = SPELL_LEVELS): string[] {
  const problems: string[] = [];
  for (const key of Object.getOwnPropertyNames(table)) {
    if (!isRosterSpellId(key)) {
      problems.push(`spell levels: "${key}" is not a roster spell`);
      continue;
    }
    for (const level of [2, 3] as const) {
      const text = table[key]?.[level];
      if (typeof text !== 'string' || text.length === 0) {
        problems.push(`spell levels: "${key}" level ${level} has no text`);
      } else if (text.length > SPELL_LEVEL_TEXT_MAX) {
        problems.push(
          `spell levels: "${key}" level ${level} text is ${text.length} characters, over ${SPELL_LEVEL_TEXT_MAX}`,
        );
      } else if (!PRINTABLE_ASCII.test(text)) {
        problems.push(`spell levels: "${key}" level ${level} text is not printable ASCII`);
      }
    }
  }
  return problems;
}
