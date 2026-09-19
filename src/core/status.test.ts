import { describe, expect, it } from 'vitest';
import { applyStun, stunSpeedFactor, tickStun } from './chainLightning';
import {
  NO_BLEED,
  applyBleed,
  applyStagger,
  hasBleed,
  reduceDamage,
  staggerSpeedFactor,
  tickBleed,
  tickStagger,
} from './status';

describe('applyBleed (#139)', () => {
  it('starts a bleed at the hit’s dps and duration', () => {
    expect(applyBleed(NO_BLEED, 4, 3)).toEqual({ dps: 4, remainingS: 3 });
    expect(hasBleed(applyBleed(NO_BLEED, 4, 3))).toBe(true);
  });

  it('does nothing for a hit with no dps or no duration, and leaves a running bleed alone', () => {
    expect(applyBleed(NO_BLEED, 0, 3)).toEqual(NO_BLEED);
    expect(applyBleed(NO_BLEED, 4, 0)).toEqual(NO_BLEED);
    const running = { dps: 4, remainingS: 1.5 };
    expect(applyBleed(running, 0, 3)).toEqual(running);
    expect(applyBleed(running, 4, 0)).toEqual(running);
  });

  // AC: stacking boundary — a second hit takes the maximum, never the sum.
  it('keeps the higher dps and the longer clock rather than adding', () => {
    const running = { dps: 4, remainingS: 1.5 };
    expect(applyBleed(running, 4, 3)).toEqual({ dps: 4, remainingS: 3 });
    expect(applyBleed(running, 6, 1)).toEqual({ dps: 6, remainingS: 1.5 });
    expect(applyBleed(running, 2, 3)).toEqual({ dps: 4, remainingS: 3 });
    expect(applyBleed(running, 2, 1)).toEqual(running);
  });

  it('ignores the dps of a bleed that has run out', () => {
    expect(applyBleed({ dps: 9, remainingS: 0 }, 4, 3)).toEqual({ dps: 4, remainingS: 3 });
  });

  it('does not mutate its input', () => {
    const running = { dps: 4, remainingS: 1.5 };
    applyBleed(running, 6, 3);
    expect(running).toEqual({ dps: 4, remainingS: 1.5 });
  });
});

describe('tickBleed (#139)', () => {
  it('pays the frame’s share of the dps and counts the clock down', () => {
    const { state, damage } = tickBleed({ dps: 4, remainingS: 3 }, 0.5);
    expect(damage).toBe(2);
    expect(state).toEqual({ dps: 4, remainingS: 2.5 });
  });

  it('pays exactly dps × duration over its life however the frames fall', () => {
    let state = applyBleed(NO_BLEED, 4, 3);
    let total = 0;
    for (const deltaS of [0.7, 0.016, 1.1, 0.4, 2]) {
      const tick = tickBleed(state, deltaS);
      state = tick.state;
      total += tick.damage;
    }
    expect(total).toBeCloseTo(12);
    expect(state).toEqual(NO_BLEED);
    expect(hasBleed(state)).toBe(false);
  });

  it('never pays past what is left on the last frame', () => {
    const { state, damage } = tickBleed({ dps: 4, remainingS: 0.25 }, 1);
    expect(damage).toBe(1);
    expect(state).toEqual(NO_BLEED);
  });

  it('pays nothing with no bleed or no time', () => {
    expect(tickBleed(NO_BLEED, 0.5)).toEqual({ state: NO_BLEED, damage: 0 });
    expect(tickBleed({ dps: 4, remainingS: 3 }, 0).damage).toBe(0);
  });

  // AC: survives the enemy being hit again — a refresh mid-tick keeps paying at the new rate.
  it('keeps paying at the refreshed rate after a hit lands mid-bleed', () => {
    let state = applyBleed(NO_BLEED, 4, 3);
    let total = 0;
    const first = tickBleed(state, 1);
    state = first.state;
    total += first.damage;
    expect(total).toBe(4);
    state = applyBleed(state, 6, 3);
    expect(state).toEqual({ dps: 6, remainingS: 3 });
    for (let i = 0; i < 6; i += 1) {
      const tick = tickBleed(state, 0.5);
      state = tick.state;
      total += tick.damage;
    }
    expect(total).toBeCloseTo(4 + 18);
    expect(hasBleed(state)).toBe(false);
  });
});

