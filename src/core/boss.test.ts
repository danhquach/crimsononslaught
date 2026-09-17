import { describe, expect, it } from 'vitest';
import { BOSS } from '../config/boss';
import { startBossCycle, stepBossCycle, type BossCycle } from './boss';

const ORIGIN = { x: 0, y: 0 };
const CHASE_S = BOSS.cycleS - BOSS.telegraphS - BOSS.chargeS;
/** How far one whole cycle moves the boss: the chase leg plus the charge leg. */
const CYCLE_DISTANCE = CHASE_S * BOSS.speed + BOSS.chargeS * BOSS.chargeSpeed;

/** Run the cycle forward `totalS` seconds in fixed `stepS` slices toward a fixed target. */
function advance(cycle: BossCycle, totalS: number, stepS: number, target = { x: 100, y: 0 }) {
  let next = cycle;
  for (let t = 0; t < totalS - 1e-9; t += stepS)
    next = stepBossCycle(next, stepS, ORIGIN, target).cycle;
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
    const { cycle } = stepBossCycle(startBossCycle(), 1, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S - 1, 9);
  });

  it('runs chase -> telegraph -> charge -> chase, one telegraph before every charge', () => {
    let cycle = startBossCycle();
    cycle = stepBossCycle(cycle, CHASE_S, ORIGIN, { x: 100, y: 0 }).cycle;
    expect(cycle.phase).toBe('telegraph');
    expect(cycle.remainingS).toBeCloseTo(BOSS.telegraphS, 9);
    cycle = stepBossCycle(cycle, BOSS.telegraphS, ORIGIN, { x: 100, y: 0 }).cycle;
    expect(cycle.phase).toBe('charge');
    expect(cycle.remainingS).toBeCloseTo(BOSS.chargeS, 9);
    cycle = stepBossCycle(cycle, BOSS.chargeS, ORIGIN, { x: 100, y: 0 }).cycle;
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S, 9);
  });

  it('carries a frame that overruns a phase into the next one', () => {
    const { cycle } = stepBossCycle(startBossCycle(), CHASE_S + 0.4, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('telegraph');
    expect(cycle.remainingS).toBeCloseTo(BOSS.telegraphS - 0.4, 9);
  });

  it('a frame longer than several phases lands in the right one', () => {
    // A whole cycle and a second later: through telegraph and charge, 1 s into the next chase.
    const { cycle } = stepBossCycle(startBossCycle(), BOSS.cycleS + 1, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S - 1, 9);
  });

  it('telegraphs every 4 s over a long run, and every charge follows a telegraph', () => {
    let cycle = startBossCycle();
    let previous = cycle.phase;
    let charges = 0;
    const stepS = 1 / 60;
    for (let t = 0; t < 60; t += stepS) {
      cycle = stepBossCycle(cycle, stepS, ORIGIN, { x: 100, y: 0 }).cycle;
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
      expect(stepBossCycle(start, bad, ORIGIN, { x: 100, y: 0 }), String(bad)).toEqual({
        cycle: start,
        velocity: { x: 0, y: 0 },
      });
    }
  });
});

