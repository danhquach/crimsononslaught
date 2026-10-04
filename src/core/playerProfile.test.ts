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
import { RELIC_BUFFS } from '../config/relics';
import { BASE_EARTH_ROSTER_STATS } from '../config/earthRoster';
import { BASE_NOVA_BOMB_STATS } from '../config/iceRoster';
import { BASE_SWORD_STATS } from '../config/lightningRoster';
import { BASE_EARTH_SHIELD_STATS } from '../config/shields';
import { BASE_SPELL_STATS } from '../config/spells';
import { BASE_METEOR_STATS } from '../config/strikes';
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
  pierceBonus: 13,
};

const CATEGORY_PROBE: Readonly<Record<string, number>> = {
  damage: 2,
  cooldown: 3,
  area: 5,
  speed: 7,
  duration: 11,
  // 1 + 13: pierce is added to, not multiplied.
  pierce: 14,
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
        ['passive_haste', 8], // 0.92^8 = 0.51, above the 0.35 floor (CO-229 cap)
        ['passive_precision', 10], // 10 x 0.05 = 0.50, under the 0.75 cap
        ['passive_ward', 8], // 8 x 0.04 = 0.32, under the 0.60 cap
        ['passive_swift', 5], // 180 x 1.08^5 = 264, under the 320 cap
      ]),
    );
    expect(capped.cooldownMul).toBeCloseTo(0.92 ** 8, 10);
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
    expect(() => resolveProfile(ranks([['passive_power', 9]]))).toThrow(RangeError);
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

  it('adds the Impaler relic to exactly the blocks that pierce (#206)', () => {
    const profile = resolveProfile(ranks([['relic_impaler', 1]]), [...PASSIVES, ...RELIC_BUFFS]);
    expect(profile.pierceBonus).toBe(2);
    // Impaler's two more: Earth Spike 1 -> 3, Boulder 5 -> 7.
    expect(resolveSpellStats(BASE_SPELL_STATS.earth, profile).pierce).toBe(3);
    expect(resolveSpellStats(BASE_EARTH_ROSTER_STATS.earth_boulder, profile).pierce).toBe(7);
    // A block without `pierce` gains none and is otherwise untouched.
    expect(resolveSpellStats(BASE_SPELL_STATS.fire, profile)).toEqual(BASE_SPELL_STATS.fire);
  });

  it('still multiplies the other fields of a piercing block', () => {
    const profile = resolveProfile(
      ranks([
        ['relic_impaler', 1],
        ['passive_power', 1],
      ]),
      [...PASSIVES, ...RELIC_BUFFS],
    );
    const out = resolveSpellStats({ damage: 10, pierce: 5 }, profile);
    expect(out.pierce).toBe(7);
    expect(out.damage).toBeCloseTo(11);
  });

  // #406: a ring spell's uptime is a duration and its recharge a cooldown.
  describe('ring cycle (#406)', () => {
    const blocks = [
      ['Lightning Sword', BASE_SWORD_STATS],
      ['Earth Shield', BASE_EARTH_SHIELD_STATS],
    ] as const;

    it.each(blocks)('%s: Persistence stretches uptime, Haste shortens recharge', (_name, base) => {
      const persistence = PASSIVES.find((p) => p.id === 'passive_persistence');
      const long = resolveSpellStats(base, resolveProfile(ranks([['passive_persistence', 2]])));
      expect(long.uptime).toBeCloseTo(base.uptime * (persistence?.amount ?? NaN) ** 2, 9);
      expect(long.recharge).toBe(base.recharge);
      const hasted = resolveSpellStats(base, resolveProfile(ranks([['passive_haste', 5]])));
      expect(hasted.recharge).toBeCloseTo(base.recharge * 0.92 ** 5, 9);
      expect(hasted.uptime).toBe(base.uptime);
    });

    it.each(blocks)('%s: no other passive moves the cycle', (_name, base) => {
      const power = resolveSpellStats(base, resolveProfile(ranks([['passive_power', 3]])));
      expect([power.uptime, power.recharge]).toEqual([base.uptime, base.recharge]);
    });
  });

  // CO-167 rework spec §4: each passive reaches exactly the Meteor fields it names.
  describe('Meteor (CO-167)', () => {
    const at = (id: string, rank: number) =>
      resolveSpellStats(BASE_METEOR_STATS, resolveProfile(ranks([[id, rank]])));

    it('shortens the fall with Haste: 0.66 s at 5 ranks', () => {
      const out = at('passive_haste', 5);
      expect(out.fallDelay).toBeCloseTo(0.659, 3);
      expect(out.cooldown).toBeCloseTo(3.2 * 0.92 ** 5, 9);
      expect(out.pondDuration).toBe(BASE_METEOR_STATS.pondDuration);
    });

    it('grows the blast and the pond with Expanse: 98 and 63 px at 3 ranks', () => {
      const out = at('passive_expanse', 3);
      expect(out.aoeRadius).toBeCloseTo(98.3, 1);
      expect(out.pondRadius).toBeCloseTo(63.2, 1);
      expect(out.targetRange).toBeCloseTo(240 * 1.12 ** 3, 9);
      expect(out.pondDuration).toBe(BASE_METEOR_STATS.pondDuration);
    });

    it('keeps the pond longer with Persistence: 2.28 s at 3 ranks', () => {
      const out = at('passive_persistence', 3);
      expect(out.pondDuration).toBeCloseTo(2.28, 2);
      expect(out.fallDelay).toBe(BASE_METEOR_STATS.fallDelay);
      expect(out.pondRadius).toBe(BASE_METEOR_STATS.pondRadius);
    });

    it('raises the blast and the pond tick with Power', () => {
      const out = at('passive_power', 3);
      expect(out.damage).toBeCloseTo(60 * 1.1 ** 3, 9);
      expect(out.pondTickDamage).toBeCloseTo(5 * 1.1 ** 3, 9);
    });

    it('leaves the edge factor and the tick rate untouched by every passive', () => {
      for (const id of [
        'passive_power',
        'passive_haste',
        'passive_expanse',
        'passive_persistence',
      ]) {
        const out = at(id, 5);
        expect(out.aoeEdgeFactor, id).toBe(BASE_METEOR_STATS.aoeEdgeFactor);
        expect(out.pondTickRate, id).toBe(BASE_METEOR_STATS.pondTickRate);
        expect(out.projectiles, id).toBe(BASE_METEOR_STATS.projectiles);
      }
    });
  });

  // CO-182 rework spec §4: each passive reaches exactly the Frost Nova Bomb fields it names.
  describe('Frost Nova Bomb (CO-182)', () => {
    const at = (id: string, rank: number) =>
      resolveSpellStats(BASE_NOVA_BOMB_STATS, resolveProfile(ranks([[id, rank]])));

    it('throws faster with Haste', () => {
      const out = at('passive_haste', 5);
      expect(out.throwInterval).toBeCloseTo(0.25 * 0.92 ** 5, 9);
      expect(out.cooldown).toBeCloseTo(3.5 * 0.92 ** 5, 9);
    });

    it('hits harder with Power, icicles and burst alike', () => {
      const out = at('passive_power', 3);
      expect(out.icicleDamage).toBeCloseTo(14 * 1.1 ** 3, 9);
      expect(out.damage).toBeCloseTo(28 * 1.1 ** 3, 9);
    });

    it('reaches further with Expanse', () => {
      const out = at('passive_expanse', 3);
      expect(out.icicleRange).toBeCloseTo(110 * 1.12 ** 3, 9);
      expect(out.range).toBeCloseTo(240 * 1.12 ** 3, 9);
    });

    it('speeds the icicles and the bomb with Velocity', () => {
      const out = at('passive_velocity', 3);
      expect(out.icicleSpeed).toBeCloseTo(320 * 1.1 ** 3, 9);
      expect(out.speed).toBeCloseTo(80 * 1.1 ** 3, 9);
    });

    it('never changes the icicle count', () => {
      for (const id of ['passive_power', 'passive_haste', 'passive_expanse', 'passive_velocity']) {
        expect(at(id, 5).icicles, id).toBe(BASE_NOVA_BOMB_STATS.icicles);
      }
    });
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
    // Fire Wave's `arc` (#218), 47 since Earth Spike's `bleedChance` (#205),
    // 52 since Meteor's edge factor and pond (CO-167), 57 since Frost Nova Bomb's
    // throw interval, icicle count, damage, speed and range (CO-182).
    // 59 since a ring spell's `uptime` and `recharge` (#406), 56 since Ice
    // Shield's ring dropped `breakDamage`, `breakRadius` and `rechargeDelay`.
    expect(fields.length).toBe(56);
  });

  // CO-109 routes every equipped spell's block through the category map, so a
  // field the shipped blocks carry but the map has not is a stat no passive can
  // ever reach. Each roster config checks its own blocks the same way.
  it('categorises every field the shipped spells carry', () => {
    expect(validateSpellFields(BASE_SPELL_STATS)).toEqual([]);
  });
});
