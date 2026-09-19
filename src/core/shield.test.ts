import { describe, expect, it } from 'vitest';
import {
  absorb,
  createShield,
  isUp,
  rechargePerSecond,
  tickShield,
  type ShieldRule,
  type ShieldState,
} from './shield';

/** Ice Shield's block (spec §9.3): 60 points, 6 s delay, so 10 points a second. */
const ICE: ShieldRule = { max: 60, rechargeDelayS: 6 };

describe('createShield', () => {
  it('starts full and ready to absorb', () => {
    expect(createShield(ICE)).toEqual({ pool: 60, waitS: 0 });
    expect(isUp(createShield(ICE))).toBe(true);
  });

  it('is down from the start when the rule carries no pool', () => {
    expect(createShield({ max: 0, rechargeDelayS: 6 })).toEqual({ pool: 0, waitS: 0 });
    expect(isUp(createShield({ max: -5, rechargeDelayS: 6 }))).toBe(false);
  });
});

describe('absorb', () => {
  it('swallows a hit smaller than the pool and passes nothing through', () => {
    const { state, passThrough, broke } = absorb(createShield(ICE), 25, ICE);
    expect(state.pool).toBe(35);
    expect(passThrough).toBe(0);
    expect(broke).toBe(false);
  });

  it('splits a hit larger than the pool between the shield and the player', () => {
    const { state, passThrough, broke } = absorb({ pool: 10, waitS: 0 }, 25, ICE);
    expect(state.pool).toBe(0);
    expect(passThrough).toBe(15);
    expect(broke).toBe(true);
  });

  it('breaks on a hit exactly equal to the pool, with nothing passed through', () => {
    const { state, passThrough, broke } = absorb({ pool: 10, waitS: 0 }, 10, ICE);
    expect(state.pool).toBe(0);
    expect(passThrough).toBe(0);
    expect(broke).toBe(true);
  });

  it('breaks once for overlapping hits in the same frame', () => {
    const first = absorb({ pool: 10, waitS: 0 }, 10, ICE);
    const second = absorb(first.state, 10, ICE);
    const third = absorb(second.state, 10, ICE);
    expect([first.broke, second.broke, third.broke]).toEqual([true, false, false]);
    // Everything after the break lands on the player in full.
    expect([second.passThrough, third.passThrough]).toEqual([10, 10]);
  });

  it('re-arms the recharge delay on every hit it absorbs', () => {
    const dented = absorb({ pool: 60, waitS: 1 }, 5, ICE);
    expect(dented.state.waitS).toBe(6);
  });

  it('leaves the wait alone for a hit a broken shield cannot absorb', () => {
    const { state, passThrough, broke } = absorb({ pool: 0, waitS: 2 }, 30, ICE);
    expect(state).toEqual({ pool: 0, waitS: 2 });
    expect(passThrough).toBe(30);
    expect(broke).toBe(false);
  });

  it('ignores a non-positive or non-finite hit', () => {
    for (const amount of [0, -5, NaN, Infinity]) {
      const result = absorb({ pool: 60, waitS: 0 }, amount, ICE);
      expect(result.state, `${amount}`).toEqual({ pool: 60, waitS: 0 });
      expect(result.passThrough, `${amount}`).toBe(0);
      expect(result.broke, `${amount}`).toBe(false);
    }
  });

  it('never mutates the state it was given', () => {
    const before: ShieldState = { pool: 60, waitS: 0 };
    absorb(before, 25, ICE);
    expect(before).toEqual({ pool: 60, waitS: 0 });
  });
});

describe('rechargePerSecond', () => {
  it('refills the whole pool over one delay (spec §9.3)', () => {
    expect(rechargePerSecond(ICE)).toBe(10);
    expect(rechargePerSecond({ max: 80, rechargeDelayS: 8 })).toBe(10);
  });

  it('never recharges on a rule with no pool or no delay', () => {
    expect(rechargePerSecond({ max: 0, rechargeDelayS: 6 })).toBe(0);
    expect(rechargePerSecond({ max: 60, rechargeDelayS: 0 })).toBe(0);
    expect(rechargePerSecond({ max: 60, rechargeDelayS: Infinity })).toBe(0);
  });
});

describe('tickShield', () => {
  it('holds the pool while the delay is still running', () => {
    const dented = absorb({ pool: 60, waitS: 0 }, 20, ICE).state;
    const after = tickShield(dented, 5.9, ICE);
    expect(after).toEqual({ pool: 40, waitS: expect.closeTo(0.1, 10) });
  });

  it('starts recharging on the delay boundary, spending the rest of the frame', () => {
    // 1 s frame: 0.5 s finishes the delay, the other 0.5 s is worth 5 points.
    const after = tickShield({ pool: 40, waitS: 0.5 }, 1, ICE);
    expect(after).toEqual({ pool: 45, waitS: 0 });
  });

  it('refills at shieldHp / rechargeDelay per second and stops at the maximum', () => {
    let state: ShieldState = { pool: 0, waitS: 0 };
    for (let i = 0; i < 6; i += 1) state = tickShield(state, 1, ICE);
    expect(state.pool).toBe(60);
    expect(tickShield(state, 1, ICE)).toEqual({ pool: 60, waitS: 0 });
  });

  it('brings a broken shield back on the frame that crosses its cooldown', () => {
    const broken = absorb({ pool: 10, waitS: 0 }, 10, ICE).state;
    expect(broken).toEqual({ pool: 0, waitS: 6 });

    // The delay exactly spent: the wait is over but no run time is left to
    // refill with, so the shield comes back on the frame *after* the boundary.
    const atBoundary = tickShield(broken, 6, ICE);
    expect(atBoundary).toEqual({ pool: 0, waitS: 0 });
    expect(isUp(atBoundary)).toBe(false);
    expect(isUp(tickShield(atBoundary, 0.1, ICE))).toBe(true);

    // One frame straddling the boundary is the same thing in a single step:
    // the delay comes out of it first and only the remainder reaches the pool.
    expect(tickShield(broken, 6.5, ICE)).toEqual({ pool: 5, waitS: 0 });
  });

  it('reaches the same pool however the frames are cut (a scaled run)', () => {
    const start: ShieldState = { pool: 0, waitS: 6 };
    const oneFrame = tickShield(start, 9, ICE);
    let stepped = start;
    for (let i = 0; i < 90; i += 1) stepped = tickShield(stepped, 0.1, ICE);
    expect(stepped.pool).toBeCloseTo(oneFrame.pool, 10);
    expect(oneFrame.pool).toBe(30);
  });

  it('leaves a zero-length or bad frame exactly where it was', () => {
    const state: ShieldState = { pool: 40, waitS: 2 };
    for (const delta of [0, -1, NaN, Infinity]) {
      expect(tickShield(state, delta, ICE), `${delta}`).toEqual(state);
    }
  });

  it('never refills a pool the rule can no longer hold (spec §6.2)', () => {
    expect(tickShield({ pool: 80, waitS: 0 }, 1, ICE)).toEqual({ pool: 80, waitS: 0 });
  });

  it('never mutates the state it was given', () => {
    const before: ShieldState = { pool: 40, waitS: 2 };
    tickShield(before, 1, ICE);
    expect(before).toEqual({ pool: 40, waitS: 2 });
  });
});
