import { describe, expect, it } from 'vitest';
import {
  BASE_PLAYER_PROFILE,
  PASSIVES,
  type Passive,
  type PlayerProfile,
} from '../config/passives';
import {
  SPELL_STAT_FIELDS,
  STAT_CATEGORIES,
  type SpellStatBlock,
  type SpellStatField,
} from '../config/spellFields';
import { BASE_SPELL_STATS } from '../config/spells';
import { resolveProfile, resolveSpellStats, validateSpellFields } from './playerProfile';
import { createRng } from './rng';

function ranks(entries: readonly (readonly [string, number])[]): Map<string, number> {
  return new Map(entries);
}

/** Filler for the fields a made-up passive does not care about. */
const TEMPLATE: Passive = {
  id: 'test',
  name: 'Test',
  description: 'Test passive.',
  field: 'maxHp',
  op: 'add',
  amount: 1,
};

/** A profile with a different multiplier per category, so a wrong one is obvious. */
const PROBE: PlayerProfile = {
  ...BASE_PLAYER_PROFILE,
  damageMul: 2,
  cooldownMul: 3,
  areaMul: 5,
  projectileSpeedMul: 7,
  durationMul: 11,
};

const CATEGORY_PROBE: Readonly<Record<string, number>> = {
  damage: 2,
  cooldown: 3,
  area: 5,
  speed: 7,
  duration: 11,
  unscaled: 1,
};

describe('resolveProfile', () => {
  it('returns the base profile for an empty stack', () => {
    expect(resolveProfile(new Map())).toEqual(BASE_PLAYER_PROFILE);
  });

  it('sums adds and compounds muls per rank (spec §4.2)', () => {
    const profile = resolveProfile(
      ranks([
        ['passive_vitality', 3], // add 20 x3
        ['passive_power', 3], // mul 1.1^3
      ]),
    );
    expect(profile.maxHp).toBe(160);
    expect(profile.damageMul).toBeCloseTo(1.1 ** 3, 10);
    // Not 1.30: a rank is another application of the multiplier.
    expect(profile.damageMul).not.toBeCloseTo(1.3, 5);
  });

  it('adds before it multiplies on a field that takes both (spec §4.2)', () => {
    // No shipped passive both adds to and multiplies the same field, so the
    // ordering is pinned against a config built for it: (100 + 10) x 2 = 220,
    // not 100 + (10 x 2) = 120 and not (100 x 2) + 10 = 210.
    const both: Passive[] = [
      { ...TEMPLATE, id: 'hp_add', field: 'maxHp', op: 'add', amount: 10 },
      { ...TEMPLATE, id: 'hp_mul', field: 'maxHp', op: 'mul', amount: 2 },
    ];
    const profile = resolveProfile(
      ranks([
        ['hp_mul', 1],
        ['hp_add', 1],
      ]),
      both,
    );
    expect(profile.maxHp).toBe(220);
  });

  it('holds every spec §4.3 clamp, including the floor at 0', () => {
    const extreme: Passive[] = [
      { ...TEMPLATE, id: 'crit', field: 'critChance', op: 'add', amount: 1 },
      { ...TEMPLATE, id: 'ward', field: 'damageReduction', op: 'add', amount: 1 },
      { ...TEMPLATE, id: 'speed', field: 'moveSpeed', op: 'add', amount: 1000 },
      { ...TEMPLATE, id: 'cd', field: 'cooldownMul', op: 'mul', amount: 0.01 },
      { ...TEMPLATE, id: 'drain', field: 'hpRegen', op: 'add', amount: -5 },
    ];
    const profile = resolveProfile(
      ranks([
        ['crit', 1],
        ['ward', 1],
        ['speed', 1],
        ['cd', 1],
        ['drain', 1],
      ]),
      extreme,
    );
    expect(profile.critChance).toBe(0.75);
    expect(profile.damageReduction).toBe(0.6);
    expect(profile.moveSpeed).toBe(320);
    expect(profile.cooldownMul).toBe(0.35);
    expect(profile.hpRegen).toBe(0);
  });

  it('stays inside every cap on the shipped passive list at full rank', () => {
    const capped = resolveProfile(
      ranks([
        ['passive_haste', 40], // 0.92^40 well below the 0.35 floor
        ['passive_precision', 10], // 10 x 0.05 = 0.50, under the 0.75 cap
        ['passive_ward', 8], // 8 x 0.04 = 0.32, under the 0.60 cap
        ['passive_swift', 5], // 180 x 1.08^5 = 264, under the 320 cap
      ]),
    );
    expect(capped.cooldownMul).toBe(0.35);
    expect(capped.critChance).toBeCloseTo(0.5, 10);
    expect(capped.damageReduction).toBeCloseTo(0.32, 10);
    expect(capped.moveSpeed).toBeLessThan(320);
  });

  it('gives an identical profile whatever order the passives were picked in', () => {
    const stack: [string, number][] = PASSIVES.map((passive, index) => [
      passive.id,
      Math.min(passive.maxRank ?? 4, (index % 4) + 1),
    ]);
    const expected = resolveProfile(ranks(stack));
    const rng = createRng(1);
    for (let round = 0; round < 20; round++) {
      expect(resolveProfile(ranks(rng.shuffle(stack)))).toEqual(expected);
    }
  });

  it('throws on an unknown passive or a rank outside 1..maxRank', () => {
    expect(() => resolveProfile(ranks([['nope', 1]]))).toThrow(/unknown passive/);
    expect(() => resolveProfile(ranks([['passive_magnet', 4]]))).toThrow(RangeError);
    expect(() => resolveProfile(ranks([['passive_power', 0]]))).toThrow(RangeError);
    expect(() => resolveProfile(ranks([['passive_power', 1.5]]))).toThrow(RangeError);
    // Uncapped passives take any positive integer rank.
    expect(resolveProfile(ranks([['passive_power', 99]])).damageMul).toBeGreaterThan(1);
  });
});

