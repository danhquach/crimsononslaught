import type { Wave } from '../config/waves';
import { WAVES } from '../config/waves';

/**
 * Wave timing and spawn budgeting (spec §5 "Spawn schedule"), decided without
 * an engine so it is Vitest-covered. `systems/SpawnDirector.ts` (CO-025) is the
 * Phaser side: it calls `spawnBudget` each frame and spawns that many enemies,
 * picking types from `activeWave(t).types`.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Whole spawns are only ever granted in integers, so a wave of 3/s at 1/60 s
 * per frame has to carry the leftover 0.05 forward. Summing sixty such frames
 * lands a hair under the exact second in binary floating point, which would
 * otherwise cost one spawn per second; this tolerance absorbs that drift
 * without ever granting a spawn the schedule did not earn.
 */
const FLOAT_TOLERANCE = 1e-9;

/** The wave that owns time `t`. Times before the run starts read as wave one. */
export function activeWave(t: number): Wave {
  let active = WAVES[0];
  for (const wave of WAVES) {
    if (wave.startTime > t) break;
    active = wave;
  }
  return active;
}

/** Start of the first wave after `t`, or `Infinity` once the last one is live. */
function nextWaveStart(t: number): number {
  for (const wave of WAVES) {
    if (wave.startTime > t) return wave.startTime;
  }
  return Infinity;
}

export interface SpawnBudget {
  /** Whole enemies the director may spawn this frame. */
  spawns: number;
  /** Fraction of a spawn left over; pass it back in as `carry` next frame. */
  carry: number;
}

/**
 * Spawns earned over the frame `[t, t + dt)`, plus any fraction carried in.
 *
 * A frame that straddles a wave boundary is split at that boundary and each
 * slice is paid at its own rate, so the schedule is exact regardless of frame
 * length — in particular no spawn leaks past the boss boundary at 300 s.
 */
export function spawnBudget(t: number, dt: number, carry = 0): SpawnBudget {
  const end = t + dt;
  let total = carry;
  let cursor = t;

  while (cursor < end) {
    const sliceEnd = Math.min(nextWaveStart(cursor), end);
    total += activeWave(cursor).spawnsPerSecond * (sliceEnd - cursor);
    cursor = sliceEnd;
  }

  const spawns = Math.floor(total + FLOAT_TOLERANCE);
  return { spawns, carry: Math.max(0, total - spawns) };
}
