import { BOSS_CC_DR, BOSS_CC_RESIST } from '../config/boss';
import { freezeDurationOf, type FrostHit } from './frostNova';

/**
 * How the boss takes crowd control (#315, CO-221). A stun does nothing to it
 * and a freeze does not hold it (`bossFrost` turns one into a slow). A stagger
 * or slow lasts a quarter of its length (`resistBossCc`), and the diminishing
 * returns on top still apply: each kind (stagger, slow) keeps its own count of
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

export type BossCcKind = 'stagger' | 'slow';

/** One kind's record: applications counted in the current window, and when the last one landed. */
export interface BossCcEntry {
  count: number;
  /** Boss clock, seconds, of the last application. */
  lastS: number;
}

export type BossCcState = Readonly<Record<BossCcKind, Readonly<BossCcEntry>>>;

const NO_ENTRY: Readonly<BossCcEntry> = { count: 0, lastS: 0 };

/** A boss no effect has landed on yet. */
export const NO_BOSS_CC: BossCcState = { stagger: NO_ENTRY, slow: NO_ENTRY };

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
 * A stagger or slow of `durationS` lands on the boss (CO-221): cut to
 * `BOSS_CC_RESIST.durationFactor` of its length, then through the repeat
 * halving of `applyBossCc`. `durationS` is the Persistence-stretched value, so
 * the cut is relative to it.
 */
export function resistBossCc(
  state: BossCcState,
  kind: BossCcKind,
  durationS: number,
  nowS: number,
): { state: BossCcState; durationS: number } {
  return applyBossCc(state, kind, durationS * BOSS_CC_RESIST.durationFactor, nowS);
}

/**
 * A frost hit lands on the boss (CO-221). A freeze is shrugged off: it is not
 * a freeze but a slow of at least `freezeSlowPct`, lasting `freezeSlowPerFreezeS`
 * times the freeze (or the hit's own slow when that is stronger or longer), and
 * `shrugged` is true so the caller can show it. The hit's slow, whether its own
 * or the freeze's, is then cut and halved as one application of the slow count,
 * so one hit is one slow however it came about. A hit with no freeze and no
 * slow comes back as it was.
 */
export function bossFrost(
  state: BossCcState,
  hit: Readonly<FrostHit>,
  nowS: number,
): { state: BossCcState; hit: FrostHit; shrugged: boolean } {
  let slowPct = hit.slowPct;
  let slowDuration = hit.slowDuration;
  const shrugged = hit.freeze;
  if (hit.freeze) {
    slowPct = Math.max(slowPct, BOSS_CC_RESIST.freezeSlowPct);
    slowDuration = Math.max(
      slowDuration,
      freezeDurationOf(hit) * BOSS_CC_RESIST.freezeSlowPerFreezeS,
    );
  }
  let next = state;
  if (slowPct > 0 && slowDuration > 0) {
    const slow = resistBossCc(next, 'slow', slowDuration, nowS);
    next = slow.state;
    slowDuration = slow.durationS;
  }
  return {
    state: next,
    hit: { slowPct, slowDuration, freeze: false, freezeDuration: undefined },
    shrugged,
  };
}

/** Whether enough boss time has passed since the last "Immune" pop (`lastS`) to show another. */
export function immunePopDue(lastS: number, nowS: number): boolean {
  return nowS - lastS >= BOSS_CC_RESIST.immunePopGapS;
}
