import Phaser from 'phaser';
import type { Rng } from '../core/rng';
import { planSpawns, type Size } from '../core/spawnDirector';
import type { EnemyPool } from './EnemyPool';

/**
 * The spawn director (spec §5): every frame it spends the wave schedule's
 * budget on enemies placed on a ring outside the camera view, and stops in the
 * boss phase. Requests past the live cap come back `null` from the pool and are
 * dropped, never queued.
 *
 * The decisions — how many, which type, where — all live in
 * `core/spawnDirector.ts`; this class only supplies the camera rect, carries the
 * fractional spawn between frames and hands the results to the pool.
 */
export class SpawnDirector {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly pool: EnemyPool;
  private readonly rng: Rng;
  private readonly world: Size;
  private carry = 0;

  constructor(camera: Phaser.Cameras.Scene2D.Camera, pool: EnemyPool, rng: Rng, world: Size) {
    this.camera = camera;
    this.pool = pool;
    this.rng = rng;
    this.world = world;
  }

  /**
   * `elapsedSeconds` is the run clock at the start of the frame, `dtSeconds`
   * its length. Driven from `GameScene.update`, so a paused Game stops spawning.
   */
  update(elapsedSeconds: number, dtSeconds: number): void {
    const view = this.camera.worldView;
    // The camera only fills its world view at the first render; spawning against
    // a zero-size view would put enemies on top of the player.
    if (view.width === 0 || view.height === 0) return;

    const plan = planSpawns({
      t: elapsedSeconds,
      dt: dtSeconds,
      carry: this.carry,
      rng: this.rng,
      view: { width: view.width, height: view.height },
      center: { x: view.centerX, y: view.centerY },
      world: this.world,
    });
    this.carry = plan.carry;
    for (const request of plan.spawns) {
      this.pool.spawn(request.type, request.x, request.y);
    }
  }
}
