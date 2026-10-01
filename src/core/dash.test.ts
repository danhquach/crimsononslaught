import { describe, expect, it } from 'vitest';
import { BASE_DASH, DASH_TRAIL, type DashStats } from '../config/dash';
import { INVULN_MS } from '../config/player';
import {
  IDLE_DASH,
  cooldownProgress,
  dashDirection,
  dashVelocity,
  facingVector,
  isDashInvulnerable,
  isDashReady,
  isDashing,
  sanitizeDashStats,
  tickDash,
  tryStartDash,
  type DashState,
  type TickResult,
} from './dash';
import { createHealth, takeDamage, tickHealth } from './health';

const SPACING = DASH_TRAIL.spacingMs;

/** Press once, then run steps of `stepMs` until `totalMs` has passed; collects what the steps said. */
function run(
  stepMs: number,
  totalMs: number,
  move = { x: 1, y: 0 },
  stats: DashStats = BASE_DASH,
): { state: DashState; x: number; y: number; ticks: TickResult[] } {
  let state = tryStartDash(IDLE_DASH, stats, move, 'down').state;
  let x = 0;
  let y = 0;
  const ticks: TickResult[] = [];
  for (let t = 0; t < totalMs - 1e-9; t += stepMs) {
    const tick = tickDash(state, stats, stepMs, SPACING);
    state = tick.state;
    x += tick.displacement.x;
    y += tick.displacement.y;
    ticks.push(tick);
  }
  return { state, x, y, ticks };
}

describe('starting values (#384)', () => {
  it('are 120 px in 150 ms, 200 ms of invulnerability and a 3 s cooldown', () => {
    expect(BASE_DASH).toEqual({
      distancePx: 120,
      durationMs: 150,
      invulnMs: 200,
      cooldownMs: 3000,
    });
  });

  it('keeps the window apart from the 0.5 s after a hit', () => {
    expect(BASE_DASH.invulnMs).toBeLessThan(INVULN_MS);
  });

  it('sizes the trail pool to the ghosts the base dash lays', () => {
    expect(Math.ceil(BASE_DASH.durationMs / DASH_TRAIL.spacingMs)).toBe(DASH_TRAIL.poolSize);
    expect(DASH_TRAIL.ghostAlpha).toBeLessThanOrEqual(0.6);
  });
});

describe('directions', () => {
  it('goes along the held move, normalised', () => {
    expect(dashDirection({ x: 3, y: 0 }, 'down')).toEqual({ x: 1, y: 0 });
    const diagonal = dashDirection({ x: 1, y: 1 }, 'left');
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 12);
  });

  it('goes the way the hero last faced when standing still', () => {
    for (const facing of ['down', 'up', 'left', 'right'] as const) {
      expect(dashDirection({ x: 0, y: 0 }, facing)).toEqual(facingVector(facing));
    }
  });
});

