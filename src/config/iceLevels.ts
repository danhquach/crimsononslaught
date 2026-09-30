/**
 * What the Ice spells' levels 2 and 3 do beyond their stat adds (#328). The
 * stat adds themselves (a second arrow, four icicles, a second companion shot)
 * are `SPELL_LEVEL_STATS` in `spellLevels.ts`; these are the other level 2
 * and level 3 behaviours and the numbers they run on. First-cut values: the
 * bot sweep tunes them (#147's pass).
 *
 * Every freeze here is an unscaled constant that goes through
 * `Enemy.applyFrost`, so the boss's diminishing returns (`BOSS_CC_DR`) cap it
 * and no passive stretches it.
 *
 * Pure data, no Phaser import.
 */

/** Ice Arrow level 2: the volley's arrows fan out, `spreadDeg` from the first to the last. */
export const ICE_ARROW_FAN = { spreadDeg: 12 } as const;

/** Ice Arrow level 3, Shatter: an arrow that hits an already-slowed enemy throws `count` shards forward. */
export const SHATTER = {
  count: 3,
  spreadDeg: 30,
  damageFactor: 0.5,
  speed: 360,
  range: 90,
  clip: 'ice.arrow',
  drawScale: 0.55,
} as const;

/**
 * Shards the pool may ever hold. About 5 are live at the Haste clamp (2 arrows
 * x 3 shards, 0.25 s of flight each, one volley per 0.28 s), so this is well
 * over the 4x margin the other pools keep; a hit past it drops its surplus.
 */
export const MAX_LIVE_SHARDS = 24;

/** Frost Nova Bomb level 3, Cluster: the burst rolls out `count` small urchins that burst in turn. */
export const CLUSTER = {
  count: 3,
  speed: 200,
  range: 150,
  radiusFactor: 0.5,
  damageFactor: 0.4,
  clip: 'ice.urchin',
  drawScale: 0.5,
} as const;

/**
 * About 2 are live at the Haste clamp (3 urchins, 0.75 s each, one bomb per
 * 1.2 s); 12 is the margin. The range is past the bomb's own radius (110) plus
 * the urchin's (55) reach in: an urchin that burst inside the disc the bomb
 * just emptied would have nothing to catch (probed at range 70: 1 of 16 bursts).
 */
export const MAX_LIVE_MINI_URCHINS = 12;

/** Ice Shield level 2, Frost aura: while up, an enemy within `radius` of the body's edge is chilled every `tickEveryS`. */
export const FROST_AURA = {
  radius: 30,
  tickEveryS: 0.25,
  slowPct: 0.3,
  slowDurationS: 0.5,
} as const;

/** Ice Shield level 3, Shatter ring: a break also fires `icicles` icicles out to `range` and freezes what it chills. */
export const SHATTER_RING = {
  icicles: 8,
  damageFactor: 0.35,
  speed: 320,
  range: 260,
  freezeS: 1,
} as const;

/**
 * Two rings of 8 at most: a break every 2.1 s at the Haste clamp, each icicle in
 * the air 0.81 s. The range is well past `breakRadius` (120) on purpose: the
 * break has already hit everything inside that, so a ring that stopped at 140
 * would have nothing left to hit (probed: 0 hits in 3 runs).
 */
export const MAX_LIVE_SHIELD_ICICLES = 16;

/** Ice Companion level 3, Frost orb: every `every`th attack's first shot freezes its target and chills its neighbours. */
export const FROST_ORB = {
  every: 4,
  freezeS: 1,
  slowRadius: 50,
  slowPct: 0.4,
  slowDurationS: 1.5,
  clip: 'ice.bomb',
  drawScale: 0.5,
} as const;

/** Ice Storm level 2, Hail: every `everyS` a hailstone hits one enemy inside, for `damageFactor` x the tick damage. */
export const HAIL = { everyS: 1, damageFactor: 3, clip: 'ice.stormShard', drawScale: 1 } as const;

/** Ice Storm level 3, Deep freeze: the patch's last paid tick freezes everything inside for `freezeS`. */
export const DEEP_FREEZE = { freezeS: 1 } as const;
