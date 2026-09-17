import { describe, expect, it } from 'vitest';
import { BOSS } from '../config/boss';
import { bossVelocity, startBossCycle, stepBossCycle, type BossCycle } from './boss';

const ORIGIN = { x: 0, y: 0 };
const CHASE_S = BOSS.cycleS - BOSS.telegraphS - BOSS.chargeS;

/** Run the cycle forward `totalS` seconds in fixed `stepS` slices toward a fixed target. */
function advance(cycle: BossCycle, totalS: number, stepS: number, target = { x: 100, y: 0 }) {
  let next = cycle;
  for (let t = 0; t < totalS - 1e-9; t += stepS) next = stepBossCycle(next, stepS, ORIGIN, target);
  return next;
}

describe('startBossCycle (CO-050)', () => {
  it('opens with a chase that fills the cycle around the telegraph and charge', () => {
    expect(startBossCycle()).toEqual({
      phase: 'chase',
      remainingS: CHASE_S,
      chargeDir: { x: 0, y: 0 },
    });
    expect(CHASE_S).toBeCloseTo(2.6, 9);
  });
});

describe('stepBossCycle phases', () => {
  it('counts a phase down without leaving it', () => {
    const next = stepBossCycle(startBossCycle(), 1, ORIGIN, { x: 100, y: 0 });
    expect(next.phase).toBe('chase');
    expect(next.remainingS).toBeCloseTo(CHASE_S - 1, 9);
  });

  it('runs chase -> telegraph -> charge -> chase, one telegraph before every charge', () => {
    let cycle = startBossCycle();
    cycle = stepBossCycle(cycle, CHASE_S, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('telegraph');
    expect(cycle.remainingS).toBeCloseTo(BOSS.telegraphS, 9);
    cycle = stepBossCycle(cycle, BOSS.telegraphS, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('charge');
    expect(cycle.remainingS).toBeCloseTo(BOSS.chargeS, 9);
    cycle = stepBossCycle(cycle, BOSS.chargeS, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S, 9);
  });

  it('carries a frame that overruns a phase into the next one', () => {
    const next = stepBossCycle(startBossCycle(), CHASE_S + 0.4, ORIGIN, { x: 100, y: 0 });
    expect(next.phase).toBe('telegraph');
    expect(next.remainingS).toBeCloseTo(BOSS.telegraphS - 0.4, 9);
  });

  it('a frame longer than several phases lands in the right one', () => {
    // A whole cycle and a second later: through telegraph and charge, 1 s into the next chase.
    const next = stepBossCycle(startBossCycle(), BOSS.cycleS + 1, ORIGIN, { x: 100, y: 0 });
    expect(next.phase).toBe('chase');
    expect(next.remainingS).toBeCloseTo(CHASE_S - 1, 9);
  });

  it('telegraphs every 4 s over a long run, and every charge follows a telegraph', () => {
    let cycle = startBossCycle();
    let previous = cycle.phase;
    let charges = 0;
    const stepS = 1 / 60;
    for (let t = 0; t < 60; t += stepS) {
      cycle = stepBossCycle(cycle, stepS, ORIGIN, { x: 100, y: 0 });
      if (cycle.phase === 'charge' && previous !== 'charge') {
        expect(previous).toBe('telegraph');
        charges += 1;
      }
      previous = cycle.phase;
    }
    // Charges start at 3.4 s, 7.4 s, ... 59.4 s: fifteen in a minute.
    expect(charges).toBe(15);
  });

  it('ignores a zero, negative or non-finite frame', () => {
    const start = startBossCycle();
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stepBossCycle(start, bad, ORIGIN, { x: 100, y: 0 }), String(bad)).toEqual(start);
    }
  });
});

describe('charge direction lock', () => {
  it('is fixed toward the target where it stood as the telegraph ended', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 });
    // The frame that ends the telegraph sees the player at (30, 40): a 3-4-5 triangle.
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, { x: 30, y: 40 });
    expect(charge.phase).toBe('charge');
    expect(charge.chargeDir.x).toBeCloseTo(0.6, 9);
    expect(charge.chargeDir.y).toBeCloseTo(0.8, 9);
    // The player moves during the charge; the boss does not turn.
    const later = stepBossCycle(charge, 0.2, ORIGIN, { x: -500, y: -500 });
    expect(later.phase).toBe('charge');
    expect(later.chargeDir).toEqual(charge.chargeDir);
  });

  it('does not move during the telegraph, then charges straight along the lock at 400 px/s', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 });
    expect(bossVelocity(telegraph, ORIGIN, { x: 100, y: 0 })).toEqual({ x: 0, y: 0 });
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, { x: 30, y: 40 });
    const v = bossVelocity(charge, ORIGIN, { x: -500, y: -500 });
    expect(v.x).toBeCloseTo(0.6 * BOSS.chargeSpeed, 9);
    expect(v.y).toBeCloseTo(0.8 * BOSS.chargeSpeed, 9);
  });

  it('a target standing on the boss as the telegraph ends leaves it nowhere to charge', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 });
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, ORIGIN);
    expect(charge.phase).toBe('charge');
    expect(bossVelocity(charge, ORIGIN, { x: 100, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('bossVelocity', () => {
  it('chases the target at the boss speed between charges', () => {
    const v = bossVelocity(startBossCycle(), ORIGIN, { x: 0, y: 50 });
    expect(v).toEqual({ x: 0, y: BOSS.speed });
  });

  it('scales every move by the status speed factor, the charge included', () => {
    expect(bossVelocity(startBossCycle(), ORIGIN, { x: 0, y: 50 }, 0.5)).toEqual({
      x: 0,
      y: BOSS.speed * 0.5,
    });
    const charge = advance(startBossCycle(), CHASE_S + BOSS.telegraphS, 0.1);
    expect(charge.phase).toBe('charge');
    const v = bossVelocity(charge, ORIGIN, ORIGIN, 0.5);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(BOSS.chargeSpeed * 0.5, 6);
    expect(bossVelocity(charge, ORIGIN, ORIGIN, 0)).toEqual({ x: 0, y: 0 });
  });
});
