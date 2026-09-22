import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES } from '../config/enemies';
import { GEM_DRIFT_SPEED, PICKUP_RADIUS } from '../config/gems';
import { gemDrift, gemDropCount, withinPickupRadius } from './gems';

describe('gemDropCount', () => {
  it('drops 1 gem per death and 3 for a tank (spec §5)', () => {
    expect(gemDropCount('swarm')).toBe(1);
    expect(gemDropCount('fast')).toBe(1);
    expect(gemDropCount('tank')).toBe(3);
  });

  it('drops at least one gem for every archetype', () => {
    for (const type of ENEMY_TYPES) expect(gemDropCount(type), type).toBeGreaterThanOrEqual(1);
  });
});

describe('withinPickupRadius', () => {
  it('includes the radius itself and excludes anything past it', () => {
    const gem = { x: 0, y: 0 };
    expect(withinPickupRadius(gem, { x: PICKUP_RADIUS - 0.01, y: 0 })).toBe(true);
    expect(withinPickupRadius(gem, { x: PICKUP_RADIUS, y: 0 })).toBe(true);
    expect(withinPickupRadius(gem, { x: PICKUP_RADIUS + 0.01, y: 0 })).toBe(false);
  });

  it('measures true distance, not per-axis', () => {
    const gem = { x: 0, y: 0 };
    // A point at 0.75 x the radius on each axis is inside it per-axis but 1.06 x it away.
    const outside = PICKUP_RADIUS * 0.75;
    const inside = PICKUP_RADIUS * 0.7;
    expect(withinPickupRadius(gem, { x: outside, y: outside })).toBe(false);
    expect(withinPickupRadius(gem, { x: inside, y: inside })).toBe(true);
  });

  it('honours a widened radius, as a perk will ask for', () => {
    expect(withinPickupRadius({ x: 0, y: 0 }, { x: 50, y: 0 }, PICKUP_RADIUS * 1.25)).toBe(true);
  });
});

describe('gemDrift', () => {
  it('stands still while the player is out of range', () => {
    expect(gemDrift({ x: 0, y: 0 }, { x: PICKUP_RADIUS + 1, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('homes in at the drift speed once in range', () => {
    const { x, y } = gemDrift({ x: 0, y: 0 }, { x: 30, y: 0 });
    expect(x).toBeCloseTo(GEM_DRIFT_SPEED, 10);
    expect(y).toBe(0);
  });

  it('normalizes a diagonal drift, so no direction is faster', () => {
    const { x, y } = gemDrift({ x: 0, y: 0 }, { x: -20, y: 20 });
    expect(Math.hypot(x, y)).toBeCloseTo(GEM_DRIFT_SPEED, 10);
    expect(x).toBeCloseTo(-y, 10);
  });

  it('outruns the player, so an in-range gem is always caught', () => {
    expect(GEM_DRIFT_SPEED).toBeGreaterThan(180);
  });

  it('stands still on top of the player instead of dividing by zero', () => {
    expect(gemDrift({ x: 7, y: 7 }, { x: 7, y: 7 })).toEqual({ x: 0, y: 0 });
  });
});
