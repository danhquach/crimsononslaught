/**
 * Hit feedback tunables (#125): damage numbers, hit-stop, screen shake and
 * the hit flash. None of it decides anything — every value here only changes
 * what a hit looks like, never what it does. `core/hitFeedback.ts` turns them
 * into rules; `systems/DamageNumberPool.ts` and `GameScene` draw them.
 *
 * Pure data, no Phaser import.
 */

/**
 * Damage numbers that may be on screen at once. Past this a number is
 * dropped, never queued, the rule every pool follows: a crowd at the enemy
 * cap takes hundreds of hits a second, and the cap is what keeps that from
 * burying the arena in text (and the frame rate in text redraws).
 */
export const MAX_LIVE_NUMBERS = 64;

/**
 * A hit this large or larger is heavy: it freezes the run for a moment. Earth
 * Spike and a shield's break are the smallest such at base, Meteor the
 * largest; every other base hit is below it.
 */
export const HEAVY_HIT_DAMAGE = 40;

/** Run-clock ms a heavy hit freezes the arena for. */
export const HIT_STOP_MS = 45;

/** A crit freezes for longer, heavy or not. */
export const HIT_STOP_CRIT_MS = 60;

/**
 * The most hit-stop the run may bank: freezes are paid out of a budget of
 * this many ms, refilled by `HIT_STOP_REFILL` ms per ms of run time that
 * moved. At the refill rate below at most about 7% of a run is ever frozen,
 * however many heavy hits land, so a crit build at the enemy cap still moves.
 */
export const HIT_STOP_BUDGET_MS = 90;
export const HIT_STOP_REFILL = 0.075;

/**
 * Burn and bleed pay out a sliver every simulation step. Their numbers are
 * summed per enemy and shown once this many run-clock ms after the first
 * sliver, so a burning crowd reads as ticks rather than a strobe.
 */
export const DOT_NUMBER_INTERVAL_MS = 300;

/** How a damage number looks: font size in px, fill colour, and how far and how long it rises. */
export interface NumberStyle {
  readonly size: number;
  readonly color: string;
  readonly risePx: number;
  readonly riseMs: number;
}

/** Font sizes by the damage shown: a number at or above `min` takes `size`; the last match wins. */
export const NUMBER_SIZE_TIERS: readonly { readonly min: number; readonly size: number }[] = [
  { min: 0, size: 13 },
  { min: 10, size: 15 },
  { min: 25, size: 18 },
  { min: 50, size: 22 },
];

/** A crit's number is this much larger than its tier, and says so in colour and a `!`. */
export const CRIT_SIZE_BONUS = 6;

export const NUMBER_COLORS = {
  hit: '#ffffff',
  crit: '#ffd23f',
  /** Ground-area ticks, burn and bleed: over time, so quieter than a hit. */
  tick: '#ff9a52',
} as const;

export const NUMBER_RISE_PX = 26;
export const NUMBER_RISE_MS = 650;
export const CRIT_RISE_PX = 36;
export const CRIT_RISE_MS = 850;

/**
 * Numbers start spread across this many px either side of the enemy, on a
 * fixed sequence rather than a random one (the run's RNG is for the run), so
 * several hits on one enemy do not print on top of each other.
 */
export const NUMBER_SPREAD_PX = 10;

/** A camera shake: how long it lasts on the wall clock and how far it throws the view (Phaser's fraction of the viewport). */
export interface Shake {
  readonly durationMs: number;
  readonly intensity: number;
}

export type ShakeKind = 'playerHurt' | 'bossCharge' | 'explosion';

export const SHAKES: Readonly<Record<ShakeKind, Shake>> = {
  playerHurt: { durationMs: 160, intensity: 0.006 },
  bossCharge: { durationMs: 260, intensity: 0.008 },
  explosion: { durationMs: 140, intensity: 0.004 },
};

/** No shake is ever harder than this, whatever asks for it. */
export const MAX_SHAKE_INTENSITY = 0.01;

/**
 * Wall-clock ms the camera rests after a shake before one of the same or less
 * strength may start. A stronger one always cuts in. This is what lets the
 * screen settle under a stream of explosions.
 */
export const SHAKE_REST_MS = 350;

/** An explosion drawn at this scale or larger shakes the screen: Meteor's blast, or a fireball grown by Expanse. */
export const LARGE_EXPLOSION_SCALE = 2.5;

/** Run-clock ms an enemy flashes white after a hit (not a burn or bleed sliver). */
export const HIT_FLASH_MS = 60;

export const HIT_FLASH_TINT = 0xffffff;

/**
 * The accessibility settings (#125), held in the save's `settings` like the
 * audio ones, and changed from the Settings panel (#121).
 */
export const FEEDBACK_SETTING_KEYS = {
  numbers: 'feedback.numbers',
  hitStop: 'feedback.hitStop',
  shake: 'feedback.shake',
} as const;

export interface FeedbackSettings {
  /** Damage numbers on or off. */
  numbers: boolean;
  /** Multiplier in [0, 1] on every freeze; 0 is off. */
  hitStop: number;
  /** Multiplier in [0, 1] on every shake's intensity; 0 is off. */
  shake: number;
}

export const DEFAULT_FEEDBACK_SETTINGS: Readonly<FeedbackSettings> = {
  numbers: true,
  hitStop: 1,
  shake: 1,
};
