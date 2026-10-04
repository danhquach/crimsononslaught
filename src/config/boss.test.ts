import { describe, expect, it } from 'vitest';
import {
  BOSS,
  BOSS_CC_DR,
  BOSS_CHAIN,
  BOSS_ENRAGE,
  BOSS_SKILL_RANGE,
  BOSS_SKILL_ROTATION,
  BOSS_SKILL_WEIGHTS,
  BOSS_SKILLS,
  BOSS_SLAM,
  BOSS_SUMMON,
} from './boss';
import { WAVES } from './waves';
import { TEXTURE_KEYS } from './colors';

describe('boss stats (CO-050)', () => {
  it('match the spec §5 "Boss" table', () => {
    expect(BOSS).toMatchObject({ hp: 21000, bars: 2, speed: 140, contactDamage: 30, radius: 40 });
  });

  it('cycle every 4 s: 0.8 s telegraph then a 0.6 s charge at 400 px/s', () => {
    expect(BOSS).toMatchObject({ cycleS: 4, telegraphS: 0.8, chargeS: 0.6, chargeSpeed: 400 });
  });

  it('leaves time to chase between charges', () => {
    expect(BOSS.telegraphS + BOSS.chargeS).toBeLessThan(BOSS.cycleS);
  });

  it('points at a generated texture key', () => {
    expect(TEXTURE_KEYS).toContain(BOSS.texture);
  });
});

describe('boss crowd-control diminishing returns (#315)', () => {
  it('shortens every repeat, by a positive fraction', () => {
    expect(BOSS_CC_DR.factor).toBeGreaterThan(0);
    expect(BOSS_CC_DR.factor).toBeLessThan(1);
  });

  it('forgets a kind after a finite, positive wait', () => {
    expect(BOSS_CC_DR.resetS).toBeGreaterThan(0);
    expect(Number.isFinite(BOSS_CC_DR.resetS)).toBe(true);
  });
});

describe('boss enrage (#388)', () => {
  it('starts at half the last bar: 5250 of 21000 HP over two bars', () => {
    expect((BOSS.hp / BOSS.bars) * BOSS_ENRAGE.atLastBarFraction).toBe(5250);
  });

  it('shortens the cycle by cutting the chase, which stays positive', () => {
    const chase = BOSS.cycleS * BOSS_ENRAGE.attackGapMul - BOSS.telegraphS - BOSS.chargeS;
    expect(chase).toBeCloseTo(1.4, 9);
    expect(chase).toBeGreaterThan(0);
  });

  it('only ever makes the boss stronger', () => {
    expect(BOSS_ENRAGE.damageMul).toBeGreaterThan(1);
    expect(BOSS_ENRAGE.speedMul).toBeGreaterThan(1);
    expect(BOSS_ENRAGE.damageTakenMul).toBeGreaterThan(1);
  });
});

describe('boss ground slam (CO-222)', () => {
  it('has the ticket values: 1 s warning, 0.4 s landing, 120 px, 30 damage', () => {
    expect(BOSS_SLAM).toEqual({ windupS: 1.0, activeS: 0.4, radius: 120, damage: 30 });
    expect(BOSS_SKILLS.slam).toBe(BOSS_SLAM);
  });

  it('is escapable: a walking hero leaves the ring inside the warning', () => {
    const heroSpeed = 180;
    const heroRadius = 14;
    const escapePx = BOSS_SLAM.radius + heroRadius - BOSS.radius;
    expect(escapePx / heroSpeed).toBeLessThan(BOSS_SLAM.windupS);
  });

  it('is as long as the charge leg, so it fits where the charge does', () => {
    expect(BOSS_SLAM.windupS + BOSS_SLAM.activeS).toBeCloseTo(BOSS.telegraphS + BOSS.chargeS, 9);
  });

  it('has a rotation list per bar, the first holding the slam', () => {
    expect(BOSS_SKILL_ROTATION).toHaveLength(BOSS.bars);
    expect(BOSS_SKILL_ROTATION[0]).toEqual(['slam']);
    expect(BOSS_SKILL_ROTATION[1]).toEqual(['slam', 'volley', 'summon']);
  });

  it('weights every skill by how far the hero is: the slam up close, the volley far off', () => {
    expect(BOSS_SKILL_RANGE.nearPx).toBeLessThan(BOSS_SKILL_RANGE.farPx);
    expect(Object.keys(BOSS_SKILL_WEIGHTS).sort()).toEqual(Object.keys(BOSS_SKILLS).sort());
    for (const row of Object.values(BOSS_SKILL_WEIGHTS))
      for (const w of Object.values(row)) expect(w).toBeGreaterThan(0);
    expect(BOSS_SKILL_WEIGHTS.slam).toEqual({ near: 3, mid: 1, far: 1 });
    expect(BOSS_SKILL_WEIGHTS.volley).toEqual({ near: 1, mid: 1, far: 3 });
    expect(BOSS_SKILL_WEIGHTS.summon).toEqual({ near: 1, mid: 2, far: 2 });
  });

  it('has a timing row for every skill id the rotation names', () => {
    for (const list of BOSS_SKILL_ROTATION)
      for (const id of list) {
        expect(BOSS_SKILLS[id].windupS).toBeGreaterThan(0);
        expect(BOSS_SKILLS[id].activeS).toBeGreaterThan(0);
      }
  });

  it('summon (CO-224): a pack of 5, capped at 10, on a 14 s cooldown', () => {
    expect(BOSS_SUMMON).toMatchObject({
      windupS: 1,
      activeS: 0.6,
      cooldownS: 14,
      packSize: 5,
      maxLive: 10,
      ringRadius: 110,
      circleRadius: 22,
      type: 'swarm',
    });
    expect(BOSS_SUMMON.packSize).toBeLessThanOrEqual(BOSS_SUMMON.maxLive);
  });

  it('summon scales the pack as the last fighting wave row does', () => {
    const row = [...WAVES].reverse().find((wave) => wave.types.length > 0);
    expect(BOSS_SUMMON.scale).toEqual({ hpMul: row?.hpMul, damageMul: row?.damageMul });
    expect(BOSS_SUMMON.scale.hpMul).toBeGreaterThan(1);
  });
});

describe('boss chain charge (CO-225)', () => {
  it('chains two charges for now, the second warned for less than the first telegraph', () => {
    expect(BOSS_CHAIN.minCharges).toBe(2);
    expect(BOSS_CHAIN.maxCharges).toBe(2);
    expect(BOSS_CHAIN.telegraphS).toBeGreaterThan(0.25);
    expect(BOSS_CHAIN.telegraphS).toBeLessThan(BOSS.telegraphS);
  });
});
