import Phaser from 'phaser';
import { MAX_LIVE_ENEMIES, type EnemyType } from '../config/enemies';
import { canSpawn, type Vec2 } from '../core/enemy';
import { Enemy } from '../entities/Enemy';

/**
 * The enemy object pool (spec §5): one Arcade group of at most
 * `MAX_LIVE_ENEMIES` reusable `Enemy` sprites. A dead enemy goes back to the
 * pool instead of being destroyed, so a run allocates 300 sprites at worst and
 * none after that.
 *
 * `spawn` returns `null` once the cap is reached — the request is dropped, never
 * queued (spec §5), so the spawn director (CO-025) can ask freely.
 *
 * `group` is the overlap target for collisions (CollisionSystem, CO-032).
 */
export class EnemyPool {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      classType: Enemy,
      // Deliberately redundant with `canSpawn` below: this caps how many sprites
      // the pool may ever allocate, `canSpawn` caps how many may be alive. Both
      // read `MAX_LIVE_ENEMIES`, so dropping either changes the cap's meaning.
      maxSize: MAX_LIVE_ENEMIES,
      // Enemies are updated from `update` below with the player's position,
      // and only while Game runs, so a paused scene freezes them.
      runChildUpdate: false,
    });
  }

  /** Enemies currently alive in the world; pooled-but-dead ones do not count. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Spawn one enemy, or `null` when the live cap is already reached. */
  spawn(type: EnemyType, x: number, y: number): Enemy | null {
    if (!canSpawn(this.liveCount)) return null;
    const enemy = this.group.get(x, y) as Enemy | null;
    if (!enemy) return null;
    enemy.spawn(type, x, y);
    return enemy;
  }

  /** Step every live enemy toward `target`. */
  update(deltaMs: number, target: Readonly<Vec2>): void {
    for (const child of this.group.getChildren()) {
      if (child instanceof Enemy && child.active) child.chase(deltaMs, target);
    }
  }
}
