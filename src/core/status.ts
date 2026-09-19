/**
 * The three status effects #139 adds (Phase 2 spec §9.4, §9.5, §6.2): bleed, a
 * damage-over-time any spell can apply; stagger, a brief stop that is not a
 * stun; and the player's damage reduction. Each follows the rule the existing
 * statuses set — a slow takes the maximum rather than adding, a stun refreshes
 * rather than stacking — so a spell that lands twice never gets more than the
 * stronger of its two hits.
 *
 * Bleed is burn (`core/fireball.ts`) with the duration on the hit instead of a
 * global constant: `bleedDuration` is a scaled spell field, `BURN_DURATION` is
 * not. Stagger is stun (`core/chainLightning.ts`) kept in its own timer so the
 * two coexist: an enemy carrying both stands still until the longer one ends.
 *
 * Pure TS, no Phaser import.
 */

/** A bleed in progress on one enemy; `NO_BLEED` when there is none. */
export interface BleedState {
  /** Damage per second while it lasts. */
  dps: number;
  /** Seconds left. */
  remainingS: number;
}

export const NO_BLEED: Readonly<BleedState> = { dps: 0, remainingS: 0 };

export function hasBleed(state: Readonly<BleedState>): boolean {
  return state.dps > 0 && state.remainingS > 0;
}

/**
 * A hit lands with `dps` of bleed for `durationS`. A fresh hit keeps whichever
 * dps is higher and whichever clock is longer, so a bleed never stacks and a
 * weaker or shorter hit never cuts a stronger one short. A hit with no dps or
 * no duration is the unperked spell: nothing happens, and a bleed already
 * running is left alone.
 */
export function applyBleed(
  current: Readonly<BleedState>,
  dps: number,
  durationS: number,
): BleedState {
  if (!(dps > 0) || !(durationS > 0)) return { ...current };
  return {
    dps: Math.max(dps, hasBleed(current) ? current.dps : 0),
    remainingS: Math.max(durationS, hasBleed(current) ? current.remainingS : 0),
  };
}

/**
 * Advance a bleed by one frame and return the damage owed for it: `dps` scaled
 * by the frame, never past what is left, so a bleed pays exactly
 * `dps * duration` over its life however the frames fall.
 */
export function tickBleed(
  state: Readonly<BleedState>,
  deltaS: number,
): { state: BleedState; damage: number } {
  if (!hasBleed(state) || !(deltaS > 0)) return { state: { ...state }, damage: 0 };
  const bled = Math.min(deltaS, state.remainingS);
  const remainingS = state.remainingS - bled;
  return {
    state: remainingS > 0 ? { dps: state.dps, remainingS } : { ...NO_BLEED },
    damage: state.dps * bled,
  };
}

/**
 * A stagger is a short stop. A fresh hit brings the remaining stop up to
 * `staggerS` and never shortens it, so staggers refresh rather than stack.
 * `staggerS` 0 is the unperked spell: nothing happens.
 */
export function applyStagger(remainingS: number, staggerS: number): number {
  if (!(staggerS > 0)) return remainingS;
  return Math.max(remainingS, staggerS);
}

/** Multiply the chase speed by this: 0 while staggered, 1 otherwise. */
export function staggerSpeedFactor(remainingS: number): number {
  return remainingS > 0 ? 0 : 1;
}

/**
 * Advance the stagger by one frame. `ended` is true on the frame the enemy
 * comes back to full speed, so the caller can clear whatever marks it.
 */
export function tickStagger(
  remainingS: number,
  deltaS: number,
): { remainingS: number; ended: boolean } {
  if (!(deltaS > 0)) return { remainingS, ended: false };
  const next = Math.max(0, remainingS - deltaS);
  return { remainingS: next, ended: remainingS > 0 && next === 0 };
}

/**
 * What a hit costs the player after `damageReduction` (spec §4.1: the fraction
 * of incoming damage removed). It sits between the shields and the HP —
 * spec §9.3: a shield absorbs the raw hit, and what passes through is reduced
 * here before `core/health.ts` sees it — so a shield pays full price and the
 * player pays the discounted one. Anything outside 0–1 is clamped: the profile
 * caps it at 0.6, and a reduction of 1 would make the player unkillable.
 */
export function reduceDamage(amount: number, reduction: number): number {
  if (!(amount > 0)) return 0;
  const kept = 1 - Math.min(1, Math.max(0, Number.isFinite(reduction) ? reduction : 0));
  return amount * kept;
}
