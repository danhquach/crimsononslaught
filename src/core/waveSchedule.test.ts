import { describe, expect, it } from 'vitest';
import { BOSS_START_TIME, WAVES } from '../config/waves';
import { activeWave, spawnBudget } from './waveSchedule';

/** Per-wave rates by index, so the arithmetic below follows the table when it is tuned. */
const RATE = WAVES.map((wave) => wave.spawnsPerSecond);
/** The last wave before the boss: the one whose rate the boss boundary cuts off. */
const LAST_RATE = RATE[RATE.length - 2]!;
/** Where wave one hands over to wave two. */
const SECOND_WAVE_START = WAVES[1]!.startTime;

/** Sums the spawns a run of `frames` frames of `dt` earns starting at `t`, plus the fraction left over. */
function runFrames(t: number, dt: number, frames: number): { spawns: number; carry: number } {
  let carry = 0;
  let spawns = 0;
  for (let i = 0; i < frames; i += 1) {
    const budget = spawnBudget(t + i * dt, dt, carry);
    spawns += budget.spawns;
    carry = budget.carry;
  }
  return { spawns, carry };
}

describe('activeWave', () => {
  it('holds a wave up to the instant the next one starts', () => {
    expect(activeWave(0)).toBe(WAVES[0]);
    for (let i = 1; i < WAVES.length; i += 1) {
      const start = WAVES[i]!.startTime;
      expect(activeWave(start - 0.1), String(start)).toBe(WAVES[i - 1]);
      expect(activeWave(start), String(start)).toBe(WAVES[i]);
    }
  });

  it('switches to the boss wave at BOSS_START_TIME and stays there', () => {
    const boss = WAVES[WAVES.length - 1];
    expect(activeWave(BOSS_START_TIME - 0.1)).toBe(WAVES[WAVES.length - 2]);
    expect(activeWave(BOSS_START_TIME)).toBe(boss);
    expect(activeWave(BOSS_START_TIME * 2)).toBe(boss);
  });

  it('reads times before the run as the first wave', () => {
    expect(activeWave(-1)).toBe(WAVES[0]);
  });
});

describe('spawnBudget', () => {
  it('yields exactly the wave rate over two seconds, whole frame or sixty', () => {
    // Two seconds so a half-integer rate still comes out whole.
    const expected = 2 * RATE[0]!;
    expect(Number.isInteger(expected)).toBe(true);
    expect(spawnBudget(0, 2).spawns).toBe(expected);
    const run = runFrames(0, 1 / 60, 120);
    expect(run.spawns + run.carry).toBeCloseTo(expected, 6);
  });

  it('carries the fraction instead of dropping it', () => {
    // A frame worth half a spawn, then another: the halves add up to one.
    const dt = 0.5 / RATE[0]!;
    const first = spawnBudget(0, dt);
    expect(first.spawns).toBe(0);
    expect(first.carry).toBeCloseTo(0.5, 10);

    const second = spawnBudget(dt, dt, first.carry);
    expect(second.spawns).toBe(1);
    expect(second.carry).toBeCloseTo(0, 10);
  });

  it('pays each wave its own rate over a full run', () => {
    for (const wave of WAVES.slice(0, -1)) {
      const run = runFrames(wave.startTime, 1 / 60, 60 * 60);
      expect(run.spawns + run.carry, `wave at ${wave.startTime}`).toBeCloseTo(
        60 * wave.spawnsPerSecond,
        6,
      );
    }
  });

  it('yields nothing from the boss on', () => {
    expect(spawnBudget(BOSS_START_TIME, 1)).toEqual({ spawns: 0, carry: 0 });
    expect(spawnBudget(BOSS_START_TIME + 5, 10)).toEqual({ spawns: 0, carry: 0 });
    expect(runFrames(BOSS_START_TIME, 1 / 60, 60 * 60)).toEqual({ spawns: 0, carry: 0 });
  });

  it('strands a carried fraction once the boss phase starts', () => {
    const before = spawnBudget(BOSS_START_TIME - 0.1, 0.1);
    expect(before.carry).toBeGreaterThan(0);
    expect(spawnBudget(BOSS_START_TIME, 1, before.carry).spawns).toBe(0);
  });

  it('splits a frame that straddles a boundary and pays each side its rate', () => {
    // 0.5 s at wave one's rate then 0.5 s at wave two's.
    const owed = 0.5 * RATE[0]! + 0.5 * RATE[1]!;
    const budget = spawnBudget(SECOND_WAVE_START - 0.5, 1);
    expect(budget.spawns).toBe(Math.floor(owed));
    expect(budget.carry).toBeCloseTo(owed - Math.floor(owed), 10);
  });

  it('cuts a frame off at the boss boundary rather than over-paying it', () => {
    // 0.1 s at the last wave's rate; the 0.9 s past the boss earns nothing.
    const owed = 0.1 * LAST_RATE;
    const budget = spawnBudget(BOSS_START_TIME - 0.1, 1);
    expect(budget.spawns).toBe(Math.floor(owed));
    expect(budget.carry).toBeCloseTo(owed - Math.floor(owed), 10);
  });

  it('grants nothing for an empty or backwards frame', () => {
    expect(spawnBudget(10, 0, 0.75)).toEqual({ spawns: 0, carry: 0.75 });
    expect(spawnBudget(10, -1, 0.75)).toEqual({ spawns: 0, carry: 0.75 });
  });
});
