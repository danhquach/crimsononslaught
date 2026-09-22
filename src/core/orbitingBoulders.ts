import { BOULDER_HIT_COOLDOWN } from '../config/spells';
import type { Vec2 } from './input';

/**
 * The orbiting-ring rules that do not need an engine (spec §5 "Earth —
 * Orbiting Boulders", Phase 2 spec §9.4-§9.5): where each body sits on the
 * ring, how the ring turns, which way a hit shoves, and the per-enemy window
 * between hits.
 *
 * Phase 1's Earth default owned all of this; the ring is now worn by Earth
 * Shield (`spells/EarthShieldSpell.ts`) and Lightning Sword
 * (`spells/LightningSwordSpell.ts`, over `spells/OrbitingBodySpell.ts`), and
 * `knockbackVector` is the shove every Earth spell pushes with, thrown boulder
 * and spike included. Those classes are the Phaser side; everything decidable
 * without Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Bodies the ring's pool may ever hold. Earth Shield's base `count` is 3 and
 * Lightning Sword's is 1; the headroom keeps a config change from silently
 * spawning nothing rather than exhausting the pool mid-frame.
 */
export const MAX_BOULDERS = 8;

const TAU = Math.PI * 2;

/**
 * The angle of each boulder on the ring, `count` of them spaced evenly from
 * `baseAngle` (spec §5: `count` boulders orbit). Positions are derived from the
 * count every frame, so the count perk adds a boulder and the others re-space
 * on the next frame without anything else moving. A fractional count is
 * floored, and the cap is the pool's size.
 */
export function boulderAngles(baseAngle: number, count: number): number[] {
  const n = Math.min(MAX_BOULDERS, Math.floor(count));
  if (!(n > 0)) return [];
  return Array.from({ length: n }, (_, i) => baseAngle + (i * TAU) / n);
}

/** Where a boulder at `angle` sits: `orbitRadius` px from the centre. */
export function boulderPosition(centre: Readonly<Vec2>, orbitRadius: number, angle: number): Vec2 {
  return {
    x: centre.x + Math.cos(angle) * orbitRadius,
    y: centre.y + Math.sin(angle) * orbitRadius,
  };
}

/**
 * Turn the ring by one frame: `orbitSpeed` rad/s over `deltaS` seconds of run
 * time, wrapped into [0, 2π) so a long run never loses precision to a huge
 * angle. A zero-length or bad frame leaves the ring where it is.
 */
export function advanceOrbit(angle: number, orbitSpeed: number, deltaS: number): number {
  if (!(deltaS > 0) || !Number.isFinite(deltaS)) return angle;
  const next = (angle + orbitSpeed * deltaS) % TAU;
  return next < 0 ? next + TAU : next;
}

/**
 * The shove a hit gives an enemy: `knockback` px straight away from the
 * boulder that struck it. An enemy dead centre on the boulder has no "away",
 * so it is pushed outward along the boulder's own radius from `centre`; if
 * that is degenerate too (a zero orbit) nothing is pushed. A zero or negative
 * knockback is no push.
 */
export function knockbackVector(
  boulder: Readonly<Vec2>,
  enemy: Readonly<Vec2>,
  knockback: number,
  centre: Readonly<Vec2>,
): Vec2 {
  if (!(knockback > 0)) return { x: 0, y: 0 };
  const away = scaled(enemy.x - boulder.x, enemy.y - boulder.y, knockback);
  if (away) return away;
  return scaled(boulder.x - centre.x, boulder.y - centre.y, knockback) ?? { x: 0, y: 0 };
}

/** `(dx, dy)` scaled to `length`, or `undefined` for a zero vector. */
function scaled(dx: number, dy: number, length: number): Vec2 | undefined {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return undefined;
  return { x: (dx / distance) * length, y: (dy / distance) * length };
}

/**
 * Try to land a boulder hit on an enemy. A hit opens that enemy's own
 * `BOULDER_HIT_COOLDOWN` window (spec §5: "per-enemy hit cooldown 0.4 s");
 * touches inside it — from this boulder or another — are ignored and do not
 * extend it, so an enemy sitting on the ring takes one hit per 0.4 s however
 * many boulders roll over it.
 */
export function tryBoulderHit(remainingS: number): { remainingS: number; hit: boolean } {
  if (remainingS > 0) return { remainingS, hit: false };
  return { remainingS: BOULDER_HIT_COOLDOWN, hit: true };
}

/** Drain an enemy's boulder window by one frame of run time. */
export function tickBoulderCooldown(remainingS: number, deltaS: number): number {
  if (!(deltaS > 0)) return remainingS;
  return Math.max(0, remainingS - deltaS);
}
