import type { Vec2 } from './input';

/**
 * Vortex pull (#136, Phase 2 spec §9.4): a point that drags every enemy within
 * `pullRadius` toward itself at `pullForce` px/s for as long as it lives. The
 * only positional force before it was knockback, a one-off shove away from a
 * point; nothing pulled, and nothing held an enemy somewhere over time.
 *
 * The pull is a velocity, not a displacement, so it composes with the chase
 * the way two velocities do: `Enemy.chase` sums whatever forces the spells
 * added since its last step into its own steering and hands the total to the
 * body. A knockback in the same frame moves the position directly, so the two
 * add rather than fight whichever landed first.
 *
 * Tornado (#142) is a moving ground area (`core/groundArea.ts`) that calls
 * `pullVelocity` for each member every step. Pure TS, no Phaser import.
 */

/** No force at all: what an enemy carries between two pulls. */
export const NO_FORCE: Readonly<Vec2> = Object.freeze({ x: 0, y: 0 });

/**
 * Whether a stunned or frozen enemy is still dragged by a vortex. The spec
 * (#129) sets neither way, so it is one switch rather than an accident of the
 * code: `true` means the pull is an outside force that a held enemy cannot
 * resist; `false` would make a hold plant the enemy against it.
 */
export const PULL_MOVES_HELD_ENEMIES = true;

/**
 * The velocity a vortex at `centre` asks of an enemy this frame: straight at
 * the centre at `strength` px/s while the enemy is between `minRadius` and
 * `radius` of it, and nothing outside that ring. The dead zone inside
 * `minRadius` is what stops the crowd collapsing onto one pixel — an enemy
 * pulled to its edge parks there — and an enemy at the centre has no "toward"
 * anyway. A non-positive strength is no pull.
 */
export function pullVelocity(
  enemy: Readonly<Vec2>,
  centre: Readonly<Vec2>,
  radius: number,
  strength: number,
  minRadius: number,
): Vec2 {
  if (!(strength > 0)) return { x: 0, y: 0 };
  const dx = centre.x - enemy.x;
  const dy = centre.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance > radius || distance <= minRadius) return { x: 0, y: 0 };
  return { x: (dx / distance) * strength, y: (dy / distance) * strength };
}

/** The one velocity several asks add up to; order does not matter. */
export function sumVelocities(...parts: readonly Readonly<Vec2>[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const part of parts) {
    x += part.x;
    y += part.y;
  }
  return { x, y };
}

/**
 * The share of `force` a held enemy still feels: all of it when the pull moves
 * held enemies, otherwise only while the enemy can move itself (`speedFactor`
 * is what frost and stun scale the chase by; 0 is a full hold).
 */
export function heldForce(force: Readonly<Vec2>, speedFactor: number): Vec2 {
  if (PULL_MOVES_HELD_ENEMIES || speedFactor > 0) return { x: force.x, y: force.y };
  return { x: 0, y: 0 };
}

/** The arena's edges in world px, as `physics.world.bounds` reports them. */
export interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * `velocity` trimmed so one step of `deltaS` cannot carry `position` out of
 * `bounds`. An enemy already outside — the spawn ring sits past the arena's
 * edge — is not dragged in by the clamp: the bounds widen to where it stands,
 * so it may only ever move inward. Zero time is nothing to trim.
 */
export function confineVelocity(
  position: Readonly<Vec2>,
  velocity: Readonly<Vec2>,
  deltaS: number,
  bounds: Readonly<Bounds>,
): Vec2 {
  if (!(deltaS > 0)) return { x: velocity.x, y: velocity.y };
  const nextX = clamp(
    position.x + velocity.x * deltaS,
    Math.min(bounds.left, position.x),
    Math.max(bounds.right, position.x),
  );
  const nextY = clamp(
    position.y + velocity.y * deltaS,
    Math.min(bounds.top, position.y),
    Math.max(bounds.bottom, position.y),
  );
  return { x: (nextX - position.x) / deltaS, y: (nextY - position.y) / deltaS };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
