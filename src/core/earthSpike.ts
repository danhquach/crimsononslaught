import type { Vec2 } from './input';
import type { Rng } from './rng';
import { nearestEnemies } from './spell';
import type { EarthStats } from './spellStats';

/**
 * Earth Spike rules that do not need an engine (#143, Phase 2 spec §9.5):
 * where a spike is flung, how many it may hold in the air, and what one strike
 * leaves behind.
 *
 * The spike is Earth's default. Since #205 it is a slow projectile — the same
 * pooled `entities/Projectile.ts` Boulder throws — that strikes the first
 * enemy it touches and can miss one that steps out of its path. When a spike
 * is used up is Boulder's `rollSpent` (`core/rollingBoulder.ts`), and the shove
 * is the ring's `knockbackVector` (`core/orbitingBoulders.ts`), both reused
 * rather than restated: every Earth spell pushes the same way.
 *
 * `spells/EarthSpikeSpell.ts` is the Phaser side; everything decidable without
 * Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Spikes in the air the pool may ever hold. Base flight is a 144 px `range` at
 * 260 px/s — about 0.55 s against a 1.1 s `cooldown`, so at most one is flying
 * — and a stacked Haste at the profile's 0.35 floor (0.385 s) brings that to
 * two; the cap is several times either and exists to bound the pool rather
 * than to shape play.
 */
export const MAX_LIVE_SPIKES = 8;

/**
 * The line a cast takes: the nearest enemy within `range` of the caster, or
 * `undefined` with none in range — the cast is then spent on nothing, the rule
 * every targeted spell here follows. The spike does not steer, so the target
 * only sets the heading.
 */
export function spikeTarget<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  range: number,
): T | undefined {
  return nearestEnemies(caster, enemies, 1, range)[0];
}

/**
 * One strike's bleed roll (spec §9.5 "applies bleed", #205: 5% per hit). A
 * block with no chance draws nothing, so a spike that cannot bleed never
 * shifts the seeded sequence the rest of the run reads — the rule `rollStun`
 * follows.
 */
export function rollBleed(rng: Rng, bleedChance: number): boolean {
  if (!(bleedChance > 0)) return false;
  return rng.next() < bleedChance;
}

/**
 * What one enemy takes from a strike: the spell's `damage`, and — when the
 * roll lands — a bleed of `bleed` damage per second for `bleedDuration`
 * (#139). Both are scaled fields, so a Power or a Persistence reaches the bleed
 * as well as the hit; a missed roll is simply a hit with nothing left behind.
 */
export function spikeHit(
  stats: Readonly<EarthStats>,
  bleeds: boolean,
): {
  damage: number;
  bleed: number;
  bleedDurationS: number;
} {
  return {
    damage: stats.damage,
    bleed: bleeds ? Math.max(0, stats.bleed) : 0,
    bleedDurationS: bleeds ? Math.max(0, stats.bleedDuration) : 0,
  };
}
