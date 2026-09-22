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
  hp: 2400,
  speed: 70,
  contactDamage: 30,
  radius: 40,
  texture: 'boss',
  cycleS: 4,
  telegraphS: 0.8,
  chargeS: 0.6,
  chargeSpeed: 400,
};
