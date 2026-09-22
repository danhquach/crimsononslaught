import type { Vec2 } from './input';
import { nearestEnemies } from './spell';

/**
 * Homing flight (#137, Phase 2 spec §9.2): a projectile that bends toward a
 * live target every frame instead of flying the line it was launched on.
 * Fire Dragon is the only spell that asks for it; `entities/HomingProjectile.ts`
 * is the Phaser side and only applies what these return.
 *
 * The turn is capped, not the position: `steerToward` rotates the current
 * heading by at most the allowance the caller hands it (`homingTurnRate * dt`)
 * and returns a velocity at the flight speed, so a shot fired away from its
 * target arcs round rather than snapping onto it, and a target that sidesteps
 * fast enough is missed.
 *
 * A target that dies mid-flight is replaced by the nearest live enemy within
 * `targetRange` of the shot; with none the shot flies straight on its last
 * heading until its lifetime ends. Lifetime is run-clock seconds rather than a
 * distance, because a curving flight covers more ground than its straight-line
 * range and would otherwise expire late, or never on a target it circles.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Dragons in flight the pool may ever hold (spec §9.2 Fire Dragon): a big
 * single-target hit on a 2.5 s cooldown, so one is normally in the air at a
 * time; the cap leaves room for a Haste build.
 */
export const MAX_LIVE_DRAGONS = 8;

/** What a homing shot needs of its target: where it is, and whether it still counts. */
export interface HomingTarget extends Vec2 {
  readonly active: boolean;
  readonly isDying: boolean;
}

/** Whether `target` is still something to fly at: present, alive, not playing its death clip. */
export function isLiveTarget(target: HomingTarget | null | undefined): boolean {
  return target != null && target.active && !target.isDying;
}

/**
 * The velocity for the next frame: the current heading rotated toward `target`
 * by at most `maxTurnRad`, the short way round, at `speed`. A stopped shot
 * heads straight at the target; a shot on top of its target keeps its heading.
 */
export function steerToward(
  velocity: Readonly<Vec2>,
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
  maxTurnRad: number,
  speed: number,
): Vec2 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const stopped = velocity.x === 0 && velocity.y === 0;
  const onTarget = dx === 0 && dy === 0;
  if (stopped && onTarget) return { x: 0, y: 0 };

  const current = stopped ? Math.atan2(dy, dx) : Math.atan2(velocity.y, velocity.x);
  const wanted = onTarget ? current : Math.atan2(dy, dx);
  const turn = clampTurn(wanted - current, Math.max(0, maxTurnRad));
  const heading = current + turn;
  return { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed };
}

/** `delta` wrapped into (-π, π], then held to ±`limit`. */
function clampTurn(delta: number, limit: number): number {
  let d = delta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return Math.max(-limit, Math.min(limit, d));
}

/**
 * The nearest live enemy within `maxRange` of the shot itself, or null. Ranged
 * from the shot, not the caster: a dragon halfway across the arena picks up
 * whoever is near it there.
 */
export function retarget<T extends HomingTarget>(
  from: Readonly<Vec2>,
  candidates: readonly T[],
  maxRange: number,
): T | null {
  const live = candidates.filter((candidate) => isLiveTarget(candidate));
  return nearestEnemies(from, live, 1, maxRange)[0] ?? null;
}

/** Run-clock seconds left after `deltaS` more have passed; never below zero. */
export function tickLifetime(lifeS: number, deltaS: number): number {
  return Math.max(0, lifeS - deltaS);
}