describe('resolveSpellStats', () => {
  it('applies each category multiplier to exactly its own fields (spec §6.1)', () => {
    const base: Record<string, number> = {};
    for (const field of SPELL_STAT_FIELDS) base[field] = 1;
    const out = resolveSpellStats(base as SpellStatBlock, PROBE) as Record<string, number>;

    for (const field of SPELL_STAT_FIELDS) {
      expect(out[field], field).toBe(CATEGORY_PROBE[STAT_CATEGORIES[field]]);
    }
  });

  it('copies only the fields the block carries, and leaves unscaled ones alone', () => {
    const out = resolveSpellStats({ damage: 12, projectiles: 3, cooldown: 2 }, PROBE);
    expect(out).toEqual({ damage: 24, projectiles: 3, cooldown: 6 });
  });

  it('is a no-op at the base profile, and never mutates its input', () => {
    const base: SpellStatBlock = { damage: 12, aoeRadius: 50, duration: 3 };
    expect(resolveSpellStats(base, BASE_PLAYER_PROFILE)).toEqual(base);
    expect(base).toEqual({ damage: 12, aoeRadius: 50, duration: 3 });
  });

  it('passes a field outside the category map through unscaled', () => {
    const out = resolveSpellStats({ mystery: 4 } as unknown as SpellStatBlock, PROBE);
    expect(out).toEqual({ mystery: 4 });
  });
});

describe('validateSpellFields', () => {
  it('accepts blocks whose fields are all categorised', () => {
    expect(validateSpellFields({ fire: { damage: 12, cooldown: 1 } })).toEqual([]);
  });

  it('reports a field that is in no category', () => {
    const blocks = { fire: { damage: 12, sparkle: 1 } as unknown as SpellStatBlock };
    expect(validateSpellFields(blocks)).toEqual([
      'spell "fire": stat "sparkle" is in no category (spec §6.1)',
    ]);
  });

  it('categorises every field exactly once', () => {
    const fields = Object.keys(STAT_CATEGORIES) as SpellStatField[];
    expect(new Set(fields).size).toBe(fields.length);
    // 45 since #143 retired Crush with Phase 1's Orbiting Boulders: `earth` is
    // Earth Spike now, and no spell multiplies damage by enemy type. 46 since
    // Fire Wave's `arc` (#218).
    expect(fields.length).toBe(46);
  });

  // CO-109 routes every equipped spell's block through the category map, so a
  // field the shipped blocks carry but the map has not is a stat no passive can
  // ever reach. Each roster config checks its own blocks the same way.
  it('categorises every field the shipped spells carry', () => {
    expect(validateSpellFields(BASE_SPELL_STATS)).toEqual([]);
  });
});
