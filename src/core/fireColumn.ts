import type { Vec2 } from './input';
import { nearestEnemies } from './spell';

/**
 * Fire Column rules that do not need an engine (Phase 2 spec §9.2): who a
 * column is aimed at, and the per-enemy window between hits for a hitbox that
 * is not spent on contact — generalised from `core/orbitingBoulders.ts`'s
 * `tryBoulderHit` / `tickBoulderCooldown`, which stay as they are for Earth.
 *
 * Unlike a boulder's window (kept on the `Enemy` itself, because every boulder
 * shares one ring), a column's window is kept by the column that owns it: two
 * columns in the air burn the same enemy on their own separate clocks.
 *
 * `spells/FireColumnSpell.ts` is the Phaser side; everything decidable without
 * Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Columns in flight the pool may ever hold. Base `projectiles` is 1 against a
 * 2.2 s cooldown, and a column takes about 1.5 s to travel its 180 px `range`,
 * so at most one is in the air at a time; the cap leaves room for a
 * Haste build.
 */
export const MAX_LIVE_COLUMNS = 8;

/**
 * The column's target line: the nearest enemy within `range` of the caster, or
 * `undefined` with none in range — the cast is then spent on nothing, the same
 * rule Fireball's `volleyTargets` follows with an empty crowd.
 */
export function columnTarget<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  range: number,
): T | undefined {
  return nearestEnemies(caster, enemies, 1, range)[0];
}

/**
 * Try to land a hit on an enemy standing inside the column. A hit opens that
 * enemy's own `hitCooldown` window *on this column*; touches inside it are
 * ignored and do not extend it, so an enemy sitting in the column takes one
 * hit per `hitCooldown` s from it, however long it lingers.
 */
export function tryHit(
  remainingS: number,
  hitCooldown: number,
): { remainingS: number; hit: boolean } {
  if (remainingS > 0) return { remainingS, hit: false };
  return { remainingS: hitCooldown, hit: true };
}

/** Drain one enemy's hit window inside the column by one frame of run time. */
export function tickHitCooldown(remainingS: number, deltaS: number): number {
  if (!(deltaS > 0)) return remainingS;
  return Math.max(0, remainingS - deltaS);
}
