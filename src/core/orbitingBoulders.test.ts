import { describe, expect, it } from 'vitest';
import { BASE_EARTH_SHIELD_STATS } from '../config/shields';
import { BOULDER_HIT_COOLDOWN } from '../config/spells';
import {
  MAX_BOULDERS,
  advanceOrbit,
  boulderAngles,
  boulderPosition,
  knockbackVector,
  tickBoulderCooldown,
  tryBoulderHit,
} from './orbitingBoulders';
import type { EarthShieldStats } from './spellStats';

/** The ring is Earth Shield's now (spec §9.5); #143 made `earth` itself a spike. */
const base: EarthShieldStats = { ...BASE_EARTH_SHIELD_STATS };
const TAU = Math.PI * 2;

describe('boulderAngles spacing (CO-047)', () => {
  it('spaces count boulders evenly around the orbit from the base angle', () => {
    expect(boulderAngles(0, 2)).toEqual([0, Math.PI]);
    const three = boulderAngles(0.5, 3);
    expect(three).toHaveLength(3);
    expect(three[0]).toBeCloseTo(0.5, 9);
    expect(three[1]).toBeCloseTo(0.5 + TAU / 3, 9);
    expect(three[2]).toBeCloseTo(0.5 + (2 * TAU) / 3, 9);
  });

  it('the count perk adds one boulder and re-spaces the rest', () => {
    const before = boulderAngles(1, 2);
    const after = boulderAngles(1, 3);
    expect(after).toHaveLength(before.length + 1);
    // Every gap between neighbours is the same, so the new ring is even too.
    for (let i = 0; i < after.length; i += 1) {
      const next = after[(i + 1) % after.length] as number;
      const gap = (next - (after[i] as number) + TAU) % TAU;
      expect(gap).toBeCloseTo(TAU / 3, 9);
    }
  });

  it('a fractional or non-positive count is floored, never rounded up', () => {
    expect(boulderAngles(0, 2.9)).toHaveLength(2);
    expect(boulderAngles(0, 0)).toEqual([]);
    expect(boulderAngles(0, -1)).toEqual([]);
    expect(boulderAngles(0, Number.NaN)).toEqual([]);
  });

  it('never exceeds the pool cap', () => {
    expect(boulderAngles(0, MAX_BOULDERS + 5)).toHaveLength(MAX_BOULDERS);
  });
});

describe('boulderPosition (CO-047)', () => {
  it('sits orbitRadius from the centre along the angle', () => {
    const centre = { x: 100, y: 200 };
    expect(boulderPosition(centre, 80, 0)).toEqual({ x: 180, y: 200 });
    const up = boulderPosition(centre, 80, Math.PI / 2);
    expect(up.x).toBeCloseTo(100, 9);
    expect(up.y).toBeCloseTo(280, 9);
  });

  it('a wider orbit perk moves the boulder out on the next frame', () => {
    const centre = { x: 0, y: 0 };
    expect(boulderPosition(centre, 80, 0).x).toBe(80);
    expect(boulderPosition(centre, 100, 0).x).toBe(100);
  });
});

describe('advanceOrbit (CO-047)', () => {
  it('turns orbitSpeed radians per second of run time', () => {
    expect(advanceOrbit(0, 2, 0.5)).toBeCloseTo(1, 9);
    expect(advanceOrbit(1, 2, 0.25)).toBeCloseTo(1.5, 9);
  });

  it('wraps into [0, 2π) so the angle never grows without bound', () => {
    const angle = advanceOrbit(TAU - 0.1, 2, 0.1);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(TAU);
    expect(angle).toBeCloseTo(0.1, 9);
  });

  it('a zero-length or bad frame leaves the angle alone', () => {
    expect(advanceOrbit(1, 2, 0)).toBe(1);
    expect(advanceOrbit(1, 2, -1)).toBe(1);
    expect(advanceOrbit(1, 2, Number.NaN)).toBe(1);
  });
});

describe('knockbackVector (CO-047)', () => {
  it('pushes the enemy knockback px straight away from the boulder', () => {
    const boulder = { x: 0, y: 0 };
    const enemy = { x: 3, y: 4 };
    const push = knockbackVector(boulder, enemy, 60, { x: 0, y: 0 });
    expect(push.x).toBeCloseTo(36, 9);
    expect(push.y).toBeCloseTo(48, 9);
    expect(Math.hypot(push.x, push.y)).toBeCloseTo(60, 9);
  });

  it('is the spell stat, so a heavier block pushes further', () => {
    const boulder = { x: 0, y: 0 };
    const enemy = { x: 10, y: 0 };
    expect(knockbackVector(boulder, enemy, base.knockback, { x: 0, y: 0 })).toEqual({
      x: 60,
      y: 0,
    });
    expect(knockbackVector(boulder, enemy, base.knockback + 25, { x: 0, y: 0 })).toEqual({
      x: 85,
      y: 0,
    });
  });

  it('an enemy dead centre on the boulder is pushed outward from the orbit centre', () => {
    const centre = { x: 0, y: 0 };
    const boulder = { x: 0, y: 80 };
    const push = knockbackVector(boulder, boulder, 60, centre);
    expect(push.x).toBeCloseTo(0, 9);
    expect(push.y).toBeCloseTo(60, 9);
  });

  it('with nothing to aim along there is no push', () => {
    const origin = { x: 0, y: 0 };
    expect(knockbackVector(origin, origin, 60, origin)).toEqual({ x: 0, y: 0 });
    expect(knockbackVector(origin, { x: 1, y: 0 }, 0, origin)).toEqual({ x: 0, y: 0 });
  });
});

describe('per-enemy hit cooldown (CO-047)', () => {
  it('a fresh enemy takes the hit and opens a 0.4 s window', () => {
    expect(tryBoulderHit(0)).toEqual({ remainingS: BOULDER_HIT_COOLDOWN, hit: true });
  });

  it('a hit inside the window is ignored and does not extend it', () => {
    expect(tryBoulderHit(0.25)).toEqual({ remainingS: 0.25, hit: false });
  });

  it('the window drains with run time and then a hit lands again', () => {
    let remaining = tryBoulderHit(0).remainingS;
    remaining = tickBoulderCooldown(remaining, 0.2);
    expect(tryBoulderHit(remaining).hit).toBe(false);
    remaining = tickBoulderCooldown(remaining, 0.2);
    expect(remaining).toBe(0);
    expect(tryBoulderHit(remaining).hit).toBe(true);
  });

  it('never goes negative and ignores a bad frame', () => {
    expect(tickBoulderCooldown(0.1, 5)).toBe(0);
    expect(tickBoulderCooldown(0.1, -1)).toBe(0.1);
    expect(tickBoulderCooldown(0.1, Number.NaN)).toBe(0.1);
  });
});
