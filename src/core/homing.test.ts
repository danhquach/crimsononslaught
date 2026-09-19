import { describe, expect, it } from 'vitest';
import { type HomingTarget, isLiveTarget, retarget, steerToward, tickLifetime } from './homing';

const SPEED = 300;
const TURN_RATE = 4; // rad/s, Fire Dragon's `homingTurnRate`

const heading = (v: { x: number; y: number }) => Math.atan2(v.y, v.x);
const length = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('steerToward (#137)', () => {
  it('turns no more than the allowed angle when the target is far off the heading', () => {
    // Flying right, target straight up: a 90° correction wanted, only 0.2 rad allowed.
    const next = steerToward({ x: SPEED, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -100 }, 0.2, SPEED);
    expect(heading(next)).toBeCloseTo(-0.2, 6);
    expect(length(next)).toBeCloseTo(SPEED, 6);
  });

  it('snaps onto the target line when the correction is within the allowance', () => {
    const next = steerToward({ x: SPEED, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 10 }, 0.5, SPEED);
    expect(heading(next)).toBeCloseTo(Math.atan2(10, 100), 6);
  });

  it('turns the short way round', () => {
    // Heading at +170°, target at -170°: 20° apart across the ±π seam, not 340° the long way.
    const velocity = { x: Math.cos(170 * (Math.PI / 180)), y: Math.sin(170 * (Math.PI / 180)) };
    const target = { x: Math.cos(-170 * (Math.PI / 180)), y: Math.sin(-170 * (Math.PI / 180)) };
    const next = steerToward(velocity, { x: 0, y: 0 }, target, 0.1, 1);
    expect(heading(next)).toBeCloseTo(170 * (Math.PI / 180) + 0.1, 6);
  });

  it('flies at the given speed even when the current velocity is something else', () => {
    const next = steerToward({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, 1, SPEED);
    expect(next).toEqual({ x: SPEED, y: 0 });
  });

  it('heads straight at the target from a standstill', () => {
    const next = steerToward({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 50 }, 0.1, SPEED);
    expect(next.x).toBeCloseTo(0, 6);
    expect(next.y).toBeCloseTo(SPEED, 6);
  });

  it('keeps its heading when it is on top of the target', () => {
    const next = steerToward({ x: 0, y: -SPEED }, { x: 5, y: 5 }, { x: 5, y: 5 }, 1, SPEED);
    expect(next.x).toBeCloseTo(0, 6);
    expect(next.y).toBeCloseTo(-SPEED, 6);
  });

  it('never turns with a zero allowance', () => {
    const next = steerToward({ x: SPEED, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }, 0, SPEED);
    expect(next).toEqual({ x: SPEED, y: 0 });
  });

  it('reaches a stationary target it was fired away from, stepping at the spec turn rate', () => {
    const dt = 1 / 60;
    const target = { x: -200, y: 40 };
    const pos = { x: 0, y: 0 };
    let velocity = { x: SPEED, y: 0 }; // fired away from it
    let turnedThisStep = 0;
    let closest = Infinity;
    for (let step = 0; step < 60 * 3 && closest > 4; step += 1) {
      const next = steerToward(velocity, pos, target, TURN_RATE * dt, SPEED);
      turnedThisStep = Math.max(turnedThisStep, Math.abs(angleBetween(velocity, next)));
      velocity = next;
      pos.x += velocity.x * dt;
      pos.y += velocity.y * dt;
      closest = Math.min(closest, Math.hypot(target.x - pos.x, target.y - pos.y));
    }
    expect(closest).toBeLessThanOrEqual(4);
    expect(turnedThisStep).toBeLessThanOrEqual(TURN_RATE * dt + 1e-9);
  });
});

function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  let d = heading(b) - heading(a);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const enemy = (x: number, y: number, live = true): HomingTarget & { x: number; y: number } => ({
  x,
  y,
  active: live,
  isDying: false,
});

describe('isLiveTarget', () => {
  it('is a target that is active and not playing its death clip', () => {
    expect(isLiveTarget(enemy(0, 0))).toBe(true);
    expect(isLiveTarget(enemy(0, 0, false))).toBe(false);
    expect(isLiveTarget({ ...enemy(0, 0), isDying: true })).toBe(false);
    expect(isLiveTarget(null)).toBe(false);
  });
});

describe('retarget', () => {
  const from = { x: 100, y: 100 };

  it('picks the nearest live enemy within range of the shot, not of the caster', () => {
    const near = enemy(130, 100);
    const far = enemy(300, 100);
    expect(retarget(from, [far, near], 200)).toBe(near);
  });

  it('skips dying and inactive enemies', () => {
    const dying = { ...enemy(110, 100), isDying: true };
    const gone = enemy(120, 100, false);
    const live = enemy(180, 100);
    expect(retarget(from, [dying, gone, live], 200)).toBe(live);
  });

  it('is null when nothing live is in range', () => {
    expect(retarget(from, [enemy(400, 100), enemy(105, 100, false)], 200)).toBeNull();
    expect(retarget(from, [], 200)).toBeNull();
  });
});

describe('tickLifetime', () => {
  it('counts the run clock down and bottoms out at zero', () => {
    expect(tickLifetime(3, 0.5)).toBe(2.5);
    expect(tickLifetime(0.2, 0.5)).toBe(0);
    expect(tickLifetime(0, 0.5)).toBe(0);
  });
});
