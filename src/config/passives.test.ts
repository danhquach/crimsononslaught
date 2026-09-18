import { describe, expect, it } from 'vitest';
import { validatePassives } from '../core/playerProfile';
import {
  BASE_PLAYER_PROFILE,
  PASSIVES,
  PROFILE_CLAMPS,
  passiveById,
  type Passive,
} from './passives';

/** Spec §5, transcribed: id, field, op, amount, maxRank (`undefined` = uncapped). */
const SPEC_TABLE: readonly [string, string, 'add' | 'mul', number, number | undefined][] = [
  ['passive_power', 'damageMul', 'mul', 1.1, undefined],
  ['passive_haste', 'cooldownMul', 'mul', 0.92, undefined],
  ['passive_expanse', 'areaMul', 'mul', 1.12, undefined],
  ['passive_velocity', 'projectileSpeedMul', 'mul', 1.1, 5],
  ['passive_persistence', 'durationMul', 'mul', 1.15, undefined],
  ['passive_precision', 'critChance', 'add', 0.05, 10],
  ['passive_savagery', 'critMultiplier', 'add', 0.25, 6],
  ['passive_ward', 'damageReduction', 'add', 0.04, 8],
  ['passive_swift', 'moveSpeed', 'mul', 1.08, 5],
  ['passive_vitality', 'maxHp', 'add', 20, 8],
  ['passive_regeneration', 'hpRegen', 'add', 0.5, 6],
  ['passive_magnet', 'pickupRadius', 'mul', 1.25, 3],
  ['passive_avarice', 'xpGain', 'mul', 1.12, 5],
];

describe('passives config', () => {
  it('matches the spec §5 table exactly', () => {
    expect(PASSIVES.map((passive) => passive.id)).toEqual(SPEC_TABLE.map(([id]) => id));
    for (const [id, field, op, amount, maxRank] of SPEC_TABLE) {
      const passive = passiveById(id);
      expect(passive, id).toBeDefined();
      expect([passive?.field, passive?.op, passive?.amount, passive?.maxRank], id).toEqual([
        field,
        op,
        amount,
        maxRank,
      ]);
      expect(passive?.name.length, id).toBeGreaterThan(0);
      expect(passive?.description.includes('\n'), id).toBe(false);
    }
    expect(passiveById('nope')).toBeUndefined();
  });

  it('leaves exactly the four scaling passives uncapped (spec §5 notes)', () => {
    const uncapped = PASSIVES.filter((passive) => passive.maxRank === undefined).map((p) => p.id);
    expect(uncapped).toEqual([
      'passive_power',
      'passive_haste',
      'passive_expanse',
      'passive_persistence',
    ]);
  });

  it('holds the spec §4.1 base profile and the §4.3 clamps', () => {
    expect(BASE_PLAYER_PROFILE).toEqual({
      moveSpeed: 180,
      maxHp: 100,
      hpRegen: 0,
      pickupRadius: 40,
      xpGain: 1,
      damageMul: 1,
      cooldownMul: 1,
      areaMul: 1,
      projectileSpeedMul: 1,
      durationMul: 1,
      critChance: 0,
      critMultiplier: 1.5,
      damageReduction: 0,
    });
    expect(PROFILE_CLAMPS).toEqual({
      cooldownMul: { min: 0.35 },
      critChance: { max: 0.75 },
      damageReduction: { max: 0.6 },
      moveSpeed: { max: 320 },
    });
  });

  it('passes its own boot-time validation', () => {
    expect(validatePassives()).toEqual([]);
  });

  it('reports a duplicate id, an unknown field, a bad maxRank and a bad amount', () => {
    const good = PASSIVES[0] as Passive;
    const broken: Passive[] = [
      good,
      good,
      { ...good, id: 'p_field', field: 'nope' as Passive['field'] },
      { ...good, id: 'p_rank', maxRank: 0 },
      { ...good, id: 'p_amount', op: 'mul', amount: 0 },
      { ...good, id: 'p_finite', amount: Number.NaN },
    ];
    expect(validatePassives(broken)).toEqual([
      `duplicate passive id "${good.id}"`,
      'passive "p_field": no field "nope" on PlayerProfile',
      'passive "p_rank": maxRank must be an integer >= 1, got 0',
      'passive "p_amount": a mul amount must be > 0, got 0',
      'passive "p_finite": amount must be finite, got NaN',
    ]);
  });
});
