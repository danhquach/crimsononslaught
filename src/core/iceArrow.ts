import type { FrostHit } from './frostNova';
import type { IceStats } from './spellStats';

/**
 * Ice Arrow rules that do not need an engine (Phase 2 spec §9.3): what one
 * arrow leaves on the enemy it hits. The volley itself — one target per arrow,
 * nearest first — is `core/fireball.ts`'s `volleyTargets`, shared with Fire
 * Bolt, because the two spells aim the same way and differ only in what a hit
 * does: Fire's explodes, Ice's chills.
 *
 * `spells/IceArrowSpell.ts` is the Phaser side; everything decidable without
 * Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Arrows in flight the pool may ever hold. Base `projectiles` is 1 against a
 * 0.8 s cooldown and an arrow flies its 189 px `range` in about 0.5 s, so one
 * is normally in the air; the cap leaves room for a Haste build with
 * extra arrows. `iceArrow.test.ts` holds the margin.
 */
export const MAX_LIVE_ARROWS = 32;

/**
 * What one arrow leaves behind: the spell's slow, never a freeze — freezing is
 * Frost Nova Bomb's identity (spec §9.3), so an arrow never draws from the RNG
 * and picking Ice does not shift the seeded sequence the rest of the run reads.
 */
export function arrowFrost(stats: Readonly<IceStats>): FrostHit {
  return { slowPct: stats.slowPct, slowDuration: stats.slowDuration, freeze: false };
}
