import type { PerkNode } from '../config/perks';
import type { Rng } from './rng';

/**
 * Which perks a level-up may offer (spec §5 "XP and level-up").
 *
 * Two pure steps so both are testable without a run: `eligible` filters the
 * tree against what the player owns, `offer` draws the cards from that list.
 * `PerkSystem` (CO-042) owns the `owned` map and turns the result into
 * `PerkCard`s for the overlay.
 *
 * Pure TS, no Phaser import.
 */

/** Perk id -> ranks taken so far. Absent means zero. */
export type OwnedPerks = ReadonlyMap<string, number>;

/** Ranks of `perkId` taken so far. */
export function ownedRank(owned: OwnedPerks, perkId: string): number {
  return owned.get(perkId) ?? 0;
}

/**
 * Spec §5: eligible = prerequisite owned at rank >= 1 AND current rank < maxRank.
 * Tier 1 nodes have no prereq, so they are eligible until maxed out.
 */
export function eligible(tree: readonly PerkNode[], owned: OwnedPerks): readonly PerkNode[] {
  return tree.filter(
    (perk) =>
      ownedRank(owned, perk.id) < perk.maxRank &&
      (perk.prereq === undefined || ownedRank(owned, perk.prereq) >= 1),
  );
}

/**
 * Draw up to `size` distinct perks from `pool`, uniformly and in random order.
 * Deterministic for a given `rng` state, so a seed replays the same offers.
 */
export function offer(rng: Rng, pool: readonly PerkNode[], size: number): readonly PerkNode[] {
  if (size <= 0) return [];
  return rng.shuffle(pool).slice(0, size);
}
