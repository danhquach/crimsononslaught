import { describe, expect, it } from 'vitest';
import { MAX_LIVE_ENEMIES } from '../config/enemies';
import {
  CONTACT_DAMAGE_INTERVAL_MS,
  canSpawn,
  chaseVelocity,
  damageEnemy,
  tickContactCooldown,
  tryContact,
} from './enemy';

describe('chaseVelocity', () => {
  it('moves straight at the target at the given speed', () => {
    expect(chaseVelocity({ x: 0, y: 0 }, { x: 10, y: 0 }, 90)).toEqual({ x: 90, y: 0 });
    expect(chaseVelocity({ x: 0, y: 0 }, { x: 0, y: -4 }, 50)).toEqual({ x: 0, y: -50 });
  });

  it('normalizes diagonals, so a corner chase is no faster', () => {
    const { x, y } = chaseVelocity({ x: 0, y: 0 }, { x: 5, y: 5 }, 200);
    expect(Math.hypot(x, y)).toBeCloseTo(200, 10);
    expect(x).toBeCloseTo(y, 10);
  });

  it('is speed-exact from any distance', () => {
    for (const to of [
      { x: 1, y: 0 },
      { x: 1000, y: -3000 },
      { x: -0.01, y: 0.02 },
    ]) {
      const { x, y } = chaseVelocity({ x: 0, y: 0 }, to, 90);
      expect(Math.hypot(x, y), JSON.stringify(to)).toBeCloseTo(90, 10);
    }
  });

  it('stands still on top of the target instead of dividing by zero', () => {
    expect(chaseVelocity({ x: 7, y: 7 }, { x: 7, y: 7 }, 90)).toEqual({ x: 0, y: 0 });
  });

  it('stands still at zero or negative speed', () => {
    expect(chaseVelocity({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
    expect(chaseVelocity({ x: 0, y: 0 }, { x: 10, y: 0 }, -90)).toEqual({ x: 0, y: 0 });
  });
});

describe('canSpawn', () => {
  it('allows spawns up to the cap and drops the 301st', () => {
    expect(canSpawn(0)).toBe(true);
    expect(canSpawn(MAX_LIVE_ENEMIES - 1)).toBe(true);
    expect(canSpawn(MAX_LIVE_ENEMIES)).toBe(false);
    expect(canSpawn(MAX_LIVE_ENEMIES + 1)).toBe(false);
  });

  it('takes an explicit cap', () => {
    expect(canSpawn(1, 2)).toBe(true);
    expect(canSpawn(2, 2)).toBe(false);
  });
});

describe('contact damage cadence', () => {
  it('is the spec §5 half second', () => {
    expect(CONTACT_DAMAGE_INTERVAL_MS).toBe(500);
  });

  it('lands the first touch and opens the window', () => {
    expect(tryContact(0)).toEqual({ cooldownMs: CONTACT_DAMAGE_INTERVAL_MS, hit: true });
  });

  it('ignores touches inside the window without extending it', () => {
    const cooled = tickContactCooldown(CONTACT_DAMAGE_INTERVAL_MS, 400);
    expect(cooled).toBe(100);
    expect(tryContact(cooled)).toEqual({ cooldownMs: 100, hit: false });
  });

  it('lands exactly one hit per 0.5 s while touching every frame', () => {
    const FRAME_MS = 16;
    let cooldownMs = 0;
    let hits = 0;
    // Three seconds of continuous contact at ~60 fps.
    for (let t = 0; t < 3000; t += FRAME_MS) {
      cooldownMs = tickContactCooldown(cooldownMs, FRAME_MS);
      const result = tryContact(cooldownMs);
      cooldownMs = result.cooldownMs;
      if (result.hit) hits += 1;
    }
    expect(hits).toBe(6);
  });

  it('drains to zero and never below', () => {
    expect(tickContactCooldown(500, 500)).toBe(0);
    expect(tickContactCooldown(100, 500)).toBe(0);
    expect(tickContactCooldown(0, 16)).toBe(0);
  });
});

describe('damageEnemy', () => {
  it('subtracts damage and reports no death above zero', () => {
    expect(damageEnemy(10, 4)).toEqual({ hp: 6, died: false });
  });

  it('reports death exactly on the blow that reaches zero', () => {
    expect(damageEnemy(10, 10)).toEqual({ hp: 0, died: true });
    expect(damageEnemy(10, 999)).toEqual({ hp: 0, died: true });
    expect(damageEnemy(0, 5)).toEqual({ hp: 0, died: false });
  });

  it('ignores non-positive damage', () => {
    expect(damageEnemy(10, 0)).toEqual({ hp: 10, died: false });
    expect(damageEnemy(10, -5)).toEqual({ hp: 10, died: false });
    expect(damageEnemy(10, Number.NaN)).toEqual({ hp: 10, died: false });
  });
});
