import { describe, expect, it } from 'vitest';
import {
  absorb,
  createShield,
  EMPTY_TALLY,
  isUp,
  tallyShield,
  type ShieldRule,
  type ShieldState,
} from './shield';

/** Ice Shield's block: a 60-point pool. */
const ICE: ShieldRule = { max: 60 };

describe('createShield', () => {
  it('starts full and ready to absorb', () => {
    expect(createShield(ICE)).toEqual({ pool: 60 });
    expect(isUp(createShield(ICE))).toBe(true);
  });

  it('is down from the start when the rule carries no pool', () => {
    expect(createShield({ max: 0 })).toEqual({ pool: 0 });
    expect(isUp(createShield({ max: -5 }))).toBe(false);
  });
});

describe('absorb', () => {
  it('swallows a hit smaller than the pool and passes nothing through', () => {
    const { state, passThrough, broke } = absorb(createShield(ICE), 25);
    expect(state.pool).toBe(35);
    expect(passThrough).toBe(0);
    expect(broke).toBe(false);
  });

  it('splits a hit larger than the pool between the shield and the player', () => {
    const { state, passThrough, broke } = absorb({ pool: 10 }, 25);
    expect(state.pool).toBe(0);
    expect(passThrough).toBe(15);
    expect(broke).toBe(true);
  });

  it('breaks on a hit exactly equal to the pool, with nothing passed through', () => {
    const { state, passThrough, broke } = absorb({ pool: 10 }, 10);
    expect(state.pool).toBe(0);
    expect(passThrough).toBe(0);
    expect(broke).toBe(true);
  });

  it('breaks once for overlapping hits in the same frame', () => {
    const first = absorb({ pool: 10 }, 10);
    const second = absorb(first.state, 10);
    const third = absorb(second.state, 10);
    expect([first.broke, second.broke, third.broke]).toEqual([true, false, false]);
    // Everything after the break lands on the player in full.
    expect([second.passThrough, third.passThrough]).toEqual([10, 10]);
  });

  it('ignores a non-positive or non-finite hit', () => {
    for (const amount of [0, -5, NaN, Infinity]) {
      const result = absorb({ pool: 60 }, amount);
      expect(result.state, `${amount}`).toEqual({ pool: 60 });
      expect(result.passThrough, `${amount}`).toBe(0);
      expect(result.broke, `${amount}`).toBe(false);
    }
  });

  it('never mutates the state it was given', () => {
    const before: ShieldState = { pool: 60 };
    absorb(before, 25);
    expect(before).toEqual({ pool: 60 });
  });
});

describe('tallyShield', () => {
  it('starts empty', () => {
    expect(EMPTY_TALLY).toEqual({ absorbed: 0, regrown: 0 });
  });

  it('counts what a hit swallowed, not what passed through to the player', () => {
    const before: ShieldState = { pool: 10 };
    const { state } = absorb(before, 25);
    expect(tallyShield(EMPTY_TALLY, before, state)).toEqual({ absorbed: 10, regrown: 0 });
  });

  it('counts what a shield returning full put back', () => {
    const broken = absorb({ pool: 10 }, 10).state;
    let tally = tallyShield(EMPTY_TALLY, { pool: 10 }, broken);
    tally = tallyShield(tally, broken, createShield(ICE));
    expect(tally).toEqual({ absorbed: 10, regrown: 60 });
  });

  it('adds nothing for a step that leaves the pool where it was', () => {
    const tally = { absorbed: 5, regrown: 3 };
    const held: ShieldState = { pool: 40 };
    expect(tallyShield(tally, held, { ...held })).toEqual(tally);
    expect(tallyShield(tally, held, { pool: NaN })).toEqual(tally);
  });

  it('hands back the same tally when the pool did not move', () => {
    const tally = { absorbed: 5, regrown: 3 };
    const full: ShieldState = { pool: 60 };
    expect(tallyShield(tally, full, { ...full })).toBe(tally);
    expect(tallyShield(tally, full, { pool: 70 })).not.toBe(tally);
  });

  it('never mutates the tally it was given', () => {
    const before = { absorbed: 5, regrown: 3 };
    tallyShield(before, { pool: 40 }, { pool: 45 });
    expect(before).toEqual({ absorbed: 5, regrown: 3 });
  });
});
