import { describe, expect, it } from 'vitest';
import { BOSS_START_TIME } from '../config/waves';
import { createRng } from './rng';
import {
  SPAWN_RING_MARGIN,
  planSpawns,
  spawnPoint,
  spawnRingRadius,
  type SpawnRequest,
  type Size,
} from './spawnDirector';

const VIEW: Size = { width: 1280, height: 720 };
const WORLD: Size = { width: 3000, height: 3000 };
const CENTER = { x: 1500, y: 1500 };

/** Runs `frames` frames of `dt` seconds from t=0 and collects every spawn. */
function runFrames(seed: number, dt: number, frames: number, center = CENTER): SpawnRequest[] {
  const rng = createRng(seed);
  const spawns: SpawnRequest[] = [];
  let carry = 0;
  for (let i = 0; i < frames; i += 1) {
    const plan = planSpawns({ t: i * dt, dt, carry, rng, view: VIEW, center, world: WORLD });
    spawns.push(...plan.spawns);
    carry = plan.carry;
  }
  return spawns;
}

describe('spawnRingRadius', () => {
  it('clears the view corner by the margin', () => {
    expect(spawnRingRadius(VIEW)).toBeCloseTo(Math.hypot(1280, 720) / 2 + SPAWN_RING_MARGIN);
  });
});

describe('spawnPoint', () => {
  it('places the point on the ring around the view centre', () => {
    const point = spawnPoint(CENTER, VIEW, WORLD, 0);
    expect(point).toEqual({ x: CENTER.x + spawnRingRadius(VIEW), y: CENTER.y });
  });

  it('folds a point that overshoots the arena back inside it', () => {
    const corner = { x: VIEW.width / 2, y: VIEW.height / 2 };
    // Straight left of a camera pinned to the arena's top-left corner: the ring
    // reaches past x=0, so the point is mirrored to the other side.
    const point = spawnPoint(corner, VIEW, WORLD, Math.PI);
    expect(point.x).toBeCloseTo(corner.x + spawnRingRadius(VIEW));
    expect(point.x).toBeLessThan(WORLD.width);
  });
});

describe('planSpawns', () => {
  it('spends the wave budget: 10 s of wave one at 2/s is 20 spawns', () => {
    expect(runFrames(1, 1 / 60, 600)).toHaveLength(20);
  });

  it('is identical across two runs of the same seed (CO-025 AC)', () => {
    expect(runFrames(1, 1 / 60, 600)).toEqual(runFrames(1, 1 / 60, 600));
  });

  it('spawns the same enemies whatever the frame rate earned them', () => {
    expect(runFrames(1, 1 / 60, 600)).toEqual(runFrames(1, 1 / 10, 100));
  });

  it('gives a different seed a different sequence', () => {
    expect(runFrames(2, 1 / 60, 600)).not.toEqual(runFrames(1, 1 / 60, 600));
  });

  it('never places a spawn inside the camera view (CO-025 AC)', () => {
    const halfW = VIEW.width / 2;
    const halfH = VIEW.height / 2;
    for (const center of [CENTER, { x: halfW, y: halfH }, { x: 3000 - halfW, y: 3000 - halfH }]) {
      const spawns = runFrames(1, 1 / 60, 600, center);
      expect(spawns).not.toHaveLength(0);
      for (const { x, y } of spawns) {
        const offscreen = Math.abs(x - center.x) > halfW || Math.abs(y - center.y) > halfH;
        expect(offscreen).toBe(true);
      }
    }
  });

  it('keeps every spawn inside the arena', () => {
    const spawns = runFrames(1, 1 / 60, 600, { x: VIEW.width / 2, y: VIEW.height / 2 });
    for (const { x, y } of spawns) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(WORLD.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(WORLD.height);
    }
  });

  it('only spawns types the active wave allows', () => {
    const rng = createRng(1);
    const plan = planSpawns({
      t: 0,
      dt: 10,
      carry: 0,
      rng,
      view: VIEW,
      center: CENTER,
      world: WORLD,
    });
    expect(plan.spawns).toHaveLength(20);
    for (const { type } of plan.spawns) expect(type).toBe('swarm');
  });

  it('stops in the boss phase and keeps no carry', () => {
    const rng = createRng(1);
    const plan = planSpawns({
      t: BOSS_START_TIME,
      dt: 1,
      carry: 0.9,
      rng,
      view: VIEW,
      center: CENTER,
      world: WORLD,
    });
    expect(plan).toEqual({ spawns: [], carry: 0 });
  });

  it('spawns nothing on a frame that straddles the boss boundary', () => {
    const rng = createRng(1);
    const plan = planSpawns({
      t: BOSS_START_TIME - 0.5,
      dt: 1,
      carry: 0,
      rng,
      view: VIEW,
      center: CENTER,
      world: WORLD,
    });
    expect(plan).toEqual({ spawns: [], carry: 0 });
  });

  it('spawns the incoming wave on a frame that straddles an ordinary boundary', () => {
    const rng = createRng(1);
    // Wave two (from 60 s) adds 'fast'; wave one before it is 'swarm' only.
    const plan = planSpawns({
      t: 59.5,
      dt: 1,
      carry: 0,
      rng,
      view: VIEW,
      center: CENTER,
      world: WORLD,
    });
    expect(plan.spawns.length).toBeGreaterThan(0);
    for (const { type } of plan.spawns) expect(['swarm', 'fast']).toContain(type);
  });

  it('carries a fraction of a spawn into the next frame', () => {
    const rng = createRng(1);
    const plan = planSpawns({
      t: 0,
      dt: 0.25,
      carry: 0,
      rng,
      view: VIEW,
      center: CENTER,
      world: WORLD,
    });
    expect(plan.spawns).toHaveLength(0);
    expect(plan.carry).toBeCloseTo(0.5);
  });
});
