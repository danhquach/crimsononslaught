/**
 * XP gem tunables (spec §5 "XP and level-up").
 *
 * Pure data, no Phaser import, so the numbers are unit-tested against the spec
 * table. `core/gems.ts` holds the pickup and drift rules that read them.
 */

/** Spec §5: "Pickup radius 40 px for XP gems (perk can increase)". */
export const PICKUP_RADIUS = 40;

/**
 * Drift speed in px/s once a gem is inside the pickup radius. Comfortably above
 * the player's 180 px/s, so a gem that is in range catches up rather than being
 * outrun.
 */
export const GEM_DRIFT_SPEED = 400;

/** Spec §5 "XP and level-up": "Gem = 1 XP". */
export const GEM_XP_VALUE = 1;

/**
 * Pool size, sitting well above the 300-enemy cap so a full arena wiped at once
 * still has a gem for every death. Past it a drop is dropped, never queued —
 * the same rule the enemy pool uses (spec §5).
 */
export const MAX_LIVE_GEMS = 1000;
