import { describe, expect, it } from 'vitest';
import { BOLT_SPEED, boltStep } from './lightningBolt';

describe('boltStep', () => {
  it('moves speed * delta toward the target', () => {
    const step = boltStep({ x: 0, y: 0 }, { x: 300, y: 400 }, 100, 0.5);
    expect(step.x).toBeCloseTo(30);
    expect(step.y).toBeCloseTo(40);
    expect(step.arrived).toBe(false);
  });

  it('lands exactly on the target instead of overshooting', () => {
    expect(boltStep({ x: 0, y: 0 }, { x: 10, y: 0 }, 1000, 1)).toEqual({
      x: 10,
      y: 0,
      arrived: true,
    });
  });

  it('arrives on a step that reaches the target exactly', () => {
    expect(boltStep({ x: 0, y: 0 }, { x: 50, y: 0 }, 100, 0.5).arrived).toBe(true);
  });

  it('arrives at once when already on the target', () => {
    expect(boltStep({ x: 5, y: 5 }, { x: 5, y: 5 }, 100, 0).arrived).toBe(true);
  });

  it('stays put on a zero or negative step short of the target', () => {
    expect(boltStep({ x: 0, y: 0 }, { x: 10, y: 0 }, 100, 0)).toEqual({
      x: 0,
      y: 0,
      arrived: false,
    });
    expect(boltStep({ x: 0, y: 0 }, { x: 10, y: 0 }, 100, -1).x).toBe(0);
  });

  it('follows a target that moves between steps', () => {
    let pos = { x: 0, y: 0 };
    const target = { x: 200, y: 0 };
    let steps = 0;
    for (; steps < 100; steps += 1) {
      target.y += 5; // the enemy walks away sideways
      const step = boltStep(pos, target, 100, 0.1);
      pos = { x: step.x, y: step.y };
      if (step.arrived) break;
    }
    expect(pos).toEqual(target);
    expect(steps).toBeLessThan(100);
  });

  it('crosses the full 400 px target range in under half a second', () => {
    expect(400 / BOLT_SPEED).toBeLessThanOrEqual(0.5);
  });
});
