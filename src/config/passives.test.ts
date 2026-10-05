import { describe, expect, it } from 'vitest';
import { validatePassives } from '../core/playerProfile';
import {
  BASE_PLAYER_PROFILE,
  PASSIVES,
  PROFILE_CLAMPS,
  passiveById,
  SIPHON,
  type Passive,
} from './passives';

/** Spec §5, transcribed: id, field, op, amount, maxRank. */
const SPEC_TABLE: readonly [string, string, 'add' | 'mul', number, number][] = [
  ['passive_power', 'damageMul', 'mul', 1.1, 8],
  ['passive_haste', 'cooldownMul', 'mul', 0.92, 8],
  ['passive_expanse', 'areaMul', 'mul', 1.12, 6],
  ['passive_velocity', 'projectileSpeedMul', 'mul', 1.1, 5],
  ['passive_persistence', 'durationMul', 'mul', 1.15, 6],
  ['passive_precision', 'critChance', 'add', 0.05, 10],
  ['passive_savagery', 'critMultiplier', 'add', 0.25, 6],
  ['passive_ward', 'damageReduction', 'add', 0.04, 8],
  ['passive_swift', 'moveSpeed', 'mul', 1.08, 5],
  ['passive_vitality', 'maxHp', 'add', 20, 8],
  ['passive_regeneration', 'hpRegen', 'add', 0.5, 6],
  ['passive_magnet', 'pickupRadius', 'mul', 1.25, 3],
  ['passive_avarice', 'xpGain', 'mul', 1.12, 5],
  ['passive_exploit', 'exploitBonus', 'add', 0.08, 5],
  ['passive_siphon', 'siphonShare', 'add', 0.005, 4],
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

  it('caps every passive (CO-229)', () => {
    expect(PASSIVES.filter((passive) => passive.maxRank === undefined)).toEqual([]);
  });

  it('gates no passive on a stat since Exploit replaced Pierce (CO-234)', () => {
    // Relics still gate on one (Impaler needs a casting spell that pierces).
    expect(PASSIVES.filter((passive) => passive.requiresStat !== undefined)).toEqual([]);
  });

  it('has no Pierce passive, while the pierce bonus stays for Impaler (CO-234)', () => {
    expect(passiveById('passive_pierce')).toBeUndefined();
    expect(BASE_PLAYER_PROFILE.pierceBonus).toBe(0);
  });

  it("sets Siphon's ceiling at Regeneration's full stack (CO-235)", () => {
    const regen = passiveById('passive_regeneration');
    expect(SIPHON.maxHealPerS).toBe((regen?.amount ?? 0) * (regen?.maxRank ?? 0));
  });

  it('holds the spec §4.1 base profile and the §4.3 clamps', () => {
    expect(BASE_PLAYER_PROFILE).toEqual({
      moveSpeed: 180,
      maxHp: 100,
      hpRegen: 0,
      pickupRadius: 60,
      xpGain: 1,
      damageMul: 1,
      cooldownMul: 1,
      areaMul: 1,
      projectileSpeedMul: 1,
      durationMul: 1,
      critChance: 0,
      critMultiplier: 1.5,
      damageReduction: 0,
      pierceBonus: 0,
      siphonShare: 0,
      exploitBonus: 0,
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

  it("states Siphon's share and ceiling in its description", () => {
    const siphon = passiveById('passive_siphon') as Passive;
    expect(siphon.description).toContain(`${siphon.amount * 100}% of spell damage`);
    expect(siphon.description).toContain(`${SIPHON.maxHealPerS} HP/s`);
  });

  it("states Exploit's bonus in its description, built from the amount (CO-234)", () => {
    const exploit = passiveById('passive_exploit') as Passive;
    expect(exploit.description).toContain(`${Math.round(exploit.amount * 100)}% more damage`);
    expect(exploit.description).toContain('under a status');
  });

  it('states every amount in its description, so a retune cannot leave the text behind (CO-238)', () => {
    for (const passive of PASSIVES) {
      const shown =
        passive.op === 'mul'
          ? [`${Math.round(Math.abs(passive.amount - 1) * 100)}%`]
          : [`${+(passive.amount * 100).toFixed(4)}%`, `${passive.amount}`];
      expect(
        shown.some((text) => passive.description.includes(text)),
        `${passive.id}: "${passive.description}" should state ${shown.join(' or ')}`,
      ).toBe(true);
    }
  });
});
