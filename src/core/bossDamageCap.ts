/**
 * The boss's damage cap (#406): a leaky bucket, so a stacked build cannot melt
 * the fight faster than the boss's tuning allows. Damage that lands while the
 * bucket has room goes in at full strength; what overflows the room lands at
 * `overflowFactor`. The bucket drains at `dpsCap` a second, and holds at most
 * one second of it, so a steady `dpsCap` fills it and anything above is cut.
 *
 * Deterministic and clock-driven: `nowS` is the run clock, which stops on pause
 * and hit-stop, so a frozen game neither drains nor fills it. Pure, no Phaser.
 */
export interface BossDamageCapConfig {
  /** Damage per second that lands in full; the bucket drains at this rate. */
  readonly dpsCap: number;
  /** The share of the overflow that still lands, 0 to 1. */
  readonly overflowFactor: number;
}

/** The bucket: damage taken in full and not yet drained, and the clock it was last read at. */
export interface BossDamageCapState {
  readonly level: number;
  readonly lastS: number;
}

export const EMPTY_BOSS_DAMAGE_CAP: BossDamageCapState = { level: 0, lastS: 0 };

/** What a hit of `amount` deals at `nowS`, and the bucket after it. */
export function capBossDamage(
  state: BossDamageCapState,
  amount: number,
  nowS: number,
  cfg: BossDamageCapConfig,
): { dealt: number; state: BossDamageCapState } {
  // A clock that did not advance (a pause) drains nothing; one that ran back is ignored.
  const lastS = Math.max(state.lastS, nowS);
  const level = Math.max(0, state.level - Math.max(0, nowS - state.lastS) * cfg.dpsCap);
  if (!(amount > 0)) return { dealt: 0, state: { level, lastS } };
  const room = Math.max(0, cfg.dpsCap - level);
  const full = Math.min(amount, room);
  const dealt = full + (amount - full) * cfg.overflowFactor;
  return { dealt, state: { level: level + full, lastS } };
}
