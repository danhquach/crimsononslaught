import { BOSS_CC_DR } from '../config/boss';
import { freezeDurationOf, type FrostHit } from './frostNova';

/**
 * Diminishing returns on the boss's crowd control (#315). Each kind — stun
 * (an ice freeze counts as one), stagger and slow — keeps its own count of
 * applications; a repeat inside `BOSS_CC_DR.resetS` of the last one lasts
 * `factor` times the one before it, and a kind left alone that long starts over
 * at full length. So a build can interrupt the boss but never hold it.
 *
 * The scaling applies to the duration only, after whatever roll decided the
 * effect landed, so a seed draws the same numbers with or without it. A
 * duration of 0 or less is no application: it passes through unchanged and is
 * not counted. Normal enemies never go through here.
 *
 * Pure TS, no Phaser import.
 */

export type BossCcKind = 'stun' | 'stagger' | 'slow';

/** One kind's record: applications counted in the current window, and when the last one landed. */
export interface BossCcEntry {
  count: number;
  /** Boss clock, seconds, of the last application. */
  lastS: number;
}

export type BossCcState = Readonly<Record<BossCcKind, Readonly<BossCcEntry>>>;

const NO_ENTRY: Readonly<BossCcEntry> = { count: 0, lastS: 0 };

/** A boss no effect has landed on yet. */
export const NO_BOSS_CC: BossCcState = { stun: NO_ENTRY, stagger: NO_ENTRY, slow: NO_ENTRY };

/**
 * One `kind` of effect lands for `durationS` at `nowS` on the boss clock.
 * Returns the state after it and the duration the boss actually takes.
 */
export function applyBossCc(
  state: BossCcState,
  kind: BossCcKind,
  durationS: number,
  nowS: number,
): { state: BossCcState; durationS: number } {
  if (!(durationS > 0)) return { state, durationS };
  const entry = state[kind];
  const repeats = entry.count > 0 && nowS - entry.lastS < BOSS_CC_DR.resetS ? entry.count : 0;
  return {
    state: { ...state, [kind]: { count: repeats + 1, lastS: nowS } },
    durationS: durationS * BOSS_CC_DR.factor ** repeats,
  };
}

/**
 * A frost hit lands on the boss. A freeze is a stun, so it takes the stun
 * count; a slow is scaled in length, never in strength, and takes the slow
 * count. A hit that does not freeze, or has no slow to give, leaves that part
 * as it came and counts nothing for it.
 *
 * `frozenS` is the freeze already running. `core/frostNova.applyFrost`
 * restarts a freeze at the hit's length, so a diminished repeat would cut a
 * running one short; the freeze handed back is never shorter than `frozenS`.
 */
export function diminishFrost(
  state: BossCcState,
  hit: Readonly<FrostHit>,
  frozenS: number,
  nowS: number,
): { state: BossCcState; hit: FrostHit } {
  let next = state;
  let freezeDuration = hit.freezeDuration;
  if (hit.freeze) {
    const freeze = applyBossCc(next, 'stun', freezeDurationOf(hit), nowS);
    next = freeze.state;
    freezeDuration = Math.max(frozenS, freeze.durationS);
  }
  let slowDuration = hit.slowDuration;
  if (hit.slowPct > 0) {
    const slow = applyBossCc(next, 'slow', hit.slowDuration, nowS);
    next = slow.state;
    slowDuration = slow.durationS;
  }
  return { state: next, hit: { ...hit, slowDuration, freezeDuration } };
}
