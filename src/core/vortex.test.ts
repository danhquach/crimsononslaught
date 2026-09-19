import { describe, expect, it } from 'vitest';
import {
  NO_FORCE,
  PULL_MOVES_HELD_ENEMIES,
  confineVelocity,
  heldForce,
  pullVelocity,
  sumVelocities,
} from './vortex';

const CENTRE = { x: 400, y: 300 };
const RADIUS = 150;
const STRENGTH = 90;
const DEAD_ZONE = 12;

const pull = (enemy: { x: number; y: number }) =>
  pullVelocity(enemy, CENTRE, RADIUS, STRENGTH, DEAD_ZONE);

describe('pullVelocity', () => {
  it('points straight at the centre at full strength inside the ring', () => {
    expect(pull({ x: 300, y: 300 })).toEqual({ x: 90, y: 0 });
    expect(pull({ x: 400, y: 420 })).toEqual({ x: 0, y: -90 });
  });

  it('is strength-exact from any spot in the ring, diagonals included', () => {
    for (const enemy of [
      { x: 450, y: 350 },
      { x: 310, y: 210 },
      { x: 400 + 149, y: 300 },
      { x: 400, y: 300 - DEAD_ZONE - 0.001 },
    ]) {
      const { x, y } = pull(enemy);
      expect(Math.hypot(x, y), JSON.stringify(enemy)).toBeCloseTo(STRENGTH, 10);
    }
  });

  it('is zero outside the radius, and still pulls exactly on it', () => {
    expect(pull({ x: 400 + RADIUS + 0.001, y: 300 })).toEqual({ x: 0, y: 0 });
    expect(pull({ x: 400 + RADIUS, y: 300 })).toEqual({ x: -90, y: 0 });
  });

  it('has a dead zone: nothing inside or on the minimum radius, so the crowd parks on a ring', () => {
    expect(pull({ x: 400 + DEAD_ZONE, y: 300 })).toEqual({ x: 0, y: 0 });
    expect(pull({ x: 405, y: 297 })).toEqual({ x: 0, y: 0 });
    expect(pull(CENTRE)).toEqual({ x: 0, y: 0 });
  });

  it('is zero with no dead zone at the centre itself, rather than a divide by zero', () => {
    expect(pullVelocity(CENTRE, CENTRE, RADIUS, STRENGTH, 0)).toEqual({ x: 0, y: 0 });
    expect(pullVelocity({ x: 401, y: 300 }, CENTRE, RADIUS, STRENGTH, 0)).toEqual({ x: -90, y: 0 });
  });

  it('is no pull for a zero, negative or NaN strength', () => {
    for (const strength of [0, -5, Number.NaN]) {
      expect(pullVelocity({ x: 300, y: 300 }, CENTRE, RADIUS, strength, DEAD_ZONE)).toEqual({
        x: 0,
        y: 0,
      });
    }
  });
});

describe('sumVelocities', () => {
  it('adds the parts, in any order', () => {
    const chase = { x: 60, y: 0 };
    const pull = { x: -30, y: 40 };
    const shove = { x: 5, y: -5 };
    expect(sumVelocities(chase, pull, shove)).toEqual({ x: 35, y: 35 });
    expect(sumVelocities(shove, pull, chase)).toEqual(sumVelocities(chase, pull, shove));
  });

  it('is zero for nothing, and a copy for one part', () => {
    expect(sumVelocities()).toEqual({ x: 0, y: 0 });
    const only = { x: 3, y: 4 };
    const sum = sumVelocities(only);
    expect(sum).toEqual(only);
    expect(sum).not.toBe(only);
  });

  it('a pull against the chase slows the enemy rather than fighting it', () => {
    const chase = { x: 90, y: 0 };
    const pull = { x: -90, y: 0 };
    expect(sumVelocities(chase, pull)).toEqual({ x: 0, y: 0 });
  });
});

