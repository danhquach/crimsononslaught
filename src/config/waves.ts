import type { EnemyType } from './enemies';

/**
 * Spawn schedule (spec §5 "Spawn schedule"). One row per wave; a wave owns the
 * run from its `startTime` until the next wave's `startTime`.
 *
 * Pure data, no Phaser import, so the table is unit-tested against the spec.
 * `core/waveSchedule.ts` turns it into a per-frame spawn budget and the spawn
 * director (CO-025) picks a type out of `types`.
 */
export interface Wave {
  /** Seconds since the run started. Ascending; the first wave starts at 0. */
  startTime: number;
  /** Types the director may spawn. Empty in the boss phase. */
  types: readonly EnemyType[];
  /** Spawns per second granted while this wave is active. */
  spawnsPerSecond: number;
}

/** Non-empty by construction: `activeWave` always has a wave to fall back on. */
export const WAVES: readonly [Wave, ...Wave[]] = [
  { startTime: 0, types: ['swarm'], spawnsPerSecond: 1.5 },
  { startTime: 60, types: ['swarm', 'fast'], spawnsPerSecond: 2.5 },
  { startTime: 120, types: ['swarm', 'fast', 'tank'], spawnsPerSecond: 3.5 },
  { startTime: 180, types: ['swarm', 'fast', 'tank'], spawnsPerSecond: 4.5 },
  { startTime: 240, types: ['swarm', 'fast', 'tank'], spawnsPerSecond: 5 },
  { startTime: 300, types: [], spawnsPerSecond: 0 },
];

/**
 * Spec §5 "Boss": the boss spawns at 5:00 and regular spawning stops. It is the
 * last row of the table above, named here so the run state (CO-030) and the
 * director do not hard-code 300.
 */
export const BOSS_START_TIME = 300;
