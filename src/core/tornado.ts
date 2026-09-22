import { type GroundArea } from './groundArea';
import type { Vec2 } from './input';
import { nearestEnemies } from './spell';
import { pullVelocity } from './vortex';

/**
 * Tornado rules that do not need an engine (#142, Phase 2 spec §9.4): where a
 * cast is aimed, how the patch drifts, and the pull it asks of every enemy
 * around it each frame.
 *
 * A tornado is a ground area (`core/groundArea.ts`) that moves: the lifetime,
 * the ticks and who is inside are the area's rules unchanged, and the drift is
 * one straight line at `speed` px/s from the caster toward where the target
 * stood at the cast. Its pull is `core/vortex.ts`'s `pullVelocity`, asked of
 * every enemy within `pullRadius` every frame rather than on the tick, so the
 * drag is continuous while the damage is metered.
 *
 * `spells/TornadoSpell.ts` is the Phaser side; everything decidable without
 * Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * The dead zone at the centre, in px: an enemy dragged this close parks there
 * rather than the whole crowd collapsing onto one pixel (`pullVelocity`). A
 * mechanic tunable, not a stat — no passive scales it.
 */
export const TORNADO_EYE = 12;

/**
 * Which way a cast goes: a unit vector from `caster` toward the nearest enemy
 * within `targetRange`, or `undefined` with none in range — the cast is then
 * spent on nothing, the rule Fire Column's `columnTarget` follows. A target
 * standing on the caster has no direction, so that cast is spent too.
 */
export function tornadoHeading<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  targetRange: number,
): Vec2 | undefined {
  const [target] = nearestEnemies(caster, enemies, 1, targetRange);
  if (!target) return undefined;
  const dx = target.x - caster.x;
  const dy = target.y - caster.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return undefined;
  return { x: dx / distance, y: dy / distance };
}

/**
 * The patch moved along `heading` for one frame: `speed` px/s over `deltaS`
 * seconds of run time. Nothing but the position changes — the clock and the
 * ticks paid stay with `advanceArea`. A bad or zero-length frame leaves it.
 */
export function driftArea(
  area: Readonly<GroundArea>,
  heading: Readonly<Vec2>,
  speed: number,
  deltaS: number,
): GroundArea {
  if (!(deltaS > 0) || !Number.isFinite(deltaS) || !(speed > 0)) return { ...area };
  return {
    ...area,
    x: area.x + heading.x * speed * deltaS,
    y: area.y + heading.y * speed * deltaS,
  };
}

/**
 * The pull each enemy feels from a tornado at `centre` this frame: straight at
 * the eye at `pullForce` px/s for everything between `TORNADO_EYE` and
 * `pullRadius` of it, nothing for the rest. Only the enemies with a non-zero
 * pull are returned, so the caller asks the engine for exactly those forces.
 */
export function tornadoPulls<T extends Vec2>(
  centre: Readonly<Vec2>,
  enemies: readonly T[],
  pullRadius: number,
  pullForce: number,
): { enemy: T; force: Vec2 }[] {
  const pulls: { enemy: T; force: Vec2 }[] = [];
  for (const enemy of enemies) {
    const force = pullVelocity(enemy, centre, pullRadius, pullForce, TORNADO_EYE);
    if (force.x !== 0 || force.y !== 0) pulls.push({ enemy, force });
  }
  return pulls;
}
