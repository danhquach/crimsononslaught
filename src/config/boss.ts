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
  hp: number;
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
  hp: 7200,
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
