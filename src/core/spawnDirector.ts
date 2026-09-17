import type { EnemyType } from '../config/enemies';
import type { Vec2 } from './input';
import type { Rng } from './rng';
import { activeWave, spawnBudget } from './waveSchedule';

/**
 * Where and what the spawn director spawns (spec §5 "Spawn schedule"): it turns
 * a frame's budget from `waveSchedule` into placed enemies, picking types and
 * angles from the run's seeded RNG.
 *
 * `systems/SpawnDirector.ts` is the Phaser side — it reads the camera, keeps the
 * carry between frames and hands each request to the pool. Everything decidable
 * without an engine lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/** Spec §5: spawns sit on a ring 100 px outside the camera view. */
export const SPAWN_RING_MARGIN = 100;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface SpawnRequest {
  readonly type: EnemyType;
  readonly x: number;
  readonly y: number;
}

export interface SpawnPlan {
  readonly spawns: readonly SpawnRequest[];
  /** Fraction of a spawn left over; pass it back in as `carry` next frame. */
  readonly carry: number;
}

/**
 * Radius of the spawn ring: the view's half-diagonal plus the margin, so a point
 * on the ring is outside the view at every angle and not just on the axes.
 */
export function spawnRingRadius(view: Size): number {
  return Math.hypot(view.width, view.height) / 2 + SPAWN_RING_MARGIN;
}

/**
 * Mirror an offset that overshoots the arena back across the centre. |offset| is
 * unchanged, so the folded point is exactly as far outside the view as the
 * original was. An arena narrower than the ring has nowhere off-screen to put a
 * spawn at all; there the fold gives up and leaves the point outside the arena
 * rather than pulling it into view.
 */
function fold(center: number, offset: number, extent: number): number {
  const point = center + offset;
  return point < 0 || point > extent ? center - offset : point;
}

/** Point on the spawn ring around `center` at `angle`, folded inside `world`. */
export function spawnPoint(center: Readonly<Vec2>, view: Size, world: Size, angle: number): Vec2 {
  const radius = spawnRingRadius(view);
  return {
    x: fold(center.x, Math.cos(angle) * radius, world.width),
    y: fold(center.y, Math.sin(angle) * radius, world.height),
  };
}

export interface SpawnPlanInput {
  /** Run clock at the start of the frame, in seconds. */
  t: number;
  /** Frame length in seconds. */
  dt: number;
  /** Leftover fraction of a spawn from the previous frame. */
  carry: number;
  rng: Rng;
  /** Size of the camera's view of the world. */
  view: Size;
  /** Centre of that view. */
  center: Readonly<Vec2>;
  /** Arena size; its top-left corner is the origin. */
  world: Size;
}

/**
 * The spawns earned over one frame, placed. Types come from the wave that owns
 * the end of the frame, so a frame straddling a boundary spawns the crowd the
 * player is about to face. A frame that straddles the boss boundary therefore
 * spawns nothing at all, including the budget it earned before 300 s: spec §5
 * is "no new spawns" from 5:00, and a hitched frame is no licence to drop a
 * crowd on the player as the boss walks in.
 *
 * Two RNG draws per spawn (type, then angle) and none otherwise, so the same
 * seed and the same spawn count always give the same enemies — whatever the
 * frame rate that earned them.
 */
export function planSpawns(input: SpawnPlanInput): SpawnPlan {
  const { t, dt, carry, rng, view, center, world } = input;
  const budget = spawnBudget(t, dt, carry);
  const { types } = activeWave(t + dt);
  // Boss phase (spec §5): no new spawns, and no budget saved up for after it.
  if (types.length === 0) return { spawns: [], carry: 0 };

  const spawns: SpawnRequest[] = [];
  for (let i = 0; i < budget.spawns; i += 1) {
    const type = rng.pick(types);
    const angle = rng.next() * Math.PI * 2;
    const { x, y } = spawnPoint(center, view, world, angle);
    spawns.push({ type, x, y });
  }
  return { spawns, carry: budget.carry };
}
