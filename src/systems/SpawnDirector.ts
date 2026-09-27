import Phaser from 'phaser';
import type { EnemyType } from '../config/enemies';
import { canSpawn } from '../core/enemy';
import { EliteQueue, placeElite } from '../core/elites';
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
 *
 * Elites (#126) are the exception to "dropped, never queued": one due while
 * the pool is full waits here and lands the first frame there is room, placed
 * from its own `eliteRng` then. The queue empties when the boss arrives.
 */
export class SpawnDirector {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly pool: EnemyPool;
  private readonly rng: Rng;
  private readonly world: Size;
  /** `?enemies=` (#126): the only types let in; empty lets every type in. */
  private readonly only: ReadonlySet<EnemyType>;
  private readonly eliteRng: Rng;
  private carry = 0;
  /** #126: elites due but not yet placed. */
  private readonly elites = new EliteQueue();
  /** #126: elites placed this run, and the run time in seconds the first landed at. */
  private elitesSpawned = 0;
  private firstEliteAt: number | null = null;

  constructor(
    camera: Phaser.Cameras.Scene2D.Camera,
    pool: EnemyPool,
    rng: Rng,
    /** #126: the run's elites stream, never `rng` itself, so elites cannot move the crowd. */
    eliteRng: Rng,
    world: Size,
    only: readonly EnemyType[] = [],
  ) {
    this.camera = camera;
    this.pool = pool;
    this.rng = rng;
    this.world = world;
    this.only = new Set(only);
    this.eliteRng = eliteRng;
  }

  /**
   * #126: elites placed so far, those due but waiting for room, and the run
   * time the first landed at (the end of its step), `null` before one has.
   */
  get eliteCounts(): { spawned: number; waiting: number; firstAt: number | null } {
    return { spawned: this.elitesSpawned, waiting: this.elites.length, firstAt: this.firstEliteAt };
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
      // Dropped after the plan drew it, so the filter never shifts the RNG.
      if (this.only.size > 0 && !this.only.has(request.type)) continue;
      this.pool.spawn(request.type, request.x, request.y, request.scale);
    }
    this.releaseElites(elapsedSeconds, dtSeconds, view);
  }

  /**
   * #126: queue the elites falling due this frame and place as many as the
   * pool has room for. The crowd spawns first, so at the cap it is an elite
   * left waiting, never a crowd enemy it displaced. The angle is drawn only
   * once there is room, so a wait never spends a draw.
   */
  private releaseElites(t: number, dt: number, view: Phaser.Geom.Rectangle): void {
    this.elites.step(t, dt, this.only, (due) => {
      if (!canSpawn(this.pool.liveCount)) return false;
      const { x, y } = placeElite(
        this.eliteRng,
        { x: view.centerX, y: view.centerY },
        { width: view.width, height: view.height },
        this.world,
      );
      // Refused anyway, it stays queued and is tried again next frame.
      if (!this.pool.spawn(due.type, x, y, due.scale, true)) return false;
      this.elitesSpawned += 1;
      this.firstEliteAt ??= t + dt;
      return true;
    });
  }
}
