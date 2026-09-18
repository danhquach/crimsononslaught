import { describe, expect, it } from 'vitest';
import { BASE_SPELL_STATS, BURN_DURATION } from '../config/spells';
import {
  MAX_LIVE_PROJECTILES,
  NO_BURN,
  applyBurn,
  explosionDamage,
  hasBurn,
  splashTargets,
  tickBurn,
  volleyTargets,
} from './fireball';
import type { FireStats } from './spellStats';

const base: FireStats = { ...BASE_SPELL_STATS.fire };

describe('explosionDamage (CO-044)', () => {
  it('is half the direct damage at base', () => {
    expect(explosionDamage(base)).toBe(6);
  });

  it('follows +damage perks', () => {
    expect(explosionDamage({ ...base, damage: 24 })).toBe(12);
  });

  it('is the full direct damage with Big Blast', () => {
    expect(explosionDamage({ ...base, aoeDamageFactor: 1 })).toBe(12);
  });
});

describe('splashTargets (CO-044)', () => {
  const hit = { x: 100, y: 100 };
  const near = { x: 130, y: 100 };
  const edge = { x: 140, y: 100 };
  const far = { x: 141, y: 100 };

  it('returns every other enemy inside the radius, inclusive', () => {
    expect(splashTargets(hit, [hit, near, edge, far], 40, hit)).toEqual([near, edge]);
  });

  it('never returns the enemy that took the direct hit', () => {
    expect(splashTargets(hit, [hit], 40, hit)).toEqual([]);
  });

  it('measures true distance, not per-axis', () => {
    const diagonal = { x: 130, y: 130 }; // ~42.4 px away
    expect(splashTargets(hit, [diagonal], 40, hit)).toEqual([]);
    expect(splashTargets(hit, [diagonal], 43, hit)).toEqual([diagonal]);
  });
});

describe('volleyTargets (CO-044)', () => {
  const origin = { x: 0, y: 0 };
  const a = { x: 10, y: 0 };
  const b = { x: 20, y: 0 };
  const c = { x: 30, y: 0 };

  it('gives each projectile its own nearest enemy', () => {
    expect(volleyTargets(origin, [c, a, b], 2, 400)).toEqual([a, b]);
  });

  it('doubles up on the nearest when there are fewer enemies than projectiles', () => {
    expect(volleyTargets(origin, [b, a], 3, 400)).toEqual([a, b, a]);
  });

  it('fires nothing at nothing', () => {
    expect(volleyTargets(origin, [], 3, 400)).toEqual([]);
  });

  it('ignores enemies past the targeting range', () => {
    expect(volleyTargets(origin, [a, { x: 500, y: 0 }], 2, 400)).toEqual([a, a]);
  });
});

describe('burn (CO-044)', () => {
  it('starts out not burning', () => {
    expect(hasBurn(NO_BURN)).toBe(false);
    expect(tickBurn(NO_BURN, 1)).toEqual({ state: NO_BURN, damage: 0 });
  });

  it('a hit with burn 0 does not start one', () => {
    expect(applyBurn(NO_BURN, 0)).toEqual(NO_BURN);
  });

  it('burns for BURN_DURATION at the given dps', () => {
    const state = applyBurn(NO_BURN, 3);
    expect(hasBurn(state)).toBe(true);
    expect(state).toEqual({ dps: 3, remainingS: BURN_DURATION });
  });

  it('ticks damage proportional to the frame and runs out exactly', () => {
    let state = applyBurn(NO_BURN, 3);
    let total = 0;
    // 2 s in 16.67 ms frames, plus one more past the end.
    for (let i = 0; i < 125; i += 1) {
      const tick = tickBurn(state, 1 / 60);
      state = tick.state;
      total += tick.damage;
    }
    expect(total).toBeCloseTo(3 * BURN_DURATION, 6);
    expect(hasBurn(state)).toBe(false);
  });

  it('a frame longer than the burn pays only what is left', () => {
    const state = applyBurn(NO_BURN, 3);
    expect(tickBurn(state, 10)).toEqual({ state: NO_BURN, damage: 6 });
  });

  it('a second hit refreshes the duration and keeps the stronger dps', () => {
    const { state: half } = tickBurn(applyBurn(NO_BURN, 6), 1);
    expect(applyBurn(half, 3)).toEqual({ dps: 6, remainingS: BURN_DURATION });
    expect(applyBurn(half, 9)).toEqual({ dps: 9, remainingS: BURN_DURATION });
  });

  it('a zero or negative frame changes nothing', () => {
    const state = applyBurn(NO_BURN, 3);
    expect(tickBurn(state, 0)).toEqual({ state, damage: 0 });
    expect(tickBurn(state, -1)).toEqual({ state, damage: 0 });
  });
});

describe('MAX_LIVE_PROJECTILES', () => {
  it('holds every projectile a maxed fire build can have in flight', () => {
    // Split Shot x2 -> 3 per volley; Quick Cast x2 -> 1.2 * 0.85^2 s cooldown;
    // Long Throw -> 550 px at 350 px/s in the air. Volleys in flight at once,
    // rounded up, times projectiles per volley.
    const cooldown = 1.2 * 0.85 * 0.85;
    const flight = (400 + 150) / 350;
    const inFlight = Math.ceil(flight / cooldown) * 3;
    expect(MAX_LIVE_PROJECTILES).toBeGreaterThanOrEqual(inFlight);
  });
});
