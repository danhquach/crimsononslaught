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
  /** Multiplies the archetype's hp for enemies this wave spawns (#127). 1 is the table in `enemies.ts`. */
  hpMul: number;
  /** Multiplies the archetype's contact damage for enemies this wave spawns (#127). */
  damageMul: number;
}

/** Every regular type, once the tank has joined at 4:00. */
const EVERY_TYPE: readonly EnemyType[] = ['swarm', 'fast', 'tank'];

/**
 * #127: a 20-minute run in two-minute rows. Later rows spawn faster and
 * scale enemy hp and contact damage; the numbers are starting values.
 * Non-empty by construction: `activeWave` always has a wave to fall back on.
 */
export const WAVES: readonly [Wave, ...Wave[]] = [
  { startTime: 0, types: ['swarm'], spawnsPerSecond: 1.5, hpMul: 1, damageMul: 1 },
  { startTime: 120, types: ['swarm', 'fast'], spawnsPerSecond: 2, hpMul: 1.2, damageMul: 1.1 },
  { startTime: 240, types: EVERY_TYPE, spawnsPerSecond: 2.5, hpMul: 1.4, damageMul: 1.2 },
  { startTime: 360, types: EVERY_TYPE, spawnsPerSecond: 3, hpMul: 1.6, damageMul: 1.3 },
  { startTime: 480, types: EVERY_TYPE, spawnsPerSecond: 3.5, hpMul: 1.8, damageMul: 1.4 },
  { startTime: 600, types: EVERY_TYPE, spawnsPerSecond: 4, hpMul: 2, damageMul: 1.5 },
  { startTime: 720, types: EVERY_TYPE, spawnsPerSecond: 4.5, hpMul: 2.2, damageMul: 1.6 },
  { startTime: 840, types: EVERY_TYPE, spawnsPerSecond: 5, hpMul: 2.4, damageMul: 1.7 },
  { startTime: 960, types: EVERY_TYPE, spawnsPerSecond: 5.5, hpMul: 2.6, damageMul: 1.8 },
  { startTime: 1080, types: EVERY_TYPE, spawnsPerSecond: 6, hpMul: 2.8, damageMul: 1.9 },
  { startTime: 1200, types: [], spawnsPerSecond: 0, hpMul: 1, damageMul: 1 },
];

/**
 * The boss spawns at 20:00 (#127) and regular spawning stops. It is the last
 * row of the table above, named here so the run state (CO-030) and the
 * director do not hard-code it.
 */
export const BOSS_START_TIME = 1200;

/** Spec §5: spawns sit on a ring 100 px outside the camera view. */
export const SPAWN_RING_MARGIN = 100;
