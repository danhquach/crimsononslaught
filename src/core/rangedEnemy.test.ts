import { describe, expect, it } from 'vitest';
import { RANGED_ATTACK } from '../config/enemies';
import { PLAYER_SPEED } from '../config/player';
import { scaleDamage } from './enemy';
import { inFireDistance, rangedVelocity, tickFireCooldown } from './rangedEnemy';

const KEEP = { keepDistance: 200, band: 40 };

describe('rangedVelocity', () => {
  it('walks straight in while the target is past its keep distance', () => {
    expect(rangedVelocity({ x: 0, y: 0 }, { x: 300, y: 0 }, KEEP, 80)).toEqual({ x: 80, y: 0 });
    expect(rangedVelocity({ x: 0, y: 0 }, { x: 0, y: -201 }, KEEP, 80)).toEqual({ x: 0, y: -80 });
  });

  it('holds still inside the band, its edges included', () => {
    for (const d of [200, 180, 160]) {
      expect(rangedVelocity({ x: 0, y: 0 }, { x: d, y: 0 }, KEEP, 80), String(d)).toEqual({
        x: 0,
        y: 0,
      });
    }
  });

  it('backs straight away once the target is closer than the band', () => {
    expect(rangedVelocity({ x: 0, y: 0 }, { x: 100, y: 0 }, KEEP, 80)).toEqual({ x: -80, y: 0 });
    const { x, y } = rangedVelocity({ x: 0, y: 0 }, { x: 30, y: 40 }, KEEP, 50);
    expect(Math.hypot(x, y)).toBeCloseTo(50, 10);
    expect(x).toBeCloseTo(-30, 10);
    expect(y).toBeCloseTo(-40, 10);
  });

  it('does not move when standing on the target or held to no speed', () => {
    expect(rangedVelocity({ x: 5, y: 5 }, { x: 5, y: 5 }, KEEP, 80)).toEqual({ x: 0, y: 0 });
    expect(rangedVelocity({ x: 0, y: 0 }, { x: 900, y: 0 }, KEEP, 0)).toEqual({ x: 0, y: 0 });
  });

  it('settles: walking in from afar it stops inside the band and stays there', () => {
    const at = { x: 0, y: 0 };
    const target = { x: 1000, y: 0 };
    const stepS = 1 / 60;
    for (let i = 0; i < 60 * 30; i++) {
      const v = rangedVelocity(at, target, KEEP, 80);
      at.x += v.x * stepS;
      at.y += v.y * stepS;
    }
    const d = target.x - at.x;
    expect(d).toBeLessThanOrEqual(KEEP.keepDistance);
    expect(d).toBeGreaterThanOrEqual(KEEP.keepDistance - KEEP.band);
    expect(rangedVelocity(at, target, KEEP, 80)).toEqual({ x: 0, y: 0 });
  });
});

describe('tickFireCooldown', () => {
  it('fires when the timer runs out with a shot available, and re-arms in full', () => {
    expect(tickFireCooldown(16, 16, 2500, true)).toEqual({ cooldownMs: 2500, fire: true });
    expect(tickFireCooldown(0, 16, 2500, true)).toEqual({ cooldownMs: 2500, fire: true });
  });

  it('drains without firing while the timer runs', () => {
    expect(tickFireCooldown(1000, 16, 2500, true)).toEqual({ cooldownMs: 984, fire: false });
    expect(tickFireCooldown(1000, 16, 2500, false)).toEqual({ cooldownMs: 984, fire: false });
  });

  it('waits at zero while it cannot fire, then fires at once', () => {
    expect(tickFireCooldown(10, 16, 2500, false)).toEqual({ cooldownMs: 0, fire: false });
    expect(tickFireCooldown(0, 16, 2500, false)).toEqual({ cooldownMs: 0, fire: false });
    expect(tickFireCooldown(0, 16, 2500, true)).toEqual({ cooldownMs: 2500, fire: true });
  });

  it('fires once per interval however the time is sliced', () => {
    for (const stepMs of [1, 16, 33, 100, 250]) {
      let cooldown = 0;
      let shots = 0;
      for (let t = 0; t < 10_000; t += stepMs) {
        const next = tickFireCooldown(cooldown, stepMs, 2500, true);
        cooldown = next.cooldownMs;
        if (next.fire) shots++;
      }
      // The first shot leaves at once, then one every 2.5 s, give or take a step.
      expect(shots, `${stepMs} ms steps`).toBeGreaterThanOrEqual(4);
      expect(shots, `${stepMs} ms steps`).toBeLessThanOrEqual(5);
    }
  });
});

describe('inFireDistance', () => {
  it('is inclusive at the distance', () => {
    expect(inFireDistance({ x: 0, y: 0 }, { x: 300, y: 400 }, 500)).toBe(true);
    expect(inFireDistance({ x: 0, y: 0 }, { x: 300, y: 400.1 }, 500)).toBe(false);
  });
});

describe('scaleDamage', () => {
  it('multiplies and rounds, never below 1', () => {
    expect(scaleDamage(5, 1)).toBe(5);
    expect(scaleDamage(5, 1.3)).toBe(7);
    expect(scaleDamage(5, 1.9)).toBe(10);
    expect(scaleDamage(1, 0.1)).toBe(1);
  });
});

describe('the ranged tuning (#126)', () => {
  it('fires from where it holds, so a held position is always a threat', () => {
    const { keepDistance, band, fireDistance } = RANGED_ATTACK;
    expect(band).toBeGreaterThan(0);
    expect(keepDistance - band).toBeGreaterThan(0);
    expect(keepDistance).toBeLessThan(fireDistance);
  });

  it('only fires from on screen, and its shot flies on past the player', () => {
    // Half the 540 px view's height: the nearest the screen edge can be.
    expect(RANGED_ATTACK.fireDistance).toBeLessThan(540 / 2);
    expect(RANGED_ATTACK.shotRange).toBeGreaterThan(RANGED_ATTACK.fireDistance);
  });

  it('shoots a little faster than the player walks, so only moving dodges', () => {
    expect(RANGED_ATTACK.shotSpeed).toBeGreaterThan(PLAYER_SPEED);
    expect(RANGED_ATTACK.shotSpeed).toBeLessThan(PLAYER_SPEED * 1.5);
  });
});
