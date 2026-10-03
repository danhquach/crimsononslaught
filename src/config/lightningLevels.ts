/**
 * What the Lightning spells' levels 2 and 3 do beyond their stat adds (#329).
 * The stat adds themselves (a second strike, four chains, a fourth
 * blade) are `SPELL_LEVEL_STATS` in `spellLevels.ts`; these are the other level
 * 2 and level 3 behaviours and the numbers they run on. First-cut values: the
 * bot sweep tunes them (#147's pass).
 *
 * Every new stun is one of two things: a fixed 1 s constant (the Thunderbolt's)
 * or a roll the level added on a stream of its own; every new stagger is a
 * stagger. All of them go through `Enemy.applyStun` / `applyStagger`. The boss
 * takes no stun (CO-221) and a quarter of a stagger's length, under its
 * diminishing returns (`BOSS_CC_RESIST`, `BOSS_CC_DR`); none is ever stretched
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
 * Lightning Sword level 2: the per-enemy window between two cuts is the shorter
 * of the sword's own `hitCooldown` and this. With 4 blades a blade passes a
 * point every 0.349 s, inside the base 0.35 s window, so without a shorter one
 * the fourth blade would add nothing on one enemy. Level 3 adds no blade, so it
 * keeps level 2's window.
 */
export const SWORD_HIT_WINDOW_S = { 2: 0.3, 3: 0.3 } as const;

/**
 * Lightning Sword level 3, chain burst (#406): when the blades vanish at the end
 * of their uptime, each blade fires once. Its first target is the nearest enemy
 * within `range` of the blade, then it jumps to up to `jumps` more enemies, each
 * the nearest new one within `range` of the last, so at most `1 + jumps` enemies
 * a blade. Each is staggered for the sword's own stagger and dealt `damageFactor`
 * x the sword's damage.
 */
export const SWORD_BURST = { jumps: 2, range: 60, damageFactor: 1 } as const;

/** Burst strips the pool may ever hold: at most 4 blades x 3 links in one burst, each up for one 0.2 s clip cycle, and bursts are `uptime + recharge` apart, so 16 is the headroom. */
export const MAX_LIVE_SWORD_BURST_STRIPS = 16;