describe('charge direction lock', () => {
  it('is fixed toward the target where it stood as the telegraph ended', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 }).cycle;
    // The frame that ends the telegraph sees the player at (30, 40): a 3-4-5 triangle.
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, { x: 30, y: 40 }).cycle;
    expect(charge.phase).toBe('charge');
    expect(charge.chargeDir.x).toBeCloseTo(0.6, 9);
    expect(charge.chargeDir.y).toBeCloseTo(0.8, 9);
    // The player moves during the charge; the boss does not turn.
    const later = stepBossCycle(charge, 0.2, ORIGIN, { x: -500, y: -500 });
    expect(later.cycle.phase).toBe('charge');
    expect(later.cycle.chargeDir).toEqual(charge.chargeDir);
    expect(later.velocity.x).toBeCloseTo(0.6 * BOSS.chargeSpeed, 9);
    expect(later.velocity.y).toBeCloseTo(0.8 * BOSS.chargeSpeed, 9);
  });

  it('does not move during the telegraph, then charges straight along the lock at 400 px/s', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 }).cycle;
    expect(
      stepBossCycle(telegraph, BOSS.telegraphS / 2, ORIGIN, { x: 100, y: 0 }).velocity,
    ).toEqual({ x: 0, y: 0 });
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, { x: 30, y: 40 }).cycle;
    const { velocity } = stepBossCycle(charge, BOSS.chargeS, ORIGIN, { x: -500, y: -500 });
    expect(velocity.x).toBeCloseTo(0.6 * BOSS.chargeSpeed, 9);
    expect(velocity.y).toBeCloseTo(0.8 * BOSS.chargeSpeed, 9);
  });

  it('a target standing on the boss as the telegraph ends leaves it nowhere to charge', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 }).cycle;
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, ORIGIN).cycle;
    expect(charge.phase).toBe('charge');
    expect(stepBossCycle(charge, BOSS.chargeS, ORIGIN, { x: 100, y: 0 }).velocity).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('the velocity a frame asks for', () => {
  it('chases the target at the boss speed between charges', () => {
    expect(stepBossCycle(startBossCycle(), 1, ORIGIN, { x: 0, y: 50 }).velocity).toEqual({
      x: 0,
      y: BOSS.speed,
    });
  });

  it('scales every move by the status speed factor, the charge included', () => {
    expect(stepBossCycle(startBossCycle(), 1, ORIGIN, { x: 0, y: 50 }, 0.5).velocity).toEqual({
      x: 0,
      y: BOSS.speed * 0.5,
    });
    const charge = advance(startBossCycle(), CHASE_S + BOSS.telegraphS, 0.1);
    expect(charge.phase).toBe('charge');
    const { velocity } = stepBossCycle(charge, BOSS.chargeS, ORIGIN, ORIGIN, 0.5);
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(BOSS.chargeSpeed * 0.5, 6);
    expect(stepBossCycle(charge, BOSS.chargeS, ORIGIN, ORIGIN, 0).velocity).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('spreads a frame that spans phases over the whole frame, not the phase it ends in', () => {
    // One whole cycle in one frame: 2.6 s of chase and 0.6 s of charge, both
    // toward (100, 0), with the telegraph standing still between them.
    const { velocity } = stepBossCycle(startBossCycle(), BOSS.cycleS, ORIGIN, { x: 100, y: 0 });
    expect(velocity.y).toBe(0);
    expect(velocity.x * BOSS.cycleS).toBeCloseTo(CYCLE_DISTANCE, 9);
    // Not the chase speed the frame ends in, and not the charge speed either.
    expect(velocity.x).toBeGreaterThan(BOSS.speed);
    expect(velocity.x).toBeLessThan(BOSS.chargeSpeed);
  });

  it('never charges further than 0.6 s of charge, however long the frame', () => {
    // The bug behind #89: a frame longer than the charge used to fly the boss at
    // 400 px/s for its whole length, throwing it thousands of px out of the
    // arena and out of reach of a melee spell.
    for (const deltaS of [1, 1.7, 4, 12, 60]) {
      const { velocity } = stepBossCycle(startBossCycle(), deltaS, ORIGIN, { x: 100, y: 0 });
      const cycles = deltaS / BOSS.cycleS;
      // At most one charge per cycle started, plus the part-cycle the frame ends in.
      const ceiling = (Math.ceil(cycles) * CYCLE_DISTANCE) / deltaS;
      expect(Math.hypot(velocity.x, velocity.y), `${deltaS} s`).toBeLessThanOrEqual(ceiling);
    }
  });

  it('holds the 4 s period over a long frame while moving only what the phases ask', () => {
    // Three whole cycles and a second of the fourth in one frame: three chase
    // legs, three charges and one more second of chase, no more.
    const deltaS = BOSS.cycleS * 3 + 1;
    const { cycle, velocity } = stepBossCycle(startBossCycle(), deltaS, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S - 1, 9);
    expect(velocity.x * deltaS).toBeCloseTo(CYCLE_DISTANCE * 3 + BOSS.speed, 9);
  });
});
