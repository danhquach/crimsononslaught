import type { Vec2 } from './input';
import { chaseVelocity } from './enemy';
import { nearestEnemies } from './spell';

/**
 * Companion rules that do not need an engine (Phase 2 spec §9, #133): where a
 * companion walks, what it picks to attack, and whether it is close enough to
 * swing.
 *
 * A companion is the only thing in the arena on the player's side. It has two
 * flavours, and both are decided here:
 *
 * - **ranged** (`fire_companion`, `ice_companion`) hovers near the player on a
 *   short leash and shoots what comes into `targetRange`;
 * - **melee** (`lightning_companion`, `earth_companion`) charges a target while
 *   that target is inside the leash it keeps around the player, and walks back
 *   to the player once there is nothing worth charging.
 *
 * A companion is not an Arcade body: `spells/CompanionSpell.ts` steps it with
 * `stepPosition` the way `OrbitingBouldersSpell` places boulders, which is what
 * makes it undamageable and non-colliding by construction rather than by a
 * filter — nothing can overlap a sprite with no body.
 *
 * Pure TS, no Phaser import; the tunables live in `config/companions.ts`.
 */

/**
 * The arena the companion may stand in, in px. The same four edges Arcade's
 * world bounds carry, so `Enemy.knockBack`'s clamp and this one agree.
 */
export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * How a companion follows the player: still while it is inside `leashRadius` of
 * them, walking straight back at `chaseSpeed` once it is outside.
 *
 * The leash is a dead zone, not a spring: a companion that corrected every
 * frame would jitter on the player's heels, and one that only ever moved when
 * pulled reads as a pet keeping up. It is the distance itself that is compared,
 * so `leashRadius` means the reach a passive's `areaMul` says it does.
 */
export function followVelocity(
  pos: Readonly<Vec2>,
  player: Readonly<Vec2>,
  leashRadius: number,
  chaseSpeed: number,
): Vec2 {
  if (Math.hypot(player.x - pos.x, player.y - pos.y) <= leashRadius) return { x: 0, y: 0 };
  return chaseVelocity(pos, player, chaseSpeed);
}

/**
 * What a companion attacks: the nearest live enemy within `targetRange` of the
 * companion itself, or nothing when the arena around it is empty.
 *
 * Targeting is measured from the companion, not the player — a companion that
 * has run ahead should shoot what it is standing next to. Ties keep the caller's
 * order (`nearestEnemies`), so a seed reproduces every target without the
 * choice drawing from the RNG.
 */
export function chooseTarget<T extends Vec2>(
  pos: Readonly<Vec2>,
  enemies: readonly T[],
  targetRange: number,
): T | undefined {
  return nearestEnemies(pos, enemies, 1, targetRange)[0];
}

/**
 * What a melee companion charges: the nearest enemy within `targetRange` of the
 * ally that is *also* inside `leashRadius` of the player.
 *
 * The second test is what keeps a melee ally from being towed across the arena
 * by a chain of targets — it never leaves the player's leash, however long the
 * fight runs — and applying it when the target is picked rather than when the
 * ally moves is what makes it swing at the thing it is running at.
 */
export function meleeTarget<T extends Vec2>(
  pos: Readonly<Vec2>,
  enemies: readonly T[],
  player: Readonly<Vec2>,
  targetRange: number,
  leashRadius: number,
): T | undefined {
  const reachable = enemies.filter(
    (enemy) => Math.hypot(enemy.x - player.x, enemy.y - player.y) <= leashRadius,
  );
  return chooseTarget(pos, reachable, targetRange);
}

/**
 * How a melee companion moves: straight at the target `meleeTarget` picked, and
 * back to the player when there is nothing to charge.
 */
export function lungeVelocity(
  pos: Readonly<Vec2>,
  target: Readonly<Vec2> | undefined,
  player: Readonly<Vec2>,
  leashRadius: number,
  chaseSpeed: number,
): Vec2 {
  if (target) return chaseVelocity(pos, target, chaseSpeed);
  return followVelocity(pos, player, leashRadius, chaseSpeed);
}

/**
 * Whether a melee companion standing at `pos` can reach `target`. `reach` is
 * measured to the target's edge, so a Tank is hit from further out than a Swarm
 * exactly as far as it is bigger.
 */
export function inReach(
  pos: Readonly<Vec2>,
  target: Readonly<Vec2>,
  targetRadius: number,
  reach: number,
): boolean {
  return Math.hypot(target.x - pos.x, target.y - pos.y) <= reach + targetRadius;
}

/**
 * Move a companion by one frame of run time and keep it inside the arena.
 *
 * The companion carries no Arcade body, so nothing integrates its velocity or
 * clamps it to the world bounds for it — both happen here, which is also what
 * makes the walk reproducible from a seed at any `?timeScale=`. A zero-length
 * or bad frame leaves it where it stands.
 */
export function stepPosition(
  pos: Readonly<Vec2>,
  velocity: Readonly<Vec2>,
  deltaS: number,
  bounds: Readonly<Bounds>,
): Vec2 {
  if (!(deltaS > 0) || !Number.isFinite(deltaS)) return { x: pos.x, y: pos.y };
  return {
    x: clamp(pos.x + velocity.x * deltaS, bounds.left, bounds.right),
    y: clamp(pos.y + velocity.y * deltaS, bounds.top, bounds.bottom),
  };
}

/**
 * Where a companion stands when its spell is equipped: `leashRadius` behind the
 * player, so it is inside its own leash from the first frame and does not walk
 * in from the arena's corner.
 */
export function spawnPosition(player: Readonly<Vec2>, leashRadius: number): Vec2 {
  return { x: player.x, y: player.y + leashRadius };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