describe('applyStagger / staggerSpeedFactor / tickStagger (#139)', () => {
  it('stops the enemy for the stagger and frees it when it runs out', () => {
    const remaining = applyStagger(0, 0.5);
    expect(remaining).toBe(0.5);
    expect(staggerSpeedFactor(remaining)).toBe(0);
    const tick = tickStagger(remaining, 0.5);
    expect(tick).toEqual({ remainingS: 0, ended: true });
    expect(staggerSpeedFactor(tick.remainingS)).toBe(1);
  });

  // AC: stacking boundary — refresh, never stack.
  it('refreshes to the longer stop rather than adding', () => {
    expect(applyStagger(0.2, 0.5)).toBe(0.5);
    expect(applyStagger(0.4, 0.3)).toBe(0.4);
    expect(applyStagger(0.5, 0.5)).toBe(0.5);
  });

  it('does nothing for a hit with no stagger', () => {
    expect(applyStagger(0.2, 0)).toBe(0.2);
    expect(applyStagger(0, 0)).toBe(0);
  });

  it('reports the end exactly once and never goes negative', () => {
    expect(tickStagger(0.3, 0.1)).toEqual({ remainingS: 0.3 - 0.1, ended: false });
    expect(tickStagger(0.1, 1)).toEqual({ remainingS: 0, ended: true });
    expect(tickStagger(0, 1)).toEqual({ remainingS: 0, ended: false });
    expect(tickStagger(0.3, 0)).toEqual({ remainingS: 0.3, ended: false });
  });

  // AC: stagger and stun coexist — the factor is 0 until the longer one ends.
  it('holds the enemy alongside a stun until the longer of the two ends', () => {
    let stunS = applyStun(0, 0.3);
    let staggerS = applyStagger(0, 0.5);
    const factor = () => stunSpeedFactor(stunS) * staggerSpeedFactor(staggerS);
    expect(factor()).toBe(0);

    const step = (deltaS: number) => {
      stunS = tickStun(stunS, deltaS).remainingS;
      staggerS = tickStagger(staggerS, deltaS).remainingS;
    };
    step(0.3);
    expect(stunS).toBe(0);
    expect(factor()).toBe(0);
    step(0.1);
    expect(factor()).toBe(0);
    step(0.1);
    expect(staggerS).toBeCloseTo(0);
    expect(factor()).toBe(1);
  });

  it('holds the enemy when the stun is the longer one', () => {
    let stunS = applyStun(0, 2);
    let staggerS = applyStagger(0, 0.5);
    stunS = tickStun(stunS, 1).remainingS;
    staggerS = tickStagger(staggerS, 1).remainingS;
    expect(staggerS).toBe(0);
    expect(stunSpeedFactor(stunS) * staggerSpeedFactor(staggerS)).toBe(0);
  });
});

describe('reduceDamage (#139)', () => {
  it('removes the fraction from the hit', () => {
    expect(reduceDamage(10, 0.25)).toBe(7.5);
    expect(reduceDamage(10, 0)).toBe(10);
    expect(reduceDamage(10, 0.6)).toBeCloseTo(4);
  });

  it('clamps the fraction to 0–1 and treats anything unusable as 0', () => {
    expect(reduceDamage(10, 1)).toBe(0);
    expect(reduceDamage(10, 1.5)).toBe(0);
    expect(reduceDamage(10, -0.5)).toBe(10);
    expect(reduceDamage(10, Number.NaN)).toBe(10);
    expect(reduceDamage(10, Number.POSITIVE_INFINITY)).toBe(10);
  });

  it('is 0 for a non-positive hit', () => {
    expect(reduceDamage(0, 0.5)).toBe(0);
    expect(reduceDamage(-4, 0.5)).toBe(0);
  });
});
