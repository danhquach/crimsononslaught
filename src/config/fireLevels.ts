import type { CompanionSpellId } from './companions';

/**
 * What the Fire spells' levels 2 and 3 do beyond their stat adds (#327). The
 * stat adds themselves (a second bolt, meteor, dragon or companion shot, the
 * wider wave) are `SPELL_LEVEL_STATS` in `spellLevels.ts`; these are the level 3
 * behaviours and the numbers they run on. First-cut values: the bot sweep tunes
 * them (#147's pass).
 *
 * Pure data, no Phaser import.
 */

/** Fire Bolt level 3, Ember split: each blast throws `count` small fire balls. */
export const EMBER = {
  count: 3,
  damageFactor: 0.4,
  speed: 240,
  range: 70,
  drawScale: 0.5,
} as const;

/**
 * Embers the pool may ever hold. About 5 are live at the Haste clamp (three per
 * blast, 0.29 s of flight each), so this is well over the 4x margin the other
 * pools keep; a blast past it drops its surplus embers rather than queueing.
 */
export const MAX_LIVE_EMBERS = 24;

/** Meteor level 3, Cataclysm: every `every`th cast's first strike is a giant one. */
export const CATACLYSM = {
  every: 3,
  radiusMul: 2,
  damageMul: 2,
  pondRadiusMul: 1.6,
  drawScale: 2,
} as const;

/** The arc, in degrees, the `fire.wave` front is cut for; a wider arc draws more than one front. */
export const FIRE_WAVE_ART_ARC_DEG = 95;

/**
 * Gap between the parallel lanes of one ranged companion volley, in px (level 2,
 * any ranged companion). Two shots sit +-5 px off the target's centre, well
 * inside the smallest enemy's radius plus a shot's body, so both connect.
 */
export const COMPANION_SHOT_GAP_PX = 10;

/** Fire Companion level 3, Fireball: every `every`th attack's first shot explodes and burns. */
export const COMPANION_FIREBALL = {
  every: 4,
  radius: 40,
  blastFactor: 1,
  drawScale: 1.4,
  pond: { radius: 36, durationS: 2, tickEveryS: 0.5, tickDamage: 3 },
} as const;

/** Which ranged companion's every-Nth attack is empowered, and how. Ice adds `'frostOrb'` in #328. */
export const COMPANION_EMPOWERED: Readonly<Partial<Record<CompanionSpellId, 'fireball'>>> = {
  fire_companion: 'fireball',
};

/** Fire Dragon level 3, Dragon swarm: a dragon strikes this many different enemies before it is spent (levels 1 and 2: one). */
export const DRAGON_PIERCE = { hitsPerFlight: 2 } as const;

/** Fire Wave level 3, Fire trail: the burnt ground the rim leaves, and what it burns. */
export const FIRE_TRAIL = {
  innerFrac: 0.25, // first and last ring of scorch pieces, as a share of `range`
  outerFrac: 0.85,
  pieceSpan: 64, // px a piece is drawn across at the base range; scales with range
  step: 0.62, // centre spacing as a share of pieceSpan, radial and along a ring (< 1 overlaps)
  arcInset: 0.9, // share of the arc the outermost piece centres span
  jitter: 0.25, // +- share of the step, radial and along
  scale: { min: 0.85, max: 1.15 },
  lagFrac: 0.35, // a ring is laid once the rim is this share of a span past it, hidden under the front
  flames: 4, // tiny flames on middle-ring pieces
  flameClip: 'fire.burn',
  flameScale: 0.55,
  burnInnerFrac: 0.12, // the burn band starts here, as a share of `range`, and ends at the rim
  holdS: 1.75, // how long the ground stays after its wave ends
  fadeS: 0.5,
  tickEveryS: 0.25,
  burnFactor: 0.5, // of the wave's own burn dps
  burnDurationS: 1.5, // fixed on purpose: not scaled by durationMul or Persistence, so the cap maths holds
  alpha: 1, // readability knobs; change only if the look check fails
  tint: 0xffffff,
} as const;

/** The static soot frames a scorch piece picks one of; the clip is never played. */
export const SCORCH_CLIP = 'fire.scorch';
export const SCORCH_VARIANTS = 4;

/** MAX_LIVE_WAVES + ceil(holdS / (2.2 s x 0.35)) = 4 + 3 = 7 zones at the Haste clamp, whatever Expanse does. */
export const MAX_LIVE_TRAIL_ZONES = 8;
/** 8 zones x 29 pieces = 232. */
export const MAX_LIVE_SCORCH_PIECES = 240;
/** 8 zones x 4 flames. */
export const MAX_LIVE_TRAIL_FLAMES = 32;
