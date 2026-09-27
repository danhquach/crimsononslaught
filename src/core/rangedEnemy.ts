import type { RangedAttack } from '../config/enemies';
import { chaseVelocity, type Vec2 } from './enemy';

/**
 * The ranged enemy's rules (#126), apart from the engine: where it walks, when
 * it fires, and what a shot is worth. `entities/Enemy.ts` moves the sprite and
 * `systems/EnemyShotPool.ts` flies the shots.
 *
 * No RNG: it fires on its own timer, so a seed that spawns the same crowd
 * replays the same volleys.
 *
 * Pure TS, no Phaser import. The tunables live in `config/enemies.ts`.
 */

/**
 * Walk in until `target` is `keepDistance` away, back off once it is closer
 * than `keepDistance - band`, and hold still in between, so it keeps the
 * player at range without jittering on one exact distance.
 */
export function rangedVelocity(
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
  attack: Readonly<Pick<RangedAttack, 'keepDistance' | 'band'>>,
  speed: number,
): Vec2 {
  const distance = Math.hypot(target.x - from.x, target.y - from.y);
  if (distance > attack.keepDistance) return chaseVelocity(from, target, speed);
  if (distance < attack.keepDistance - attack.band) return chaseVelocity(target, from, speed);
  return { x: 0, y: 0 };
}

/**
 * Drain the fire timer by one step and say whether a shot leaves this step.
 * It fires only with the target in range and the enemy free to act (not
 * stunned or frozen); a timer that ran out meanwhile waits at zero, so the
 * shot leaves the moment both are true again. Each shot re-arms a full
 * `intervalMs`, whatever the step length.
 */
export function tickFireCooldown(
  cooldownMs: number,
  deltaMs: number,
  intervalMs: number,
  canFire: boolean,
): { cooldownMs: number; fire: boolean } {
  const left = Math.max(0, cooldownMs - deltaMs);
  if (left > 0 || !canFire) return { cooldownMs: left, fire: false };
  return { cooldownMs: intervalMs, fire: true };
}

/** Whether `target` is within `fireDistance`, close enough to be fired at. */
export function inFireDistance(
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
  fireDistance: number,
): boolean {
  return Math.hypot(target.x - from.x, target.y - from.y) <= fireDistance;
}
