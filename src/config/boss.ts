import type { TextureKey } from './colors';

/**
 * The boss (spec §5 "Boss"): its stats and the timings of its charge cycle.
 * Regular enemies are rows in `enemies.ts`; the boss is one of a kind, so it
 * gets its own table.
 *
 * Pure data, no Phaser import, so the numbers are unit-tested against the spec.
 * `entities/Boss.ts` reads it on spawn; `core/boss.ts` reads the timings.
 */
export interface BossConfig {
  /** Total HP across every bar. */
  hp: number;
  /** #387: how many equal bars `hp` is drawn as; the HUD peels one off at a time. */
  bars: number;
  /** Chase speed in px/s between charges. */
  speed: number;
  /** Damage dealt to the player on contact, at most once per 0.5 s. */
  contactDamage: number;
  /** Body radius in px; the hitbox, independent of the placeholder art's size. */
  radius: number;
  texture: TextureKey;
  /** Seconds from one telegraph's start to the next. */
  cycleS: number;
  /** Seconds the boss stands and flashes before a charge. */
  telegraphS: number;
  /** Seconds the charge lasts. */
  chargeS: number;
  /** Charge speed in px/s. */
  chargeSpeed: number;
}

export const BOSS: Readonly<BossConfig> = {
  // #127: sized for a 20-minute build; a starting value, tuned later.
  // #387: doubled, shown as two bars of 7200 so the fight reads as two rounds.
  hp: 14400,
  bars: 2,
  speed: 70,
  contactDamage: 30,
  radius: 40,
  texture: 'boss',
  cycleS: 4,
  telegraphS: 0.8,
  chargeS: 0.6,
  chargeSpeed: 400,
};

/**
 * Diminishing returns on the boss's crowd control (#315). A default the lead
 * chose, no spec value: Persistence stretches every stun, stagger and slow
 * without a cap, so a sword build re-staggered the boss before each stop ended
 * and it never moved or charged again. Each repeat of a kind within `resetS`
 * lasts `factor` times the one before; a kind that goes `resetS` s without an
 * application starts over at full length. Stun (an ice freeze included),
 * stagger and slow count separately. Regular enemies take none of it.
 *
 * Slows fall off too, by design: the boss is meant to be harder to affect by
 * every status, so a standing-area slow fades on it the longer it stands in.
 */
export interface BossCcDr {
  /** Each repeat's duration is this fraction of the last one's. */
  factor: number;
  /** Seconds without an application of a kind before its count starts over. */
  resetS: number;
}

export const BOSS_CC_DR: Readonly<BossCcDr> = {
  factor: 0.5,
  resetS: 4,
};

/**
 * Boss enrage (#388): once the boss is down to the last `atLastBarFraction` of
 * its final bar it turns on the player for good. Values are the ticket's, a
 * starting point to tune.
 *
 * "Time between attacks 30% shorter" is read as the charge cycle's period, 4 s
 * to 2.8 s (`attackGapMul` 0.7), got by shortening only the chase leg (2.6 s to
 * 1.4 s). The telegraph (0.8 s) is the player's warning and the clip is paced to
 * it, and the charge (0.6 s) is its length, so both stay. The charge's speed
 * grows with `speedMul`, so it reaches 312 px against 240.
 */
export interface BossEnrage {
  /** Enrages at or under this fraction of one bar's HP (of the last bar: the HP total less the others). */
  atLastBarFraction: number;
  /** Contact damage multiplier. */
  damageMul: number;
  /** Chase and charge speed multiplier. */
  speedMul: number;
  /** Multiplier on the cycle's period, taken off the chase leg alone. */
  attackGapMul: number;
  /** Multiplier on the damage the boss takes, so the last stretch is a race. */
  damageTakenMul: number;
}

export const BOSS_ENRAGE: Readonly<BossEnrage> = {
  atLastBarFraction: 0.5,
  damageMul: 1.5,
  speedMul: 1.3,
  attackGapMul: 0.7,
  damageTakenMul: 1.5,
};
