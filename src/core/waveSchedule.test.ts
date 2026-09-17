import { describe, expect, it } from 'vitest';
import { BOSS_START_TIME, WAVES } from '../config/waves';
import { activeWave, spawnBudget } from './waveSchedule';

/** Sums the spawns a run of `frames` frames of `dt` earns starting at `t`. */
function runFrames(t: number, dt: number, frames: number): number {
  let carry = 0;
  let total = 0;
  for (let i = 0; i < frames; i += 1) {
    const budget = spawnBudget(t + i * dt, dt, carry);
    total += budget.spawns;
    carry = budget.carry;
  }
  return total;
}

describe('activeWave', () => {
  it('holds a wave up to the instant the next one starts', () => {
    expect(activeWave(0)).toBe(WAVES[0]);
    expect(activeWave(59.9)).toBe(WAVES[0]);
    expect(activeWave(60)).toBe(WAVES[1]);
    expect(activeWave(119.9)).toBe(WAVES[1]);
    expect(activeWave(120)).toBe(WAVES[2]);
    expect(activeWave(180)).toBe(WAVES[3]);
    expect(activeWave(240)).toBe(WAVES[4]);
  });

  it('switches to the boss wave at 300 and stays there', () => {
    const boss = WAVES[WAVES.length - 1];
    expect(activeWave(299.9)).toBe(WAVES[4]);
    expect(activeWave(BOSS_START_TIME)).toBe(boss);
    expect(activeWave(600)).toBe(boss);
  });

  it('reads times before the run as the first wave', () => {
    expect(activeWave(-1)).toBe(WAVES[0]);
  });
});

describe('spawnBudget', () => {
  it('yields exactly 2 spawns over one second at 2/s', () => {
    expect(spawnBudget(0, 1).spawns).toBe(2);
    expect(runFrames(0, 1 / 60, 60)).toBe(2);
  });

  it('carries the fraction instead of dropping it', () => {
    const first = spawnBudget(0, 0.25);
    expect(first).toEqual({ spawns: 0, carry: 0.5 });

    const second = spawnBudget(0.25, 0.25, first.carry);
    expect(second.spawns).toBe(1);
    expect(second.carry).toBeCloseTo(0, 10);
  });

  it('pays each wave its own rate over a full run', () => {
    expect(runFrames(0, 1 / 60, 60 * 60)).toBe(2 * 60);
    expect(runFrames(60, 1 / 60, 60 * 60)).toBe(3 * 60);
    expect(runFrames(120, 1 / 60, 60 * 60)).toBe(4 * 60);
    expect(runFrames(180, 1 / 60, 60 * 60)).toBe(6 * 60);
    expect(runFrames(240, 1 / 60, 60 * 60)).toBe(8 * 60);
  });

  it('yields nothing from 300 s on', () => {
    expect(spawnBudget(BOSS_START_TIME, 1)).toEqual({ spawns: 0, carry: 0 });
    expect(spawnBudget(305, 10)).toEqual({ spawns: 0, carry: 0 });
    expect(runFrames(BOSS_START_TIME, 1 / 60, 60 * 60)).toBe(0);
  });

  it('strands a carried fraction once the boss phase starts', () => {
    const before = spawnBudget(299.9, 0.1);
    expect(before.carry).toBeGreaterThan(0);
    expect(spawnBudget(BOSS_START_TIME, 1, before.carry).spawns).toBe(0);
  });

  it('splits a frame that straddles a boundary and pays each side its rate', () => {
    // 0.5 s at 2/s (=1) then 0.5 s at 3/s (=1.5): 2 spawns, 0.5 carried.
    const budget = spawnBudget(59.5, 1);
    expect(budget.spawns).toBe(2);
    expect(budget.carry).toBeCloseTo(0.5, 10);
  });

  it('cuts a frame off at the boss boundary rather than over-paying it', () => {
    // 0.1 s at 8/s = 0.8; the 0.9 s past 300 earns nothing.
    const budget = spawnBudget(299.9, 1);
    expect(budget.spawns).toBe(0);
    expect(budget.carry).toBeCloseTo(0.8, 10);
  });

  it('grants nothing for an empty or backwards frame', () => {
    expect(spawnBudget(10, 0, 0.75)).toEqual({ spawns: 0, carry: 0.75 });
    expect(spawnBudget(10, -1, 0.75)).toEqual({ spawns: 0, carry: 0.75 });
  });
});
