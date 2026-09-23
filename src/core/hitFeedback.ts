import {
  CRIT_RISE_MS,
  CRIT_RISE_PX,
  CRIT_SIZE_BONUS,
  DEFAULT_FEEDBACK_SETTINGS,
  DOT_NUMBER_INTERVAL_MS,
  FEEDBACK_SETTING_KEYS,
  HEAVY_HIT_DAMAGE,
  HIT_STOP_BUDGET_MS,
  HIT_STOP_CRIT_MS,
  HIT_STOP_MS,
  HIT_STOP_REFILL,
  MAX_SHAKE_INTENSITY,
  NUMBER_COLORS,
  NUMBER_RISE_MS,
  NUMBER_RISE_PX,
  NUMBER_SIZE_TIERS,
  NUMBER_SPREAD_PX,
  SHAKE_REST_MS,
  type FeedbackSettings,
  type NumberStyle,
  type Shake,
} from '../config/hitFeedback';
import type { Rng } from './rng';
import type { SaveSettings } from './save';

/**
 * The hit feedback rules that need no engine (#125): whether a hit crits and
 * for how much, what its number shows and how it moves, how long the arena
 * freezes on it and how hard the screen shakes.
 *
 * Crits are the one rule here that changes the run — they are a stat of the
 * player profile (spec §6), rolled on a stream of their own. Everything else is
 * presentation: a run with every setting at 0 deals the same damage on the
 * same steps.
 *
 * Pure TS, no Phaser import.
 */

/**
 * How damage reached an enemy. A `hit` is one instance — a projectile, a
 * blast, a strike — and may crit. A `tick` is a ground area's periodic pulse
 * and a `dot` the per-step sliver of a burn or bleed; spec §6 keeps both from
 * critting, so one tick source never strobes the screen with crit numbers.
 */
export type HitKind = 'hit' | 'tick' | 'dot';

/**
 * Spec §6: one roll per damage instance. A chance of 0 or less never crits and
 * 1 or more always does; neither draws, so a run without Precision leaves the
 * crit stream untouched.
 */
export function rollCrit(rng: Rng, chance: number): boolean {
  if (!(chance > 0)) return false;
  if (chance >= 1) return true;
  return rng.next() < chance;
}

/** A crit's damage. A multiplier under 1 is a config slip and is read as 1: a crit never hits softer. */
export function critDamage(amount: number, multiplier: number): number {
  return amount * (Number.isFinite(multiplier) ? Math.max(1, multiplier) : 1);
}

/**
 * The whole number a hit prints: rounded, and never below 1 for damage that
 * landed at all, so a 0.4-damage sliver is still seen. Nothing, or no damage,
 * is 0 and prints no number.
 */
export function shownDamage(amount: number): number {
  if (!(amount > 0) || !Number.isFinite(amount)) return 0;
  return Math.max(1, Math.round(amount));
}

/** The text of a number: a crit is called out with a `!`. */
export function numberText(amount: number, crit: boolean): string {
  const shown = shownDamage(amount);
  return crit ? `${shown}!` : `${shown}`;
}

/** Bigger hits print bigger; a crit is larger again, gold and rises higher for longer. */
export function numberStyle(amount: number, kind: HitKind, crit: boolean): NumberStyle {
  const shown = shownDamage(amount);
  let size = 0;
  for (const tier of NUMBER_SIZE_TIERS) if (shown >= tier.min) size = tier.size;
  if (crit) {
    return {
      size: size + CRIT_SIZE_BONUS,
      color: NUMBER_COLORS.crit,
      risePx: CRIT_RISE_PX,
      riseMs: CRIT_RISE_MS,
    };
  }
  return {
    size,
    color: kind === 'hit' ? NUMBER_COLORS.hit : NUMBER_COLORS.tick,
    risePx: NUMBER_RISE_PX,
    riseMs: NUMBER_RISE_MS,
  };
}

/**
 * Where the `index`-th number starts across its enemy, in
 * [-NUMBER_SPREAD_PX, NUMBER_SPREAD_PX]: the golden-ratio sequence, which
 * never repeats and spreads any run of consecutive numbers evenly.
 */
export function numberSpread(index: number): number {
  const phase = (index * 0.618033988749895) % 1;
  return (phase * 2 - 1) * NUMBER_SPREAD_PX;
}

/**
 * A number `ageMs` into its rise: how far above its start it is (eased out,
 * so it pops and then drifts) and how opaque (solid, then fading over the last
 * 40%). `done` once it has run its course.
 */
export function numberPose(
  style: Readonly<NumberStyle>,
  ageMs: number,
): { dy: number; alpha: number; done: boolean } {
  const t = style.riseMs > 0 ? Math.min(1, Math.max(0, ageMs / style.riseMs)) : 1;
  const eased = 1 - (1 - t) * (1 - t);
  return {
    dy: -style.risePx * eased,
    alpha: t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4),
    done: t >= 1,
  };
}

/**
 * How long a hit asks the arena to freeze, in run-clock ms, before the
 * budget: a crit or a heavy hit freezes, nothing else does; a burn or bleed
 * sliver never does. `scale` is the player's setting, 0 (off) to 1.
 */
