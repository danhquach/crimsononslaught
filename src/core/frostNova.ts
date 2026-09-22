import { FREEZE_DURATION } from '../config/spells';
import type { Vec2 } from './input';
import type { Rng } from './rng';
import { nearestEnemies } from './spell';
import type { NovaBombStats } from './spellStats';

/**
 * Frost rules that do not need an engine: how the slow and freeze any Ice
 * spell leaves on an enemy stack and run out (spec §5, kept by every Phase 2
 * Ice spell through `Enemy.applyFrost`), and the Frost Nova Bomb's own rules
 * (spec §9.3) — where a throw is aimed, who its pulse reaches and what each
 * enemy caught is left with.
 *
 * `spells/NovaBombSpell.ts` is the Phaser side; everything decidable without
 * Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Bombs in flight the pool may ever hold. One leaves every 2.2 s and flies its
 * 300 px `range` in under 1.5 s, so one is normally in the air; the cap leaves
 * room for a Haste build and a long-range one together.
 */
export const MAX_LIVE_BOMBS = 8;

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
  /** Seconds the freeze lasts when it does; `FREEZE_DURATION` when the spell has no field for it. */
  freezeDuration?: number;
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
 * its own stop — the hit's `freezeDuration`, or `FREEZE_DURATION` without one.
 * A hit with no slow to give leaves the state untouched.
 */
export function applyFrost(current: Readonly<FrostState>, hit: Readonly<FrostHit>): FrostState {
  const next: FrostState = { ...current };
  if (hit.slowPct > 0 && hit.slowDuration > 0) {
    const active = current.slowRemainingS > 0 ? current.slowPct : 0;
    next.slowPct = Math.max(active, hit.slowPct);
    next.slowRemainingS = Math.max(current.slowRemainingS, hit.slowDuration);
  }
  if (hit.freeze) next.frozenS = hit.freezeDuration ?? FREEZE_DURATION;
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
 * Where a throw is aimed: the nearest enemy within `range` of the caster, or
 * `undefined` with none in range — the cast is then spent on nothing, the same
 * rule Fireball's volley follows with an empty crowd.
 */
export function bombTarget<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  range: number,
): T | undefined {
  return nearestEnemies(caster, enemies, 1, range)[0];
}

/**
 * What the pulse leaves on one enemy it catches: the bomb's slow, and its
 * freeze if that enemy's roll came up. One roll per enemy, so a seed replays
 * the same freezes.
 */
export function bombFrost(stats: Readonly<NovaBombStats>, rng: Rng): FrostHit {
  return {
    slowPct: stats.slowPct,
    slowDuration: stats.slowDuration,
    freeze: rollFreeze(rng, stats.freezeChance),
    freezeDuration: stats.freezeDuration,
  };
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
 * One enemy's freeze roll. A spell with no freeze (`freezeChance` 0) draws
 * nothing, so equipping it does not shift the seeded sequence the rest of the
 * run reads.
 */
export function rollFreeze(rng: Rng, freezeChance: number): boolean {
  if (!(freezeChance > 0)) return false;
  return rng.next() < freezeChance;
}
