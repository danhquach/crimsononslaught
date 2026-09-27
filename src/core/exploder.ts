import type { Vec2 } from './enemy';

/**
 * The exploder's blast (#126), apart from the engine. It is aimed at the
 * player alone: nothing here looks at other enemies, so one blast can never
 * set off the next. `GameScene` decides when an exploder goes off and routes
 * the damage through `hurtPlayer`.
 *
 * Pure TS, no Phaser import. The tunables live in `config/enemies.ts`.
 */

/** Whether a blast of `radius` at `at` reaches `player`: inclusive at the edge. */
export function blastReaches(at: Readonly<Vec2>, player: Readonly<Vec2>, radius: number): boolean {
  return Math.hypot(player.x - at.x, player.y - at.y) <= radius;
}
