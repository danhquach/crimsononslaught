/**
 * What the Earth spells' levels 2 and 3 do beyond their stat adds (#330). The
 * one stat add (the Earth Shield's fourth stone, level 2 only) is `SPELL_LEVEL_STATS` in
 * `spellLevels.ts`; these are the other level 2 and level 3 behaviours and the
 * numbers they run on. First-cut values: the bot sweep tunes them (#147's pass).
 *
 * Nothing here stuns. Every new crowd-control effect is a stagger (or a shove),
 * and every stagger goes through `Enemy.applyStagger`; the boss cuts each to a
 * quarter of its length (CO-221, `BOSS_CC_RESIST`) and then diminishes repeats
 * (`BOSS_CC_DR`); only Aftershock's throw is clamped for the boss. The
 * art is the roster's own clips, but for the Landslide's rut (CO-203).
 *
 * Pure data, no Phaser import.
 */

/** Earth Spike level 2: a cast flings `SPIKES_PER_CAST[level]` spikes in a fan `spreadDeg` from the first to the last, about the aim. */
export const SPIKE_FAN = { spreadDeg: 20 } as const;

/** Spikes a cast flings at each level: the fan is level 2's, and level 3 keeps it. */
export const SPIKES_PER_CAST = { 1: 1, 2: 2, 3: 2 } as const;

/**
 * Earth Spike level 3, Splinter: a spike breaks on the first enemy it hits
 * (level 1 and 2 pierce as ever) and shatters into shards that hit every other
 * enemy whose body edge is within `radiusPx` of the struck enemy, once each,
 * for `damageFactor` x the spike's damage and a `knockbackPx` shove out from the
 * hit point. The enemy the spike struck takes the spike's own hit and is not
 * hit again. No bleed and no roll: it draws nothing from any RNG stream, and a
 * spike that reaches its range without a hit shatters nothing. Drawn with the
 * `earth.shieldBreak` clip (a stone ring bursting into shards) at `drawScale`,
 * which spans the burst to about `radiusPx`.
 */
export const SPLINTER = {
  radiusPx: 60,
  damageFactor: 0.75,
  knockbackPx: 24,
  clip: 'earth.shieldBreak',
  drawScale: 1.5,
} as const;

/**
 * Boulder level 2: a throw sends `count` boulders, the second at the
 * second-nearest enemy or, with only one in range, `fallbackSpreadDeg` off the
 * first boulder's heading.
 */
export const BOULDER_SPLIT = { count: 2, fallbackSpreadDeg: 25 } as const;

/**
 * Boulder level 3, Landslide: a boulder ploughs a straight rut of broken ground
 * along its whole path. Every `spacingPx` it rolls (the first at the throw
 * point) it lays a tile, `tileLengthPx` of ground along its heading and
 * `widthPx` across, so with `spacingPx` under `tileLengthPx` neighbours overlap
 * and the rut reads as one. A tile lasts `durationS` and fades over its last
 * `fadeS`, so the rut fades from the throw end toward the boulder. The whole
 * spell has one rut clock: every `tickEveryS`, each enemy standing on any tile
 * is hit once for `tickDamageFactor` x the boulder's damage and staggered
 * `staggerS`, however many tiles it stands on. Slows a crowd crossing the rut,
 * does not hold one; no stun, no RNG. Drawn with the `RUT_CLIP` frames.
 */
export const LANDSLIDE = {
  tileLengthPx: 40,
  spacingPx: 36,
  widthPx: 32,
  durationS: 1.5,
  fadeS: 0.4,
  tickEveryS: 0.3,
  tickDamageFactor: 0.15,
  staggerS: 0.15,
} as const;

/**
 * The rut art (CO-203): `RUT_VARIANTS` frames of one straight band of broken
 * ground, `earth.rut.0` to `.3`. They are variants of the same tile, never
 * played: tile number `n` a boulder lays wears frame `n % RUT_VARIANTS`.
 */
export const RUT_CLIP = 'earth.rut';
export const RUT_VARIANTS = 4;

/**
 * Rut tiles that may be on the ground at once, across every level 3 boulder. A
 * boulder lays `floor(range / spacingPx) + 1` = 6 in its 207 px flight, a throw
 * sends 2 and, hasted to the floor, casts come every 0.7 s while a tile lasts
 * 1.5 s. A throw's tiles are laid over its 0.74 s flight, so about two full
 * throws and part of a third are down together, some 26; counting three whole
 * throws (36) is the conservative bound, 40 the margin. A tile past it is
 * dropped and counted.
 */
export const MAX_LIVE_RUT_TILES = 40;

/**
 * Earth Shield level 3, stone shock (#406): when the stones vanish at the end of
 * their uptime, or the pool breaks, every stone sends a shockwave. Each enemy
 * whose body edge is within `radius` of a stone is shoved `knockbackPx` out from
 * that stone (the nearest one, once per enemy), staggered `staggerS` and dealt
 * `damageFactor` x the stone's damage. Stagger only, no stun.
 */
export const STONE_SHOCK = {
  radius: 60,
  knockbackPx: 70,
  staggerS: 0.6,
  damageFactor: 1,
  impactScale: 0.8,
} as const;

/**
 * Earthquake level 2: a cast opens `count` quakes, the second on the densest
 * group of enemies outside the first, its centre at least `minGapFactor` x the
 * radius from it so the two are disjoint. With no such group there is no second
 * quake.
 */
export const QUAKE_SPLIT = { count: 2, minGapFactor: 2 } as const;

/**
 * Earthquake level 3, Aftershock: when a quake ends it erupts once. Everything
 * still inside takes `damageFactor` x the quake's tick damage and is thrown to
 * `edgePadPx` past the rim (its own edge outside the radius); a boss is thrown
 * at most `bossMaxThrowPx`. Drawn with the `earth.spike` clip, sized so its
 * `artPx` spans the quake's diameter. No stagger: the throw is the effect.
 */
export const AFTERSHOCK = {
  damageFactor: 5,
  edgePadPx: 8,
  bossMaxThrowPx: 40,
  clip: 'earth.spike',
  artPx: 108,
} as const;

/**
 * Earth Companion level 2: it attacks `cooldownFactor` times as often, and a
 * landed swing also sweeps the `halfArcDeg` either side of its aim, to `reachPx`
 * past the edge of each enemy, hitting up to `maxTargets` others for
 * `damageFactor` x its damage and `knockbackFactor` x its shove. No stagger.
 * A wide, long arc (120 px, 60 deg either side): a narrower one (48 px, 45 deg)
 * swept nobody on 0-23% of swings in a probe, this one 43-62%.
 */
export const EARTH_COMPANION_SWEEP = {
  cooldownFactor: 0.5,
  reachPx: 120,
  halfArcDeg: 60,
  damageFactor: 0.5,
  knockbackFactor: 0.5,
  maxTargets: 4,
  impactScale: 0.6,
} as const;

/**
 * Earth Companion level 3, Seismic slam: a landed swing leaves a quake patch of
 * `radius` on its target for `durationS`, ticking every `tickEveryS` for
 * `tickDamageFactor` x the companion's damage and a `staggerS` stagger.
 */
export const SEISMIC_SLAM = {
  radius: 40,
  durationS: 1,
  tickEveryS: 0.3,
  tickDamageFactor: 0.3,
  staggerS: 0.1,
} as const;

/**
 * Seismic patches that may be on the ground at once, on top of the shared area
 * pool's own cap: at most 4 in a second at the Haste clamp (a swing per 0.28 s,
 * each patch up 1 s), so 6 is the headroom and a swing past it places nothing.
 */
export const MAX_LIVE_SEISMIC_PATCHES = 6;
