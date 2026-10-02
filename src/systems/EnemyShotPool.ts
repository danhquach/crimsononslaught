import Phaser from 'phaser';
import { MAX_LIVE_ENEMY_SHOTS, RANGED_ATTACK } from '../config/enemies';
import type { Vec2 } from '../core/input';
import { EnemyShot } from '../entities/EnemyShot';
import type { ProjectileLook } from '../entities/Projectile';

/**
 * The pink glob drawn flying right (CO-104), turned to its heading; with no
 * atlas, the magenta placeholder ring. Either way it is a colour and a shape no
 * player shot wears, so the player can tell at a glance what to dodge.
 */
const ENEMY_SHOT: ProjectileLook = { texture: 'proj_enemy', clip: 'ranged.shot' };

/** How a pool of enemy-side shots flies and is drawn; the default is the ranged enemy's. */
export interface EnemyShotPoolOptions {
  readonly look: ProjectileLook;
  readonly maxSize: number;
  /** Flight speed, px/s. */
  readonly speed: number;
  /** Distance after which a shot is spent, px. */
  readonly range: number;
}

const RANGED_POOL: EnemyShotPoolOptions = {
  look: ENEMY_SHOT,
  maxSize: MAX_LIVE_ENEMY_SHOTS,
  speed: RANGED_ATTACK.shotSpeed,
  range: RANGED_ATTACK.shotRange,
};

/**
 * Every enemy shot in the air (#126): one Arcade group of at most
 * `MAX_LIVE_ENEMY_SHOTS` pooled `EnemyShot`s. A shot asked for at the cap is
 * dropped, not queued, like an enemy past its cap.
 *
 * Shots fly straight at where the player stood and are spent at their range.
 * `group` is the overlap target for the player (CollisionSystem, CO-032); what
 * a hit costs is the run's (`GameScene.hurtPlayer`).
 */
export class EnemyShotPool {
  readonly group: Phaser.Physics.Arcade.Group;
  /** CO-223: told of each shot that flew its range, before it is put back; the boss's bolts fade there. */
  onSpent?: (shot: EnemyShot) => void;
  private readonly options: EnemyShotPoolOptions;

  constructor(scene: Phaser.Scene, options: Partial<EnemyShotPoolOptions> = {}) {
    this.options = { ...RANGED_POOL, ...options };
    this.group = scene.physics.add.group({
      classType: EnemyShot,
      maxSize: this.options.maxSize,
      // They fly on Arcade velocity and expire from `update`, which only runs
      // while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
  }

  /** Shots in the air right now; never past the pool's cap. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Fire one shot from `from` at where `target` stands, or drop it at the cap. */
  fire(from: Readonly<Vec2>, target: Readonly<Vec2>, damage: number): EnemyShot | null {
    const shot = this.group.get(from.x, from.y) as EnemyShot | null;
    if (!shot) return null;
    return this.launch(shot, from, target, damage);
  }

  /** CO-223: fire one shot from `from` along the unit vector `dir`, or drop it at the cap. */
  fireDir(from: Readonly<Vec2>, dir: Readonly<Vec2>, damage: number): EnemyShot | null {
    const shot = this.group.get(from.x, from.y) as EnemyShot | null;
    if (!shot) return null;
    return this.launch(shot, from, { x: from.x + dir.x * 100, y: from.y + dir.y * 100 }, damage);
  }

  private launch(
    shot: EnemyShot,
    from: Readonly<Vec2>,
    target: Readonly<Vec2>,
    damage: number,
  ): EnemyShot {
    const { speed, range, look } = this.options;
    shot.fire(from.x, from.y, target, speed, range, look);
    shot.damage = damage;
    return shot;
  }

  /** Put back every shot that has flown its range. Once a step, before the physics step. */
  update(): void {
    for (const child of this.group.getChildren()) {
      if (!(child instanceof EnemyShot) || !child.active || !child.spent) continue;
      this.onSpent?.(child);
      child.despawn();
    }
  }
}
