import { describe, expect, it } from 'vitest';
import { ENEMY_ARCHETYPES, SHIELD_GUARD } from '../config/enemies';
import { PLAYER_SPEED } from '../config/player';
import { shieldedDamageFactor, shieldedStep, turnToward } from './shielded';
import type { Vec2 } from './enemy';

const DEG = Math.PI / 180;
const GUARD = { arcDeg: 120, factor: 0.25, turnRateDeg: 45 };

describe('turnToward', () => {
  it('turns the short way round, by at most the step', () => {
    expect(turnToward(0, 90 * DEG, 10 * DEG)).toBeCloseTo(10 * DEG);
    expect(turnToward(0, -90 * DEG, 10 * DEG)).toBeCloseTo(-10 * DEG);
    // From 170° to -170° is 20° anticlockwise across ±180°, not 340° back.
    expect(turnToward(170 * DEG, -170 * DEG, 5 * DEG)).toBeCloseTo(175 * DEG);
  });

  it('lands on the target once it is within the step', () => {
    expect(turnToward(0, 5 * DEG, 10 * DEG)).toBeCloseTo(5 * DEG);
    expect(turnToward(3, 3, 0)).toBeCloseTo(3);
  });

  it('never turns for a negative step', () => {
    expect(turnToward(0, 1, -1)).toBe(0);
  });
});

describe('shieldedStep', () => {
  const at = { x: 0, y: 0 };

  it('faces the target at once when it has no heading yet', () => {
    const step = shieldedStep(Number.NaN, at, { x: 0, y: 100 }, GUARD, 55, 1, 1 / 60);
    expect(step.heading).toBeCloseTo(90 * DEG);
    expect(step.velocity.x).toBeCloseTo(0);
    expect(step.velocity.y).toBeCloseTo(55);
  });

  it('turns at the turn rate and walks the way it faces', () => {
    const step = shieldedStep(0, at, { x: 0, y: 100 }, GUARD, 55, 1, 1);
    expect(step.heading).toBeCloseTo(45 * DEG);
    expect(Math.hypot(step.velocity.x, step.velocity.y)).toBeCloseTo(55);
    expect(Math.atan2(step.velocity.y, step.velocity.x)).toBeCloseTo(45 * DEG);
  });

  it('holds its turn while a stun or freeze holds it', () => {
    const step = shieldedStep(0, at, { x: 0, y: 100 }, GUARD, 0, 0, 1);
    expect(step.heading).toBe(0);
    expect(step.velocity).toEqual({ x: 0, y: 0 });
  });

  it('keeps its heading standing on the target', () => {
    expect(shieldedStep(1, at, at, GUARD, 55, 1, 1).heading).toBe(1);
    expect(shieldedStep(Number.NaN, at, at, GUARD, 55, 1, 1).heading).toBe(0);
  });
});

describe('shieldedDamageFactor', () => {
  const self = { x: 100, y: 100 };
  // Facing right (heading 0): the shield covers 60° either side of +x.
  it.each([
    ['dead ahead', { x: 200, y: 100 }, 0.25],
    ['59° off', { x: 100 + Math.cos(59 * DEG), y: 100 + Math.sin(59 * DEG) }, 0.25],
    ['-59° off', { x: 100 + Math.cos(-59 * DEG), y: 100 + Math.sin(-59 * DEG) }, 0.25],
    ['61° off', { x: 100 + Math.cos(61 * DEG), y: 100 + Math.sin(61 * DEG) }, 1],
    ['the flank', { x: 100, y: 0 }, 1],
    ['behind', { x: 0, y: 100 }, 1],
  ])('a hit from %s deals %s', (_name, from, factor) => {
    expect(shieldedDamageFactor(0, self, from, GUARD)).toBe(factor);
  });

  it('blocks across ±180° as well', () => {
    // Facing left; a hit from the left and slightly below is on the shield.
    expect(shieldedDamageFactor(Math.PI, self, { x: 0, y: 110 }, GUARD)).toBe(0.25);
    expect(shieldedDamageFactor(-Math.PI, self, { x: 0, y: 90 }, GUARD)).toBe(0.25);
  });

  it('lands in full with no direction: no source, its own spot, or no heading yet', () => {
    expect(shieldedDamageFactor(0, self, undefined, GUARD)).toBe(1);
    expect(shieldedDamageFactor(0, self, { x: 100, y: 100 }, GUARD)).toBe(1);
    expect(shieldedDamageFactor(Number.NaN, self, { x: 200, y: 100 }, GUARD)).toBe(1);
  });
});

/**
 * The shielded enemy against a player who walks at `PLAYER_SPEED`, stepped at
 * 60 Hz with the real archetype and guard. Returns the largest angle, over the
 * run, between where it faces and where the player stands.
 */
function worstOffAngle(playerAt: (t: number, enemy: Vec2) => Vec2, seconds: number): number {
  const { speed } = ENEMY_ARCHETYPES.shielded;
  const dt = 1 / 60;
  let enemy: Vec2 = { x: 0, y: 0 };
  let heading = Number.NaN;
  let worst = 0;
  for (let t = 0; t < seconds; t += dt) {
    const player = playerAt(t, enemy);
    const step = shieldedStep(heading, enemy, player, SHIELD_GUARD, speed, 1, dt);
    heading = step.heading;
    enemy = { x: enemy.x + step.velocity.x * dt, y: enemy.y + step.velocity.y * dt };
    const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const off = Math.abs(Math.atan2(Math.sin(toPlayer - heading), Math.cos(toPlayer - heading)));
    worst = Math.max(worst, off);
  }
  return worst / DEG;
}

describe('the shielded tuning (#126)', () => {
  // Behind it: past the flank, in the back half.
  const BEHIND = 120;

  it('turns slower than a player circling it at walking speed, out to 160 px', () => {
    // The player walks a circle round wherever the enemy stands, starting in front of it.
    for (const radius of [60, 120, 160]) {
      const worst = worstOffAngle((t, enemy) => {
        const angle = (PLAYER_SPEED / radius) * t;
        return { x: enemy.x + Math.cos(angle) * radius, y: enemy.y + Math.sin(angle) * radius };
      }, 4);
      expect(worst, `circling at ${radius} px`).toBeGreaterThan(BEHIND);
    }
  });

  it('is behind a player who walks straight past it, and off its shield at 80 px', () => {
    const crossing = (gap: number) =>
      worstOffAngle((t) => ({ x: gap, y: -300 + PLAYER_SPEED * t }), 5);
    expect(crossing(40)).toBeGreaterThan(BEHIND);
    expect(crossing(80)).toBeGreaterThan(SHIELD_GUARD.arcDeg / 2);
  });

  it('keeps its shield on a player who stands still in front of it', () => {
    const worst = worstOffAngle(() => ({ x: 300, y: 0 }), 4);
    expect(worst).toBeLessThan(SHIELD_GUARD.arcDeg / 2);
  });

  it('comes round again: a half turn takes it at most six seconds', () => {
    expect(180 / SHIELD_GUARD.turnRateDeg).toBeLessThanOrEqual(6);
  });

  it('is slower than the player, so they can outwalk it', () => {
    expect(ENEMY_ARCHETYPES.shielded.speed).toBeLessThan(PLAYER_SPEED);
  });
});
