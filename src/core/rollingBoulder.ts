import type { Vec2 } from './input';
import { nearestEnemies } from './spell';

/**
 * Boulder rules that do not need an engine (#143, Phase 2 spec §9.5): where a
 * boulder is thrown, and how many enemies it rolls through before it is spent.
 *
 * Unlike Earth Shield's ring, a thrown boulder is a projectile — the same
 * pooled `entities/Projectile.ts` Fire and Ice shoot — so it keeps none of the
 * ring's per-enemy window: it strikes each enemy once, and `pierce` decides
 * how many of them one throw is worth. The shove is the ring's
 * `knockbackVector` (`core/orbitingBoulders.ts`), the same one every Earth
 * spell pushes with.
 *
 * `spells/RollingBoulderSpell.ts` is the Phaser side; everything decidable
 * without Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Boulders in the air the pool may ever hold. Base `cooldown` is 2 s against a
 * 460 px `range` at 280 px/s — about 1.6 s of flight, so roughly one is rolling
 * at a time — and a stacked Haste at the profile's 0.35 floor brings that to
 * two or three; the cap is several times either and exists to bound the pool
 * rather than to shape play.
 */
export const MAX_LIVE_BOULDERS = 8;

/**
 * The line a throw takes: the nearest enemy within `range` of the caster, or
 * `undefined` with none in range — the cast is then spent on nothing, the rule
 * every targeted spell here follows. The boulder keeps rolling past that enemy,
 * so the target only sets the heading.
 */
export function rollTarget<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  range: number,
): T | undefined {
  return nearestEnemies(caster, enemies, 1, range)[0];
}

/**
 * Whether a boulder that has now struck `struck` enemies is used up. `pierce`
 * is how many enemies one boulder may hit in total — "passes through a few
 * enemies" (spec §9.5) — so at the base 3 the third hit is the last and the
 * boulder despawns on the spot rather than flying its whole `range`. A
 * fractional pierce is floored; one that is missing, below 1 or not a number
 * is a config bug, and the boulder is then spent on its first hit rather than
 * rolling on forever.
 */
export function rollSpent(struck: number, pierce: number): boolean {
  const cap = Math.floor(pierce);
  return struck >= (cap > 1 ? cap : 1);
}
