import type { Vec2 } from './input';
import { nearestEnemies } from './spell';
import type { EarthStats } from './spellStats';

/**
 * Earth Spike rules that do not need an engine (#143, Phase 2 spec §9.5): where
 * the spike erupts, who it catches, and what a hit leaves behind.
 *
 * The spike is Earth's default. It is instantaneous and puts no body in the
 * world — a cast picks a point and resolves against the crowd geometrically,
 * the way `core/chainLightning.ts` resolves a bolt — so the only thing on
 * screen is the burst the spell draws. The shove itself is the ring's
 * `knockbackVector` (`core/orbitingBoulders.ts`), reused rather than restated:
 * every Earth spell pushes the same way.
 *
 * `spells/EarthSpikeSpell.ts` is the Phaser side; everything decidable without
 * Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Where a cast erupts: under the nearest enemy within `targetRange` of the
 * caster, or `undefined` with none in range — the cast is then spent on
 * nothing, the rule every targeted spell here follows.
 */
export function spikeTarget<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  targetRange: number,
): T | undefined {
  return nearestEnemies(caster, enemies, 1, targetRange)[0];
}

/**
 * Everything the eruption catches: every enemy within `radius` of the spike
 * point, nearest first. The enemy the spike was aimed at is always one of them
 * — it is standing on the point — so a cast never misses what it targeted, and
 * whatever is crowded around it is caught too.
 */
export function spikeCaught<T extends Vec2>(
  origin: Readonly<Vec2>,
  enemies: readonly T[],
  radius: number,
): T[] {
  return nearestEnemies(origin, enemies, enemies.length, radius);
}

/**
 * What one enemy takes from the eruption: the spell's `damage`, and a bleed of
 * `bleed` damage per second for `bleedDuration` (#139). Both are scaled fields,
 * so a Power or a Persistence reaches the bleed as well as the hit; a block
 * with neither is simply a hit with nothing left behind.
 */
export function spikeHit(stats: Readonly<EarthStats>): {
  damage: number;
  bleed: number;
  bleedDurationS: number;
} {
  return {
    damage: stats.damage,
    bleed: Math.max(0, stats.bleed),
    bleedDurationS: Math.max(0, stats.bleedDuration),
  };
}