describe('heldForce', () => {
  it('passes the whole force to an enemy that can move', () => {
    expect(heldForce({ x: -30, y: 40 }, 1)).toEqual({ x: -30, y: 40 });
    expect(heldForce({ x: -30, y: 40 }, 0.5)).toEqual({ x: -30, y: 40 });
  });

  it('follows the flag for a fully held (stunned or frozen) enemy', () => {
    const held = heldForce({ x: -30, y: 40 }, 0);
    expect(held).toEqual(PULL_MOVES_HELD_ENEMIES ? { x: -30, y: 40 } : { x: 0, y: 0 });
  });

  it('returns a copy, never the caller’s object', () => {
    expect(heldForce(NO_FORCE, 1)).not.toBe(NO_FORCE);
  });
});

describe('confineVelocity', () => {
  const bounds = { left: 0, right: 800, top: 0, bottom: 600 };
  const deltaS = 0.5;

  it('leaves a step that stays inside untouched', () => {
    expect(confineVelocity({ x: 400, y: 300 }, { x: 100, y: -100 }, deltaS, bounds)).toEqual({
      x: 100,
      y: -100,
    });
  });

  it('trims the component that would leave, and only that one', () => {
    // 790 + 100 * 0.5 = 840 → held at 800, i.e. 10 px in 0.5 s.
    expect(confineVelocity({ x: 790, y: 300 }, { x: 100, y: 40 }, deltaS, bounds)).toEqual({
      x: 20,
      y: 40,
    });
    expect(confineVelocity({ x: 400, y: 5 }, { x: 100, y: -100 }, deltaS, bounds)).toEqual({
      x: 100,
      y: -10,
    });
  });

  it('holds an enemy on the edge still against a push outward', () => {
    expect(confineVelocity({ x: 800, y: 600 }, { x: 50, y: 50 }, deltaS, bounds)).toEqual({
      x: 0,
      y: 0,
    });
    expect(confineVelocity({ x: 0, y: 300 }, { x: -50, y: 0 }, deltaS, bounds)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('does not drag an enemy already outside (the spawn ring) in, only lets it move inward', () => {
    const outside = { x: 900, y: 300 };
    // Pushed further out: held where it is.
    expect(confineVelocity(outside, { x: 100, y: 0 }, deltaS, bounds)).toEqual({ x: 0, y: 0 });
    // Moving in: exactly what was asked, no snap to the edge.
    expect(confineVelocity(outside, { x: -100, y: 0 }, deltaS, bounds)).toEqual({ x: -100, y: 0 });
    // Standing still: not teleported.
    expect(confineVelocity(outside, { x: 0, y: 0 }, deltaS, bounds)).toEqual({ x: 0, y: 0 });
  });

  it('is the velocity as given for a zero or negative step', () => {
    expect(confineVelocity({ x: 800, y: 600 }, { x: 50, y: 50 }, 0, bounds)).toEqual({
      x: 50,
      y: 50,
    });
    expect(confineVelocity({ x: 800, y: 600 }, { x: 50, y: 50 }, -1, bounds)).toEqual({
      x: 50,
      y: 50,
    });
  });
});

describe('a pull and a knockback in the same frame', () => {
  it('add, whichever landed first', () => {
    // The knockback moves the position now; the pull moves it over the step.
    const bounds = { left: 0, right: 800, top: 0, bottom: 600 };
    const deltaS = 1 / 60;
    const start = { x: 300, y: 300 };
    const knock = { x: -20, y: 0 };
    const chase = { x: 60, y: 0 };

    const pullFirst = (() => {
      const force = pullVelocity(start, CENTRE, RADIUS, STRENGTH, DEAD_ZONE);
      const at = { x: start.x + knock.x, y: start.y + knock.y };
      const v = confineVelocity(at, sumVelocities(chase, force), deltaS, bounds);
      return at.x + v.x * deltaS;
    })();
    const knockFirst = (() => {
      const at = { x: start.x + knock.x, y: start.y + knock.y };
      const force = pullVelocity(start, CENTRE, RADIUS, STRENGTH, DEAD_ZONE);
      const v = confineVelocity(at, sumVelocities(force, chase), deltaS, bounds);
      return at.x + v.x * deltaS;
    })();
    expect(pullFirst).toBeCloseTo(knockFirst, 10);
    expect(pullFirst).toBeCloseTo(280 + (60 + 90) / 60, 10);
  });
});
