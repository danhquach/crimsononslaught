/**
 * What the Lightning spells' levels 2 and 3 do beyond their stat adds (#329).
 * The stat adds themselves (a second bolt, two more chains, a fourth and fifth
 * blade) are `SPELL_LEVEL_STATS` in `spellLevels.ts`; these are the other
 * level 2 and level 3 behaviours and the numbers they run on. First-cut values:
 * the bot sweep tunes them (#147's pass).
 *
 * Every stun here is an unscaled constant that goes through `Enemy.applyStun`,
 * and every stagger through `Enemy.applyStagger`, so the boss's diminishing
 * returns (`BOSS_CC_DR`) cap them, a stagger refreshes rather than stacks, and
 * no passive stretches either.
 *
 * Pure data, no Phaser import.
 */

/**
 * Lightning Bolt level 3, Thunderbolt: every `every`th cast that sent a bolt
 * also calls a sky strike on that cast's first target, hitting everything
 * within `radius` for `damageFactor` x the bolt's damage and stunning it for
 * `stunS`. A fixed stun, no roll, so it draws nothing from any RNG.
 */
export const THUNDERBOLT = {
  every: 5,
  radius: 60,
  damageFactor: 1.5,
  stunS: 1,
  clip: 'lightning.strike',
  drawScale: 1.6,
} as const;

/**
 * Chain Lightning level 3, Fork: at a bolt's first target the chain splits in
 * two, each branch jumping up to `chains` times, and the whole bolt strikes at
 * most `maxHits` enemies, its first target included.
 */
export const FORK = { maxHits: 8 } as const;

/** Tornado level 2: `count` tornadoes a cast, fanned `spreadDeg` from the first to the last about the aim. */
export const TWIN_TORNADO = { count: 2, spreadDeg: 30 } as const;

/**
 * Tornado level 3, Storm cell: every `everyS` of its life a funnel throws a
 * small bolt at the nearest enemy within `range` of its eye, outside the eye
 * first (what is inside is already being ground), for `damageFactor` x the
 * tornado's tick damage and a `staggerS` stagger. No stun, no roll.
 */
export const STORM_CELL = {
  everyS: 0.5,
  range: 140,
  damageFactor: 1.6,
  staggerS: 0.2,
  speed: 900,
  clip: 'lightning.bolt',
  drawScale: 0.5,
} as const;

/**
 * Storm cell bolts the pool may ever hold. At the Haste clamp a cast every
 * 3.15 s of 5 s funnels keeps at most 2 casts, 4 funnels, on the ground; each
 * throws a bolt every 0.5 s that crosses its 140 px in 0.16 s, so each funnel
 * has at most one in the air: 4 at once, and 16 is the 4x margin the other
 * pools keep. A bolt past it is dropped, never queued.
 */
export const MAX_LIVE_STORM_BOLTS = 16;

/**
 * Lightning Companion level 2: it attacks `cooldownFactor` x as often (twice as
 * fast), and each landed swing also strikes the enemies in an arc in front of
 * it: within `radius` of the ally (to the enemy's edge) and `halfAngleDeg` of
 * the line to its target, at most `maxTargets`, for `damageFactor` x the swing.
 */
export const COMPANION_FRENZY = { cooldownFactor: 0.5 } as const;

/** Level 2's arc in front of the swinging ally (see `COMPANION_FRENZY`). */
export const COMPANION_ARC = {
  radius: 56,
  halfAngleDeg: 50,
  damageFactor: 0.5,
  maxTargets: 6,
} as const;

/**
 * Lightning Companion level 3, Thunderclap: each landed swing (the end of its
 * charge) chains from its target to up to `chains` nearby enemies, each jump
 * within `chainRange` of the last, for `damageFactor` x the swing.
 */
export const THUNDERCLAP = { chains: 3, chainRange: 110, damageFactor: 0.6 } as const;

/**
 * Lightning Sword level 3: each cut arcs a short chain from the blade that made
 * it to up to `maxTargets` other enemies, each within `range` of the blade or
 * of the enemy before it, for `damageFactor` x the cut.
 */
export const SWORD_ARC = { maxTargets: 2, range: 60, damageFactor: 0.5 } as const;

/**
 * Sprites the Lightning Companion's Thunderclap arcs may be drawn with at once
 * (`ArcFlashPool`). A hop of up to 110 px is 3 sprites of the chain art, a
 * swing lays 3 hops, and an arc lives one pass of the clip (0.2 s): at a swing
 * every 0.14 s (the Haste clamp) about 2 swings' arcs, 18 sprites, are up.
 * Past the cap an arc is not drawn and its chain still lands.
 */
export const MAX_THUNDERCLAP_ARC_SPRITES = 36;

/**
 * Sprites the Lightning Sword's arcs may be drawn with at once. A hop of up to
 * 60 px is 2 sprites and an arc 2 hops; five blades in a thick crowd arc a few
 * cuts a frame, so a busy ring keeps a few dozen up. Past the cap an arc is not
 * drawn and still lands.
 */
export const MAX_SWORD_ARC_SPRITES = 48;