export function hitStopMs(amount: number, kind: HitKind, crit: boolean, scale: number): number {
  if (kind === 'dot') return 0;
  const base = crit ? HIT_STOP_CRIT_MS : amount >= HEAVY_HIT_DAMAGE ? HIT_STOP_MS : 0;
  return base * clampUnit(scale, 0);
}

/**
 * The run's hit-stop account: the freeze still owed, and the budget it is
 * paid out of. Held by `RunState`, which spends it from the front of each
 * frame's window.
 */
export interface HitStopState {
  readonly pendingMs: number;
  readonly budgetMs: number;
}

export const NO_HIT_STOP: HitStopState = { pendingMs: 0, budgetMs: HIT_STOP_BUDGET_MS };

/**
 * Ask for a freeze of `ms`. Freezes never add up: a meteor landing on forty
 * enemies is one freeze, not forty. What a request raises the pending freeze
 * by comes out of the budget, and an empty budget grants nothing.
 */
export function requestHitStop(state: Readonly<HitStopState>, ms: number): HitStopState {
  if (!(ms > state.pendingMs)) return { ...state };
  const raise = Math.min(ms - state.pendingMs, state.budgetMs);
  return { pendingMs: state.pendingMs + raise, budgetMs: state.budgetMs - raise };
}

/**
 * Spend the pending freeze from the front of a `windowMs` window of run time.
 * Returns what was frozen; the rest of the window moves, and refills the
 * budget as it does, up to `HIT_STOP_BUDGET_MS`.
 */
export function spendHitStop(
  state: Readonly<HitStopState>,
  windowMs: number,
): { state: HitStopState; frozenMs: number } {
  if (!(windowMs > 0)) return { state: { ...state }, frozenMs: 0 };
  const frozenMs = Math.min(state.pendingMs, windowMs);
  const moved = windowMs - frozenMs;
  return {
    state: {
      pendingMs: state.pendingMs - frozenMs,
      budgetMs: Math.min(HIT_STOP_BUDGET_MS, state.budgetMs + moved * HIT_STOP_REFILL),
    },
    frozenMs,
  };
}

/**
 * Burn and bleed damage owed to one enemy's number: summed, and how long ago
 * the first sliver of it landed.
 */
export interface DotTally {
  readonly amount: number;
  readonly ageMs: number;
}

/** Add a sliver to an enemy's tally, starting one if it had none. */
export function addDot(tally: Readonly<DotTally> | undefined, amount: number): DotTally {
  return { amount: (tally?.amount ?? 0) + amount, ageMs: tally?.ageMs ?? 0 };
}

/**
 * Age a tally by `deltaMs` of run time. Once it is `DOT_NUMBER_INTERVAL_MS`
 * old it is due: the caller prints `due` and drops the tally. Until then `due`
 * is 0 and the aged tally is carried on.
 */
export function ageDot(
  tally: Readonly<DotTally>,
  deltaMs: number,
): { tally: DotTally; due: number } {
  const ageMs = tally.ageMs + Math.max(0, deltaMs);
  if (ageMs >= DOT_NUMBER_INTERVAL_MS) return { tally: { amount: 0, ageMs: 0 }, due: tally.amount };
  return { tally: { amount: tally.amount, ageMs }, due: 0 };
}

/** The shake the camera is running, by when it ends and how hard it is. Wall-clock ms. */
export interface ShakeState {
  readonly endsAtMs: number;
  readonly intensity: number;
}

export const NO_SHAKE: ShakeState = { endsAtMs: Number.NEGATIVE_INFINITY, intensity: 0 };

/**
 * Whether a shake request plays. The setting scales it and `MAX_SHAKE_INTENSITY`
 * caps it. While a shake runs, and for `SHAKE_REST_MS` after, only a stronger
 * one may cut in — so shakes never stack, the strongest in play always shows,
 * and a stream of equal ones leaves the screen still between them.
 */
export function nextShake(
  state: Readonly<ShakeState>,
  request: Readonly<Shake>,
  nowMs: number,
  scale: number,
): { state: ShakeState; play: Shake | null } {
  const intensity = Math.min(MAX_SHAKE_INTENSITY, request.intensity * clampUnit(scale, 0));
  const unchanged = { state: { ...state }, play: null };
  if (!(intensity > 0) || !(request.durationMs > 0)) return unchanged;
  const settling = nowMs < state.endsAtMs + SHAKE_REST_MS;
  if (settling && intensity <= state.intensity) return unchanged;
  const play = { durationMs: request.durationMs, intensity };
  return { state: { endsAtMs: nowMs + request.durationMs, intensity }, play };
}

/**
 * The feedback settings held in a save's `settings`, defaults filling any key
 * that is missing or unusable, the way `readAudioSettings` reads the volumes.
 */
export function readFeedbackSettings(saved: Readonly<SaveSettings>): FeedbackSettings {
  const numbers = saved[FEEDBACK_SETTING_KEYS.numbers];
  return {
    numbers: typeof numbers === 'boolean' ? numbers : DEFAULT_FEEDBACK_SETTINGS.numbers,
    hitStop: clampUnit(saved[FEEDBACK_SETTING_KEYS.hitStop], DEFAULT_FEEDBACK_SETTINGS.hitStop),
    shake: clampUnit(saved[FEEDBACK_SETTING_KEYS.shake], DEFAULT_FEEDBACK_SETTINGS.shake),
  };
}

function clampUnit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}
