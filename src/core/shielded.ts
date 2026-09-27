import type { ShieldGuard } from '../config/enemies';
import type { Vec2 } from './enemy';

/**
 * The shielded enemy's rules (#126), apart from the engine: which way it
 * faces, how fast it may turn, and what a hit is worth given where it came
 * from. `entities/Enemy.ts` moves the sprite; `GameScene.damageEnemy` applies
 * the factor.
 *
 * Headings are radians, measured the way `Math.atan2(dy, dx)` measures them.
 * No RNG, so a seed replays the same turns.
 *
 * Pure TS, no Phaser import. The tunables live in `config/enemies.ts`.
 */

/** `angle` folded into (-π, π]. */
function wrap(angle: number): number {
  const turn = Math.PI * 2;
  const folded = angle - turn * Math.floor((angle + Math.PI) / turn);
  return folded === -Math.PI ? Math.PI : folded;
}

/** Turn `heading` toward `desired` the short way round, by at most `maxTurn`. */
export function turnToward(heading: number, desired: number, maxTurn: number): number {
  const gap = wrap(desired - heading);
  const step = Math.max(0, maxTurn);
  if (Math.abs(gap) <= step) return wrap(desired);
  return wrap(heading + Math.sign(gap) * step);
}

export interface ShieldedStep {
  readonly heading: number;
  readonly velocity: Vec2;
}

/**
 * One step of a shielded enemy at `from`: turn toward `target` by at most
 * `turnRateDeg * speedFactor * deltaS`, then walk the way it now faces at
 * `speed` (already scaled by `speedFactor`). A stun or freeze holds its turn
 * as well as its feet. With no heading yet (`NaN`, just spawned) it faces the
 * target at once, so it arrives shield first.
 */
export function shieldedStep(
  heading: number,
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
  guard: Readonly<Pick<ShieldGuard, 'turnRateDeg'>>,
  speed: number,
  speedFactor: number,
  deltaS: number,
): ShieldedStep {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const desired = dx === 0 && dy === 0 ? heading : Math.atan2(dy, dx);
  const maxTurn = ((guard.turnRateDeg * Math.PI) / 180) * speedFactor * deltaS;
  // Standing on the target keeps the heading; a fresh one standing there faces right.
  const next = Number.isNaN(heading)
    ? Number.isNaN(desired)
      ? 0
      : desired
    : turnToward(heading, desired, maxTurn);
  const walk = speed > 0 ? speed : 0;
  return { heading: next, velocity: { x: Math.cos(next) * walk, y: Math.sin(next) * walk } };
}

/**
 * What share of a hit lands on a shielded enemy at `self` facing `heading`.
 * A hit from within `arcDeg / 2` of the heading is on the shield and deals
 * `factor`; anything else deals it all. A hit with no direction — no `from`,
 * or one from the enemy's own spot, such as a strike landing on it — has
 * nothing to block and lands in full.
 */
export function shieldedDamageFactor(
  heading: number,
  self: Readonly<Vec2>,
  from: Readonly<Vec2> | undefined,
  guard: Readonly<Pick<ShieldGuard, 'arcDeg' | 'factor'>>,
): number {
  if (!from || Number.isNaN(heading)) return 1;
  const dx = from.x - self.x;
  const dy = from.y - self.y;
  if (dx === 0 && dy === 0) return 1;
  const off = Math.abs(wrap(Math.atan2(dy, dx) - heading));
  const half = ((guard.arcDeg / 2) * Math.PI) / 180;
  return off <= half ? guard.factor : 1;
}
