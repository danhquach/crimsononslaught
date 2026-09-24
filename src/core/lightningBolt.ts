import type { Vec2 } from './input';

/**
 * Lightning Bolt's flight (#202): the bolt is a short shot that leaves the
 * caster and homes on the enemy `resolveCast` locked at cast time, landing its
 * hit when it gets there. Who it hits and what the hit pays stay
 * `core/chainLightning.ts`'s; this is only how it gets there.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Flight speed in px/s. A tuning constant, not a spec §9.4 stat: fast enough
 * that even a 400 px `targetRange` (the 150 px base, grown by Expanse) is
 * crossed in 0.4 s and a bolt still reads as lightning, slow enough to be seen
 * travelling.
 */
export const BOLT_SPEED = 1000;

/**
 * Bolts that may be in the air at once. A cast looses `strikes` of them and
 * each lands within 0.4 s, against a 0.9 s cooldown a perk can at most halve,
 * so a maxed build holds a handful; the headroom covers a stalled frame paying
 * out several casts. Past it a bolt is dropped, never queued.
 */
export const MAX_LIVE_BOLTS = 16;

/** Where a bolt is after one step, and whether it reached its target this step. */
export interface BoltStep {
  readonly x: number;
  readonly y: number;
  readonly arrived: boolean;
}

/**
 * Move a bolt at `pos` up to `speed * deltaS` px toward `target`. A step that
 * would reach or pass the target lands on it exactly, so a bolt never
 * overshoots; the target is re-read every step, so a moving enemy is followed.
 */
export function boltStep(
  pos: Readonly<Vec2>,
  target: Readonly<Vec2>,
  speed: number,
  deltaS: number,
): BoltStep {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const gap = Math.hypot(dx, dy);
  const reach = Math.max(0, speed * deltaS);
  if (reach >= gap) return { x: target.x, y: target.y, arrived: true };
  const t = reach / gap;
  return { x: pos.x + dx * t, y: pos.y + dy * t, arrived: false };
}