describe('distance', () => {
  it.each([4, 16, 16.67, 50, 150, 1000])('is exact at a %f ms step', (stepMs) => {
    const { x, y, state } = run(stepMs, 150 + stepMs);
    expect(x).toBeCloseTo(120, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(state.dashing).toBe(false);
  });

  it('is exact on a diagonal', () => {
    const { x, y } = run(16, 400, { x: 1, y: 1 });
    expect(Math.hypot(x, y)).toBeCloseTo(120, 9);
    expect(x).toBeCloseTo(y, 9);
  });

  it('is exact standing still, along the last facing', () => {
    let state = tryStartDash(IDLE_DASH, BASE_DASH, { x: 0, y: 0 }, 'left').state;
    let x = 0;
    for (let i = 0; i < 20; i++) {
      const tick = tickDash(state, BASE_DASH, 16, SPACING);
      state = tick.state;
      x += tick.displacement.x;
    }
    expect(x).toBeCloseTo(-120, 9);
  });

  it('follows a changed stats block, the one place a spell changes', () => {
    const stats = { ...BASE_DASH, distancePx: 200, durationMs: 100 };
    const { x } = run(16, 300, { x: 0, y: 1 }, stats);
    expect(x).toBeCloseTo(0, 9);
    expect(run(16, 300, { x: 0, y: 1 }, stats).y).toBeCloseTo(200, 9);
  });

  it('moves at a steady speed until the last step, which is scaled to land', () => {
    const { ticks } = run(50, 200);
    const speeds = ticks.map((t) => dashVelocity(t.displacement, 50).x);
    expect(speeds[0]).toBeCloseTo(800, 6);
    expect(speeds[1]).toBeCloseTo(800, 6);
    expect(speeds[2]).toBeCloseTo(800, 6);
    expect(speeds[3]).toBe(0);
  });

  it('gives a zero velocity for an empty step', () => {
    expect(dashVelocity({ x: 5, y: 5 }, 0)).toEqual({ x: 0, y: 0 });
  });

  it('ends exactly once', () => {
    const { ticks } = run(16, 400);
    expect(ticks.filter((t) => t.ended)).toHaveLength(1);
  });
});

describe('presses and the cooldown', () => {
  it('ignores a press during the dash', () => {
    const first = tryStartDash(IDLE_DASH, BASE_DASH, { x: 1, y: 0 }, 'down');
    const mid = tickDash(first.state, BASE_DASH, 50, SPACING).state;
    const again = tryStartDash(mid, BASE_DASH, { x: 0, y: 1 }, 'down');
    expect(again.started).toBe(false);
    expect(again.state).toBe(mid);
  });

  it('ignores a press during the cooldown, and takes one after it', () => {
    let { state } = run(16, 1000);
    expect(isDashing(state)).toBe(false);
    expect(isDashReady(state)).toBe(false);
    const early = tryStartDash(state, BASE_DASH, { x: 1, y: 0 }, 'down');
    expect(early.started).toBe(false);
    expect(early.state).toBe(state);
    for (let t = 1000; t < 3100; t += 16) state = tickDash(state, BASE_DASH, 16, SPACING).state;
    expect(isDashReady(state)).toBe(true);
    expect(tryStartDash(state, BASE_DASH, { x: 1, y: 0 }, 'down').started).toBe(true);
  });

  it('starts ready', () => {
    expect(isDashReady(IDLE_DASH)).toBe(true);
    expect(cooldownProgress(IDLE_DASH, BASE_DASH)).toBe(1);
    expect(isDashInvulnerable(IDLE_DASH)).toBe(false);
  });

  it('reports the cooldown from 0 to 1, from the press', () => {
    let state = tryStartDash(IDLE_DASH, BASE_DASH, { x: 1, y: 0 }, 'down').state;
    expect(cooldownProgress(state, BASE_DASH)).toBe(0);
    state = tickDash(state, BASE_DASH, 1500, SPACING).state;
    expect(cooldownProgress(state, BASE_DASH)).toBeCloseTo(0.5, 9);
    state = tickDash(state, BASE_DASH, 1500, SPACING).state;
    expect(cooldownProgress(state, BASE_DASH)).toBe(1);
  });

  it.each([4, 16, 50, 4000])('fires ready on exactly one step, at a %f ms step', (stepMs) => {
    const { ticks } = run(stepMs, 6000);
    expect(ticks.filter((t) => t.ready)).toHaveLength(1);
  });

  it('never fires ready for a dash that was not taken', () => {
    let state = IDLE_DASH;
    for (let i = 0; i < 10; i++) {
      const tick = tickDash(state, BASE_DASH, 16, SPACING);
      expect(tick.ready).toBe(false);
      state = tick.state;
    }
  });
});

describe('invulnerability window', () => {
  it('lasts the configured time from the press, whatever the step', () => {
    for (const stepMs of [4, 16, 50]) {
      let state = tryStartDash(IDLE_DASH, BASE_DASH, { x: 1, y: 0 }, 'down').state;
      expect(isDashInvulnerable(state)).toBe(true);
      let elapsed = 0;
      while (isDashInvulnerable(state)) {
        state = tickDash(state, BASE_DASH, stepMs, SPACING).state;
        elapsed += stepMs;
      }
      expect(elapsed).toBeGreaterThanOrEqual(BASE_DASH.invulnMs);
      expect(elapsed).toBeLessThan(BASE_DASH.invulnMs + stepMs);
    }
  });

  it('outlasts the burst on its own clock', () => {
    let state = tryStartDash(IDLE_DASH, BASE_DASH, { x: 1, y: 0 }, 'down').state;
    state = tickDash(state, BASE_DASH, 160, SPACING).state;
    expect(isDashing(state)).toBe(false);
    expect(isDashInvulnerable(state)).toBe(true);
  });

  it('does not touch the health window: a hit neither extends nor resets it', () => {
    const dash = tryStartDash(IDLE_DASH, BASE_DASH, { x: 1, y: 0 }, 'down').state;
    const health = createHealth();
    const hit = takeDamage(health, 10).state;
    expect(hit.invulnMs).toBe(INVULN_MS);
    const later = tickDash(dash, BASE_DASH, 100, SPACING).state;
    expect(tickHealth(hit, 100).invulnMs).toBe(INVULN_MS - 100);
    expect(later.invulnMs).toBe(BASE_DASH.invulnMs - 100);
  });
});

describe('trail ledger', () => {
  const lay = (stepMs: number): number[] => run(stepMs, 300).ticks.flatMap((t) => [...t.trail]);

  it('lays one ghost per spacing, the first at the take-off, none at the end', () => {
    const points = lay(16);
    expect(points).toHaveLength(DASH_TRAIL.poolSize);
    expect(points[0]).toBe(0);
    for (let i = 0; i < points.length; i++) {
      expect(points[i]).toBeCloseTo(120 * ((i * SPACING) / 150), 9);
    }
    expect(Math.max(...points)).toBeLessThan(120);
  });

  it.each([4, 50, 150, 1000])('lays the same ghosts at a %f ms step', (stepMs) => {
    expect(lay(stepMs)).toEqual(lay(16));
  });

  it('lays nothing once the dash is over', () => {
    const { ticks } = run(16, 400);
    const after = ticks.slice(Math.ceil(150 / 16) + 1);
    expect(after.every((t) => t.trail.length === 0)).toBe(true);
  });

  it('lays no ghost for a spacing of zero', () => {
    const state = tryStartDash(IDLE_DASH, BASE_DASH, { x: 1, y: 0 }, 'down').state;
    expect(tickDash(state, BASE_DASH, 16, 0).trail).toEqual([]);
  });
});

describe('sanitizeDashStats', () => {
  it('keeps a cooldown at least as long as the burst, and 0 as no cooldown', () => {
    expect(sanitizeDashStats({ cooldownMs: 100 }, BASE_DASH).cooldownMs).toBe(BASE_DASH.durationMs);
    expect(sanitizeDashStats({ cooldownMs: 0 }, BASE_DASH).cooldownMs).toBe(0);
  });

  it('lays a usable patch over the base', () => {
    expect(sanitizeDashStats({ cooldownMs: 1500 }, BASE_DASH)).toEqual({
      ...BASE_DASH,
      cooldownMs: 1500,
    });
  });

  it('keeps the base for a value that would freeze or break the dash', () => {
    const bad = { distancePx: 0, durationMs: -5, invulnMs: Number.NaN, cooldownMs: Infinity };
    expect(sanitizeDashStats(bad, BASE_DASH)).toEqual(BASE_DASH);
  });
});
