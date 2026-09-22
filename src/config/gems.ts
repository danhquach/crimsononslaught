/**
 * XP gem tunables (spec §5 "XP and level-up").
 *
 * Pure data, no Phaser import, so the numbers are unit-tested against the spec
 * table. `core/gems.ts` holds the pickup and drift rules that read them.
 */

/**
 * Pickup radius in px for XP gems; a passive can increase it (Magnet).
 *
 * The spec's first guess was 40. At 40 a CO-125 baseline run left ~540 gems
 * lying in the arena at 5:00 against ~165 XP banked — the crowd stands between
 * the player and everything it dropped, so the run could not level into its own
 * loadout. See `docs/tuning/phase2-balance.md` round 1.
 */
export const PICKUP_RADIUS = 60;

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
