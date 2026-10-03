/**
 * Player shields (#134, Phase 2 spec §9): an absorption pool that stands in
 * front of the player's HP and breaks exactly once when a hit empties it.
 *
 * Two spells wear this, both rings on a timer (#406): Ice Shield's diamonds and
 * Earth Shield's stones, each gone while the pool is empty. The pool never
 * refills by itself: each spell's own cycle puts it back full (`createShield`).
 * They differ in what they draw and what a break does, never in how the pool
 * behaves, so all of that lives here.
 *
 * The rule is deliberately *not* part of the state. Spec §6.2: a shield lives
 * as long as it is equipped and therefore reads its numbers live, so
 * `spells/ShieldSpell.ts` reads the block every frame and hands the rule to
 * each call, the way `Spell.cooldown` is read fresh per frame.
 *
 * Pure TS, no Phaser import.
 */

/** The numbers a shield behaves by, as the live stat block says them right now. */
export interface ShieldRule {
  /** `shieldHp`: the pool a full shield holds, in points of damage. */
  readonly max: number;
}

export interface ShieldState {
  /** Damage the shield can still swallow. 0 is broken. */
  readonly pool: number;
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
  return { pool: Math.max(0, rule.max) };
}

/** Whether the shield is standing: an empty pool absorbs nothing and is not drawn. */
export function isUp(state: Readonly<ShieldState>): boolean {
  return state.pool > 0;
}

/**
 * Put `amount` of the player's damage into the shield, and say what is left
 * over for their HP.
 *
 * `broke` is true only on the transition to 0, so overlapping hits in one frame
 * pay out one break: the second of them finds the pool already empty.
 */
export function absorb(state: Readonly<ShieldState>, amount: number): AbsorbResult {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { state: { ...state }, passThrough: 0, broke: false };
  }
  if (!isUp(state)) return { state: { ...state }, passThrough: amount, broke: false };

  const absorbed = Math.min(state.pool, amount);
  const pool = state.pool - absorbed;
  return {
    state: { pool },
    passThrough: amount - absorbed,
    broke: pool <= 0,
  };
}

/**
 * Running totals over a shield's life (#260). A poll can miss a pool moving —
 * a slow runner lands a few samples a run, and a refill can start and finish
 * between two of them — so the shield keeps its own count for the suite.
 */
export interface ShieldTally {
  /** Damage the pool has swallowed. */
  readonly absorbed: number;
  /** Points the pool has grown back, by a shield returning. */
  readonly regrown: number;
}

export const EMPTY_TALLY: ShieldTally = { absorbed: 0, regrown: 0 };

/**
 * Add one step of the pool, `before` to `after`, to the tally. An `absorb`
 * only ever lowers the pool and a refill only ever raises it, so the drop is
 * what was swallowed and the rise is what grew back. A step that
 * leaves the pool alone hands back the same tally, so a full shield's every
 * frame allocates nothing.
 */
export function tallyShield(
  tally: ShieldTally,
  before: Readonly<ShieldState>,
  after: Readonly<ShieldState>,
): ShieldTally {
  const change = after.pool - before.pool;
  if (!Number.isFinite(change) || change === 0) return tally;
  return change < 0
    ? { absorbed: tally.absorbed - change, regrown: tally.regrown }
    : { absorbed: tally.absorbed, regrown: tally.regrown + change };
}
