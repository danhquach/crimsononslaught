import { FREEZE_DURATION } from '../config/spells';
import type { Vec2 } from './input';
import type { Rng } from './rng';
import type { IceStats } from './spellStats';

/**
 * Frost Nova rules that do not need an engine (spec §5 "Ice — Frost Nova"):
 * who a pulse reaches, what it pays out, and how the slow and freeze it leaves
 * on an enemy stack and run out.
 *
 * `spells/FrostNovaSpell.ts` is the Phaser side; everything decidable without
 * Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/** The cold on one enemy; `NO_FROST` when there is none. */
export interface FrostState {
  /** Speed cut in force, 0–1. Meaningless once `slowRemainingS` is 0. */
  slowPct: number;
  /** Seconds of slow left. */
  slowRemainingS: number;
  /** Seconds of full stop left. */
  frozenS: number;
}

export const NO_FROST: Readonly<FrostState> = { slowPct: 0, slowRemainingS: 0, frozenS: 0 };

/** What one pulse hit leaves behind. */
export interface FrostHit {
  slowPct: number;
  slowDuration: number;
  /** Whether this hit's freeze roll came up. */
  freeze: boolean;
}

/** Whether the enemy is moving slower than its archetype says — a frozen one counts. */
export function isSlowed(state: Readonly<FrostState>): boolean {
  return frostSpeedFactor(state) < 1;
}

/**
 * Multiply the chase speed by this. A freeze is a full stop (spec §5); a slow
 * cuts `slowPct` of the speed for as long as it lasts.
 */
export function frostSpeedFactor(state: Readonly<FrostState>): number {
  if (state.frozenS > 0) return 0;
  if (state.slowRemainingS > 0 && state.slowPct > 0) return Math.max(0, 1 - state.slowPct);
  return 1;
}

/**
 * A pulse lands on an enemy (spec §5: "slow is max, not additive"). The slow in
 * force becomes the stronger of the two and its clock the longer, so a second
 * pulse refreshes a slow but never deepens or shortens it. A freeze restarts
 * its own `FREEZE_DURATION` stop. A hit with no slow to give leaves the state
 * untouched.
 */
export function applyFrost(current: Readonly<FrostState>, hit: Readonly<FrostHit>): FrostState {
  const next: FrostState = { ...current };
  if (hit.slowPct > 0 && hit.slowDuration > 0) {
    const active = current.slowRemainingS > 0 ? current.slowPct : 0;
    next.slowPct = Math.max(active, hit.slowPct);
    next.slowRemainingS = Math.max(current.slowRemainingS, hit.slowDuration);
  }
  if (hit.freeze) next.frozenS = FREEZE_DURATION;
  return next;
}

/**
 * Advance the cold by one frame. `ended` is true on the frame the enemy comes
 * back to full speed, so the caller can clear whatever marks a slowed enemy.
 */
export function tickFrost(
  state: Readonly<FrostState>,
  deltaS: number,
): { state: FrostState; ended: boolean } {
  if (!(deltaS > 0)) return { state: { ...state }, ended: false };
  const wasSlowed = isSlowed(state);
  const slowRemainingS = Math.max(0, state.slowRemainingS - deltaS);
  const next: FrostState = {
    slowPct: slowRemainingS > 0 ? state.slowPct : 0,
    slowRemainingS,
    frozenS: Math.max(0, state.frozenS - deltaS),
  };
  return { state: next, ended: wasSlowed && !isSlowed(next) };
}

/**
 * Spec §5: `damage` to everything in the ring, +`shatterBonus` of it against an
 * enemy that was already slowed when the pulse reached it. "Already" matters:
 * the caller checks before applying this pulse's own slow, or every second hit
 * would shatter.
 */
export function pulseDamage(stats: Readonly<IceStats>, slowed: boolean): number {
  return stats.damage * (1 + (slowed ? stats.shatterBonus : 0));
}

/** Everything a pulse from `origin` reaches: every enemy within `radius`, inclusive. */
export function pulseTargets<T extends Vec2>(
  origin: Readonly<Vec2>,
  enemies: readonly T[],
  radius: number,
): T[] {
  const radiusSq = radius * radius;
  return enemies.filter((enemy) => {
    const dx = enemy.x - origin.x;
    const dy = enemy.y - origin.y;
    return dx * dx + dy * dy <= radiusSq;
  });
}

/**
 * One enemy's freeze roll. The unperked spell (`freezeChance` 0) draws nothing,
 * so picking Ice does not shift the seeded sequence the rest of the run reads.
 */
export function rollFreeze(rng: Rng, freezeChance: number): boolean {
  if (!(freezeChance > 0)) return false;
  return rng.next() < freezeChance;
}
