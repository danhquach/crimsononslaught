/**
 * What the Lightning spells' levels 2 and 3 do beyond their stat adds (#329).
 * The stat adds themselves (a second strike, four chains, a fourth and fifth
 * blade) are `SPELL_LEVEL_STATS` in `spellLevels.ts`; these are the other level
 * 2 and level 3 behaviours and the numbers they run on. First-cut values: the
 * bot sweep tunes them (#147's pass).
 *
 * Every new stun is one of two things: a fixed 1 s constant (the Thunderbolt's)
 * or a roll the level added on a stream of its own; every new stagger is a
 * stagger. All of them go through `Enemy.applyStun` / `applyStagger`, so the
 * boss's diminishing returns (`BOSS_CC_DR`) cap them, and none is ever stretched
 * by a passive. The art is the roster's own clips: no new sheet.
 *
 * Pure data, no Phaser import.
 */

/**
 * Lightning Bolt level 3, Thunderbolt: every `every`th cast that launched a bolt
 * also drops one bolt from the sky on the first target, for `damageFactor` x the
 * bolt's damage in a `radius` disc, and stuns whatever it catches for a fixed
 * `stunS`. Fixed and unscaled: Persistence never stretches it, the rule Ice's
 * freezes follow.
 */
export const THUNDERBOLT = {
  every: 5,
  radius: 50,
  damageFactor: 2,
  stunS: 1,
  strikeClip: 'lightning.strike',
  strikeScale: 1.8,
  impactClip: 'lightning.impact',
  impactScale: 1.9,
} as const;

/** Chain Lightning level 3, Fork: the chain splits at its first hit into two branches, `maxHits` enemies in all (the first included). Each branch jumps up to `chains` times. */
export const FORK = { maxHits: 7 } as const;

/**
 * Tornado level 2: a cast sends `count` funnels, the second at the second-nearest
 * enemy or, with only one in range, `fallbackSpreadDeg` off the first funnel's heading.
 */
export const TORNADO_SPLIT = { count: 2, fallbackSpreadDeg: 30 } as const;

/**
 * Tornado level 3, Storm cell: every `everyS` a funnel throws a bolt at an enemy
 * within `range` of its eye, for `damageFactor` x its tick damage. Stagger only:
 * it never stuns and never rolls.
 */
export const STORM_CELL = {
  everyS: 0.5,
  range: 140,
  speed: 800,
  damageFactor: 2,
  staggerS: 0.3,
  clip: 'lightning.bolt',
  drawScale: 0.6,
  impactScale: 0.6,
} as const;

/**
 * Storm bolts the pool may ever hold: about 4 funnels live at the Haste clamp
 * (2 per cast, a cast per 3.15 s, 5 s each), each throwing 2 bolts a second that
 * fly at most 0.22 s, so about 2 are live and 7 with the area cap (16) full.
 */
export const MAX_LIVE_STORM_BOLTS = 24;

/**
 * Lightning Companion level 2: it attacks `cooldownFactor` times as often, and a
 * landed swing also arcs across the `halfArcDeg` either side of its aim, to
 * `reachPx` past the edge of each enemy, hitting up to `maxTargets` others for
 * `damageFactor` x its damage. Stagger only.
 */
export const COMPANION_SWEEP = {
  cooldownFactor: 0.5,
  reachPx: 56,
  halfArcDeg: 50,
  damageFactor: 0.5,
  maxTargets: 4,
  impactScale: 0.6,
} as const;

/** Lightning Companion level 3, Thunderclap: every landed swing chains on from its target to `jumps` more enemies, each within `range` of the last. The stagger is the companion's own. */
export const THUNDERCLAP = { jumps: 3, range: 100, damageFactor: 0.6 } as const;

/**
 * Companion strips (the sweep's chord and Thunderclap's links) the pool may ever
 * hold: at most 4 a swing, one per 0.14 s at the Haste clamp, each strip up for
 * one 0.2 s clip cycle.
 */
export const MAX_LIVE_COMPANION_STRIPS = 24;

/**
 * Lightning Sword levels 2 and 3: the per-enemy window between two cuts is the
 * shorter of the sword's own `hitCooldown` and this. With 4 and 5 blades a blade
 * passes a point every 0.349 s and 0.279 s, inside the base 0.35 s window, so
 * without a shorter one the extra blades would add nothing on one enemy.
 */
export const SWORD_HIT_WINDOW_S = { 2: 0.3, 3: 0.24 } as const;

/**
 * Lightning Sword level 3: a blade's cut also arcs from the blade to up to
 * `jumps` other enemies, each within `range` of the last link, for
 * `damageFactor` x the sword's damage; a blade arcs at most once per
 * `perBladeCooldownS`. The stagger is the sword's own.
 */
export const SWORD_ARC = {
  jumps: 2,
  range: 60,
  damageFactor: 0.5,
  perBladeCooldownS: 0.25,
} as const;

/** Sword arc strips the pool may ever hold: at most 5 arcs per 0.25 s, 2 strips each, each up for one 0.2 s clip cycle. */
export const MAX_LIVE_SWORD_ARC_STRIPS = 32;
