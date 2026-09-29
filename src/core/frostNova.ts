import { FREEZE_DURATION } from '../config/spells';
import { densestSpot } from './groundArea';
import type { Vec2 } from './input';
import type { Rng } from './rng';
import { anyWithin, nearestEnemies } from './spell';
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
 * Bombs in flight the pool may ever hold. One leaves every 3.5 s and rolls its
 * 240 px `range` in 3 s (CO-182), so one is normally in the air; the cap leaves
 * room for a Haste build and a long-range one together.
 */
export const MAX_LIVE_BOMBS = 8;

/** The bomb sprite's turn rate, in degrees per second (CO-182). The look only: no rule reads it. */
export const BOMB_SPIN_DEG_PER_S = 540;

/** How far the icicle set turns from one throw to the next, in degrees (CO-182): the spiral. */
export const ICICLE_SPIRAL_STEP_DEG = 40;

/** Live enemies inside an armed bomb's burst `radius` that set it off (CO-182). */
export const BURST_TRIGGER_COUNT = 3;

/**
 * How far, in px, a bomb rolls before a group can set it off (CO-182). Without
 * it a crowd round the player met the trigger on the throw's first frame and
 * every bomb burst at the player's feet with no icicle thrown; 120 px is 1.5 s
 * of roll at the base speed, 6 throws.
 */
export const BURST_ARM_DISTANCE = 120;

/**
 * Icicles in the air the pool may ever hold (CO-182). An icicle lives about
 * 0.34 s (110 px at 320 px/s) and a bomb throws 2 every 0.25 s, so one bomb
 * keeps about 3 up; the cap leaves room for a hasted, long-range build with
 * several bombs rolling at once.
 */
export const MAX_LIVE_ICICLES = 32;

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

/** Seconds the freeze in `hit` lasts: its own `freezeDuration`, or `FREEZE_DURATION` when the spell has no field for it. */
export function freezeDurationOf(hit: Readonly<FrostHit>): number {
  return hit.freezeDuration ?? FREEZE_DURATION;
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
  if (hit.freeze) next.frozenS = freezeDurationOf(hit);
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
 * Where a throw heads (CO-182): toward the densest group within `range`, the
 * spot Ice Storm would drop on (`densestSpot`), as a unit vector. With nobody
 * in range, `undefined` — the cast waits (#212). Should the densest spot be
 * the caster itself (an enemy standing on the player), the nearest enemy
 * decides instead, and one standing exactly on the player sends it right.
 */
export function bombAim<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  radius: number,
  range: number,
  rng: Rng,
): Vec2 | undefined {
  if (!anyWithin(caster, enemies, range)) return undefined;
  const spot = densestSpot(caster, enemies, radius, range, rng);
  let dx = spot.x - caster.x;
  let dy = spot.y - caster.y;
  if (dx === 0 && dy === 0) {
    const offCaster = enemies.filter((enemy) => enemy.x !== caster.x || enemy.y !== caster.y);
    const [nearest] = nearestEnemies(caster, offCaster, 1, range);
    if (!nearest) return { x: 1, y: 0 };
    dx = nearest.x - caster.x;
    dy = nearest.y - caster.y;
  }
  const length = Math.hypot(dx, dy);
  return { x: dx / length, y: dy / length };
}

/**
 * The headings, in radians, of throw number `throwIndex` (0 = the first)
 * (CO-182): `icicles` spaced evenly round the circle, the set starting a
 * quarter turn off the aim and turning `ICICLE_SPIRAL_STEP_DEG` per throw, so
 * the spray spirals out as the bomb rolls.
 */
export function throwAngles(aimRad: number, throwIndex: number, icicles: number): number[] {
  const count = Math.floor(icicles);
  if (!(count > 0)) return [];
  const start = aimRad + Math.PI / 2 + (throwIndex * ICICLE_SPIRAL_STEP_DEG * Math.PI) / 180;
  return Array.from({ length: count }, (_, i) => start + (i * 2 * Math.PI) / count);
}

/**
 * Throws owed now (CO-182): one every `throwInterval` s after the launch, the
 * first a full interval in, less the `thrown` already made. A long step owes
 * every throw it covered, so a scaled run sprays as many icicles as a real one.
 */
export function throwsDue(elapsedS: number, thrown: number, throwInterval: number): number {
  if (!(throwInterval > 0) || !(elapsedS > 0)) return 0;
  return Math.max(0, Math.floor(elapsedS / throwInterval) - thrown);
}

/**
 * Whether a rolling bomb goes off now (CO-182), having rolled `travelled` px of
 * its `range`: always once the range has run out; before that, only once it has
 * rolled `BURST_ARM_DISTANCE` and its burst would catch `BURST_TRIGGER_COUNT`
 * enemies — that many within `radius` of it, the radius counting as in — so a
 * lone runner cannot set it off and a crowd at the player's feet cannot either.
 */
export function shouldBurst(
  at: Readonly<Vec2>,
  enemies: readonly Readonly<Vec2>[],
  travelled: number,
  range: number,
  radius: number,
): boolean {
  if (travelled >= range) return true;
  if (travelled < BURST_ARM_DISTANCE) return false;
  const radiusSq = radius * radius;
  let near = 0;
  for (const enemy of enemies) {
    const dx = enemy.x - at.x;
    const dy = enemy.y - at.y;
    if (dx * dx + dy * dy <= radiusSq) near += 1;
    if (near >= BURST_TRIGGER_COUNT) return true;
  }
  return false;
}

/** What one icicle leaves on the enemy it breaks on (CO-182): the bomb's slow, never a freeze. */
export function icicleFrost(stats: Readonly<{ slowPct: number; slowDuration: number }>): FrostHit {
  return { slowPct: stats.slowPct, slowDuration: stats.slowDuration, freeze: false };
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
