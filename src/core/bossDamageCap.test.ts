import { describe, expect, it } from 'vitest';
import { BOSS_DAMAGE_CAP } from '../config/boss';
import { EMPTY_BOSS_DAMAGE_CAP, capBossDamage } from './bossDamageCap';

const CFG = { dpsCap: 200, overflowFactor: 0.1 };

describe('boss damage cap (#406)', () => {
  it('lands damage under the cap in full', () => {
    const r = capBossDamage(EMPTY_BOSS_DAMAGE_CAP, 150, 1, CFG);
    expect(r.dealt).toBe(150);
    expect(r.state.level).toBe(150);
  });

  it('scales the overflow past one second of cap', () => {
    const first = capBossDamage(EMPTY_BOSS_DAMAGE_CAP, 150, 0, CFG);
    const second = capBossDamage(first.state, 100, 0, CFG);
    expect(second.dealt).toBeCloseTo(50 + 50 * 0.1);
    expect(second.state.level).toBe(200);
    expect(capBossDamage(second.state, 100, 0, CFG).dealt).toBeCloseTo(10);
  });

  it('drains over time, so waiting restores the room', () => {
    const full = capBossDamage(EMPTY_BOSS_DAMAGE_CAP, 200, 0, CFG);
    expect(capBossDamage(full.state, 100, 0.5, CFG).dealt).toBe(100);
    expect(capBossDamage(full.state, 100, 0.25, CFG).dealt).toBeCloseTo(50 + 50 * 0.1);
  });

  it('floors the level at 0 after a long wait', () => {
    const full = capBossDamage(EMPTY_BOSS_DAMAGE_CAP, 200, 0, CFG);
    expect(capBossDamage(full.state, 0, 60, CFG).state.level).toBe(0);
  });

  it('does not drain while the clock holds (a pause)', () => {
    const full = capBossDamage(EMPTY_BOSS_DAMAGE_CAP, 200, 5, CFG);
    const held = capBossDamage(full.state, 100, 5, CFG);
    expect(held.dealt).toBeCloseTo(10);
    expect(held.state.level).toBe(200);
  });

  it('cuts a big single hit to one second of cap plus a tenth of the rest', () => {
    expect(capBossDamage(EMPTY_BOSS_DAMAGE_CAP, 5000, 0, CFG).dealt).toBeCloseTo(200 + 480);
  });

  it('ignores a non-positive amount and a clock that ran back', () => {
    const full = capBossDamage(EMPTY_BOSS_DAMAGE_CAP, 200, 10, CFG);
    expect(capBossDamage(full.state, -5, 10, CFG).dealt).toBe(0);
    expect(capBossDamage(full.state, 100, 9, CFG).state.lastS).toBe(10);
  });

  it('reads the shipped config', () => {
    expect(BOSS_DAMAGE_CAP).toEqual({ dpsCap: 200, overflowFactor: 0.1 });
  });
});
