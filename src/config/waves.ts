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

/** The three melee types, once the tank has joined at 4:00. */
const MELEE: readonly EnemyType[] = ['swarm', 'fast', 'tank'];

/**
 * #126: ranged enemies join at 6:00. A new type only ever joins a mid-run row,
 * so the early rows — and the crowd a seed draws in them — are unchanged.
 */
const WITH_RANGED: readonly EnemyType[] = [...MELEE, 'ranged'];

/** #126: exploders join at 8:00, splitters at 10:00. Splitlings only ever come from a splitter. */
const WITH_EXPLODER: readonly EnemyType[] = [...WITH_RANGED, 'exploder'];
const WITH_SPLITTER: readonly EnemyType[] = [...WITH_EXPLODER, 'splitter'];
/** #126: shielded enemies join at 12:00. */
const WITH_SHIELDED: readonly EnemyType[] = [...WITH_SPLITTER, 'shielded'];

/**
 * #127: a 20-minute run in two-minute rows. Later rows spawn faster and
 * scale enemy hp and contact damage; the numbers are starting values.
 * Non-empty by construction: `activeWave` always has a wave to fall back on.
 */
export const WAVES: readonly [Wave, ...Wave[]] = [
  { startTime: 0, types: ['swarm'], spawnsPerSecond: 1.5, hpMul: 1, damageMul: 1 },
  { startTime: 120, types: ['swarm', 'fast'], spawnsPerSecond: 2, hpMul: 1.2, damageMul: 1.1 },
  { startTime: 240, types: MELEE, spawnsPerSecond: 2.5, hpMul: 1.4, damageMul: 1.2 },
  { startTime: 360, types: WITH_RANGED, spawnsPerSecond: 3, hpMul: 1.6, damageMul: 1.3 },
  { startTime: 480, types: WITH_EXPLODER, spawnsPerSecond: 3.5, hpMul: 1.8, damageMul: 1.4 },
  { startTime: 600, types: WITH_SPLITTER, spawnsPerSecond: 4, hpMul: 2, damageMul: 1.5 },
  { startTime: 720, types: WITH_SHIELDED, spawnsPerSecond: 4.5, hpMul: 2.2, damageMul: 1.6 },
  { startTime: 840, types: WITH_SHIELDED, spawnsPerSecond: 5, hpMul: 2.4, damageMul: 1.7 },
  { startTime: 960, types: WITH_SHIELDED, spawnsPerSecond: 5.5, hpMul: 2.6, damageMul: 1.8 },
  { startTime: 1080, types: WITH_SHIELDED, spawnsPerSecond: 6, hpMul: 2.8, damageMul: 1.9 },
  { startTime: 1200, types: [], spawnsPerSecond: 0, hpMul: 1, damageMul: 1 },
];

/** One elite (#126): the run time it is due at, in seconds, and its type. */
export interface EliteEntry {
  at: number;
  type: EnemyType;
}

/**
 * #126: when each elite enters the run, and as what. Kept apart from `WAVES`
 * so the wave rows keep their shape. Ascending, before the boss, and each
 * type is already in the crowd of the row the elite lands in, so an elite is
 * a champion of something the player has met.
 */
export const ELITE_SCHEDULE: readonly EliteEntry[] = [
  { at: 150, type: 'fast' },
  { at: 300, type: 'tank' },
  { at: 420, type: 'ranged' },
  { at: 540, type: 'exploder' },
  { at: 660, type: 'splitter' },
  { at: 780, type: 'shielded' },
  { at: 900, type: 'tank' },
  { at: 1020, type: 'ranged' },
  { at: 1140, type: 'shielded' },
];

/**
 * The boss spawns at 20:00 (#127) and regular spawning stops. It is the last
 * row of the table above, named here so the run state (CO-030) and the
 * director do not hard-code it.
 */
export const BOSS_START_TIME = 1200;

/** Spec §5: spawns sit on a ring 100 px outside the camera view. */
export const SPAWN_RING_MARGIN = 100;
