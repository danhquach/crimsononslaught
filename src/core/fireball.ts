import { BURN_DURATION } from '../config/spells';
import type { Vec2 } from './input';
import { nearestEnemies } from './spell';
import type { FireStats } from './spellStats';

/**
 * Fireball rules that do not need an engine (spec §5 "Fire — Fireball"): who a
 * volley aims at, what an explosion pays out and to whom, and how a burn ticks.
 *
 * `spells/FireballSpell.ts` and `entities/Projectile.ts` are the Phaser side;
 * everything decidable without Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Pool size for fireballs in flight. Sized for a maxed fire build — three per
 * volley, Quick Cast twice, Long Throw — with room to spare; past it a
 * projectile is dropped, never queued, the same rule the enemy pool uses.
 */
export const MAX_LIVE_PROJECTILES = 32;

/** Spec §5: the explosion deals `damage * 0.5`; Big Blast sets the factor to 1. */
export function explosionDamage(stats: Readonly<FireStats>): number {
  return stats.damage * stats.aoeDamageFactor;
}

/**
 * Everything the explosion at `center` reaches: every enemy within `radius`
 * (inclusive) except `hit`, which already took the direct damage. The direct
 * target is left out so a fireball reads as the `damage` the card says, not
 * one and a half times it.
 */
export function splashTargets<T extends Vec2>(
  center: Readonly<Vec2>,
  enemies: readonly T[],
  radius: number,
  hit: T,
): T[] {
  const radiusSq = radius * radius;
  return enemies.filter((enemy) => {
    if (enemy === hit) return false;
    const dx = enemy.x - center.x;
    const dy = enemy.y - center.y;
    return dx * dx + dy * dy <= radiusSq;
  });
}

/**
 * One target per projectile in a volley, nearest first (spec §5: "distinct
 * targets when possible"). With fewer enemies in range than projectiles the
 * list wraps, so the extras go at the nearest again; with none it is empty and
 * the volley fires nothing.
 */
export function volleyTargets<T extends Vec2>(
  origin: Readonly<Vec2>,
  enemies: readonly T[],
  projectiles: number,
  range: number,
): T[] {
  const distinct = nearestEnemies(origin, enemies, projectiles, range);
  if (distinct.length === 0) return [];
  const targets: T[] = [];
  for (let i = 0; i < Math.floor(projectiles); i += 1) {
    targets.push(distinct[i % distinct.length] as T);
  }
  return targets;
}

/** A burn in progress on one enemy; `NO_BURN` when there is none. */
export interface BurnState {
  /** Damage per second while it lasts. */
  dps: number;
  /** Seconds left. */
  remainingS: number;
}

export const NO_BURN: Readonly<BurnState> = { dps: 0, remainingS: 0 };

export function hasBurn(state: Readonly<BurnState>): boolean {
  return state.dps > 0 && state.remainingS > 0;
}

/**
 * A hit lands on an enemy with `dps` burn for `durationS` s (spec §5: "dmg/s
 * for 2 s"; Fire Column's own window is spec §9.2's `burnDuration`). A fresh
 * hit keeps whichever dps is higher and whichever clock runs longer — its own
 * duration or what is already left — so a burn never stacks and a shorter,
 * weaker hit never cuts a stronger one short. `dps` 0 is the unperked spell:
 * nothing happens.
 */
export function applyBurn(
  current: Readonly<BurnState>,
  dps: number,
  durationS: number = BURN_DURATION,
): BurnState {
  if (!(dps > 0)) return { ...current };
  const running = hasBurn(current);
  return {
    dps: Math.max(dps, running ? current.dps : 0),
    remainingS: Math.max(durationS, running ? current.remainingS : 0),
  };
}

/**
 * Advance a burn by one frame and return the damage owed for it: `dps` scaled
 * by the frame, never past what is left, so a burn pays exactly `dps * 2` over
 * its life however the frames fall.
 */
export function tickBurn(
  state: Readonly<BurnState>,
  deltaS: number,
): { state: BurnState; damage: number } {
  if (!hasBurn(state) || !(deltaS > 0)) return { state: { ...state }, damage: 0 };
  const burned = Math.min(deltaS, state.remainingS);
  const remainingS = state.remainingS - burned;
  return {
    state: remainingS > 0 ? { dps: state.dps, remainingS } : { ...NO_BURN },
    damage: state.dps * burned,
  };
}
