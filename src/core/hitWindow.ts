/**
 * The per-enemy window between hits for a hitbox that is not spent on contact —
 * generalised from `core/orbitingBoulders.ts`'s `tryBoulderHit` /
 * `tickBoulderCooldown`, which stay as they are for Earth. Lightning Sword
 * keeps one per enemy it cuts (#142).
 *
 * Moved here from `core/fireColumn.ts` when Fire Column became Fire Wave
 * (CO-143, #218), which hits each enemy once per wave and needs no window.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Try to land a hit on an enemy inside the hitbox. A hit opens that enemy's
 * own `hitCooldown` window; touches inside it are ignored and do not extend
 * it, so an enemy that lingers takes one hit per `hitCooldown` s, however long
 * it stays.
 */
export function tryHit(
  remainingS: number,
  hitCooldown: number,
): { remainingS: number; hit: boolean } {
  if (remainingS > 0) return { remainingS, hit: false };
  return { remainingS: hitCooldown, hit: true };
}

/** Drain one enemy's hit window by one frame of run time. */
export function tickHitCooldown(remainingS: number, deltaS: number): number {
  if (!(deltaS > 0)) return remainingS;
  return Math.max(0, remainingS - deltaS);
}
