import { ELITE, type EnemyType } from '../config/enemies';
import { ELITE_SCHEDULE, type EliteEntry } from '../config/waves';
import type { WaveScale } from './enemy';
import { gemDropCount } from './gems';
import type { Vec2 } from './input';
import type { Rng } from './rng';
import { spawnPoint, type Size } from './spawnDirector';
import { activeWave } from './waveSchedule';

/**
 * Elite rules that do not need an engine (#126): when one is due, how much
 * tougher it is than its crowd, where it lands and what it drops.
 *
 * `systems/SpawnDirector.ts` is the Phaser side: it steps an `EliteQueue`
 * and places an elite only when the pool has room, so one due at the live
 * cap waits rather than vanishing. Placing draws from the run's
 * elites stream (`createRng(deriveSeed(seed, 'elites'))`), never the run
 * RNG, so elites cannot move an existing seed's crowd or level-up offers.
 *
 * Pure TS, no Phaser import. The tunables live in `config/enemies.ts` and
 * `config/waves.ts`.
 */

/** An elite that has fallen due: its type and the multipliers of the wave it lands in. */
export interface DueElite {
  readonly type: EnemyType;
  readonly scale: WaveScale;
}

/**
 * The elites due over the frame `(t, t + dt]`, in schedule order. Each entry
 * lands in exactly one frame whatever the frame rate, and a run that starts
 * late (`?startAt=`) skips those already past. None in the boss phase: an
 * entry due there has no crowd to join. No RNG.
 */
export function dueElites(
  t: number,
  dt: number,
  schedule: readonly EliteEntry[] = ELITE_SCHEDULE,
): DueElite[] {
  const due: DueElite[] = [];
  for (const { at, type } of schedule) {
    if (!(at > t && at <= t + dt)) continue;
    const wave = activeWave(at);
    if (wave.types.length === 0) continue;
    due.push({ type, scale: { hpMul: wave.hpMul, damageMul: wave.damageMul } });
  }
  return due;
}

/** The multipliers an elite spawns with: its wave's, times `ELITE`'s. */
export function eliteScale(wave: Readonly<WaveScale>): WaveScale {
  return { hpMul: wave.hpMul * ELITE.hpMul, damageMul: wave.damageMul * ELITE.damageMul };
}

/** Gems an elite of `type` drops: its type's own, `ELITE.gemMul` times over. */
export function eliteGemCount(type: EnemyType): number {
  return gemDropCount(type) * ELITE.gemMul;
}

/**
 * Where an elite lands: on the spawn ring, like the crowd, at an angle from
 * one draw on `rng`. Exactly one draw per elite placed.
 */
export function placeElite(rng: Rng, center: Readonly<Vec2>, view: Size, world: Size): Vec2 {
  return spawnPoint(center, view, world, rng.next() * Math.PI * 2);
}

/**
 * The elites due but not yet placed (#126). Every other spawn past the live
 * cap is dropped; an elite waits here instead, since the schedule promises
 * it. Emptied when the boss arrives, which fields nothing new.
 */
export class EliteQueue {
  private readonly waiting: DueElite[] = [];

  /** Elites waiting for room. */
  get length(): number {
    return this.waiting.length;
  }

  /**
   * One frame `(t, t + dt]`: queue the elites falling due — those `only` lets
   * in, when it lists any — then hand the oldest to `trySpawn` until it
   * refuses (no room) or none are left. Returns how many were placed.
   */
  step(
    t: number,
    dt: number,
    only: ReadonlySet<EnemyType>,
    trySpawn: (due: DueElite) => boolean,
    schedule: readonly EliteEntry[] = ELITE_SCHEDULE,
  ): number {
    if (activeWave(t + dt).types.length === 0) {
      this.waiting.length = 0;
      return 0;
    }
    for (const due of dueElites(t, dt, schedule)) {
      if (only.size === 0 || only.has(due.type)) this.waiting.push(due);
    }
    let placed = 0;
    while (this.waiting.length > 0 && trySpawn(this.waiting[0] as DueElite)) {
      this.waiting.shift();
      placed += 1;
    }
    return placed;
  }
}
