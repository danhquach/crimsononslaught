/**
 * Player shields (#134, Phase 2 spec §9): an absorption pool that stands in
 * front of the player's HP, refills on its own once it is left alone, and
 * breaks exactly once when a hit empties it.
 *
 * Two spells wear this: Ice Shield is a layer on the player that hurts and
 * chills what is nearby when it shatters, and Earth Shield is a ring of stones
 * that is gone while the pool is empty. They differ in what they draw and what
 * a break does, never in how the pool behaves, so all of that lives here.
 *
 * The rule is deliberately *not* part of the state. Spec §6.2: a shield lives
 * as long as it is equipped and therefore reads its numbers live — a Haste
 * taken mid-run shortens `rechargeDelay` for the wait the player is already in
 * — so `spells/ShieldSpell.ts` reads the block every frame and hands the rule
 * to each call, the way `Spell.cooldown` is read fresh per frame.
 *
 * Pure TS, no Phaser import.
 */

/** The numbers a shield behaves by, as the live stat block says them right now. */
export interface ShieldRule {
  /** `shieldHp`: the pool a full shield holds, in points of damage. */
  readonly max: number;
  /**
   * `rechargeDelay`: seconds the shield must go unhit before it refills, and
   * with it how long a full refill takes — the spec gives one number for both
   * (§9.3: "recharges at `shieldHp / rechargeDelay` per second once
   * `rechargeDelay` seconds have passed with no damage taken"), so a broken
   * shield is back on the board one delay after it fell and whole one delay
   * after that.
   */
  readonly rechargeDelayS: number;
}

export interface ShieldState {
  /** Damage the shield can still swallow. 0 is broken. */
  readonly pool: number;
  /** Seconds left before the pool starts refilling; a hit re-arms it. */
  readonly waitS: number;
}

export interface AbsorbResult {
  readonly state: ShieldState;
  /** What the shield could not swallow — the damage the player's HP takes. */
  readonly passThrough: number;
  /** The hit that emptied the pool, so a break effect fires exactly once. */
  readonly broke: boolean;
}

/** A shield at full pool, ready to take a hit. */
export function createShield(rule: Readonly<ShieldRule>): ShieldState {
  return { pool: Math.max(0, rule.max), waitS: 0 };
}

/** Whether the shield is standing: an empty pool absorbs nothing and is not drawn. */
export function isUp(state: Readonly<ShieldState>): boolean {
  return state.pool > 0;
}

/**
 * Points the pool regains per second while it is recharging. A rule with no
 * pool or no delay never recharges rather than dividing by zero; such a config
 * is caught at boot (spec §12).
 */
export function rechargePerSecond(rule: Readonly<ShieldRule>): number {
  if (!(rule.max > 0) || !(rule.rechargeDelayS > 0) || !Number.isFinite(rule.rechargeDelayS)) {
    return 0;
  }
  return rule.max / rule.rechargeDelayS;
}

/**
 * Put `amount` of the player's damage into the shield, and say what is left
 * over for their HP.
 *
 * `broke` is true only on the transition to 0, so overlapping hits in one frame
 * pay out one break: the second of them finds the pool already empty. A hit a
 * broken shield cannot absorb also leaves the wait alone — the countdown is the
 * shield's, not the player's, and re-arming it on every touch would keep a
 * broken shield from ever coming back to a player under pressure.
 */
export function absorb(
  state: Readonly<ShieldState>,
  amount: number,
  rule: Readonly<ShieldRule>,
): AbsorbResult {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { state: { ...state }, passThrough: 0, broke: false };
  }
  if (!isUp(state)) return { state: { ...state }, passThrough: amount, broke: false };

  const absorbed = Math.min(state.pool, amount);
  const pool = state.pool - absorbed;
  return {
    state: { pool, waitS: Math.max(0, rule.rechargeDelayS) },
    passThrough: amount - absorbed,
    broke: pool <= 0,
  };
}

/**
 * Advance the shield by one frame of run time: spend the wait, then refill with
 * whatever is left of the frame.
 *
 * Spending the remainder rather than dropping it is what makes the refill start
 * on the delay's boundary instead of a frame late, and it is what keeps a
 * scaled run (`?timeScale=`) recharging at the same rate as a real-time one.
 * A pool at or above its maximum is left exactly as it is, so a `shieldHp` that
 * ever grows resizes when the shield next reforms rather than mid-pool
 * (spec §6.2).
 */
export function tickShield(
  state: Readonly<ShieldState>,
  deltaS: number,
  rule: Readonly<ShieldRule>,
): ShieldState {
  if (!(deltaS > 0) || !Number.isFinite(deltaS)) return { ...state };

  const waited = Math.min(state.waitS, deltaS);
  const waitS = state.waitS - waited;
  if (waitS > 0) return { pool: state.pool, waitS };

  if (state.pool >= rule.max) return { pool: state.pool, waitS: 0 };
  const pool = Math.min(rule.max, state.pool + rechargePerSecond(rule) * (deltaS - waited));
  return { pool, waitS: 0 };
}
