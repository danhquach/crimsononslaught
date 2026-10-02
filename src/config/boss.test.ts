import { describe, expect, it } from 'vitest';
import { BOSS, BOSS_CC_DR } from './boss';
import { TEXTURE_KEYS } from './colors';

describe('boss stats (CO-050)', () => {
  it('match the spec §5 "Boss" table', () => {
    expect(BOSS).toMatchObject({ hp: 14400, bars: 2, speed: 70, contactDamage: 30, radius: 40 });
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
