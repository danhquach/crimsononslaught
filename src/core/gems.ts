import type { EnemyType } from '../config/enemies';
import { GEM_DRIFT_SPEED, PICKUP_RADIUS } from '../config/gems';
import { chaseVelocity } from './enemy';
import type { Vec2 } from './input';

export type { Vec2 };

/**
 * XP gem rules that do not need an engine (spec §5): how many gems a death
 * drops, how far the player picks them up from, and the drift toward the player
 * once they are in range.
 *
 * `entities/XpGem.ts` and `systems/GemPool.ts` are the Phaser side; everything
 * decidable without Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import. The tunables themselves live in `config/gems.ts`.
 */

/** Spec §5: "Death drops 1 XP gem (Tank drops 3)". */
export function gemDropCount(type: EnemyType): number {
  return type === 'tank' ? 3 : 1;
}

/** Whether `gem` is close enough to `player` to be pulled in (spec §5). */
export function withinPickupRadius(
  gem: Readonly<Vec2>,
  player: Readonly<Vec2>,
  radius: number = PICKUP_RADIUS,
): boolean {
  return Math.hypot(player.x - gem.x, player.y - gem.y) <= radius;
}

/**
 * Velocity for one gem this frame: it lies still until the player comes within
 * the pickup radius, then homes in at `speed`. Outside the radius the gem does
 * not move at all, so the radius is the whole of the pickup rule.
 */
export function gemDrift(
  gem: Readonly<Vec2>,
  player: Readonly<Vec2>,
  radius: number = PICKUP_RADIUS,
  speed: number = GEM_DRIFT_SPEED,
): Vec2 {
  if (!withinPickupRadius(gem, player, radius)) return { x: 0, y: 0 };
  return chaseVelocity(gem, player, speed);
}
