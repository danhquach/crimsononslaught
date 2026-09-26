import Phaser from 'phaser';
import { DRAGON_DRAW_SCALE } from '../config/fireRoster';
import { splashTargets } from '../core/fireball';
import { explosionScale } from '../core/fx';
import { MAX_LIVE_DRAGONS } from '../core/homing';
import type { Vec2 } from '../core/input';
import { Spell, anyWithin, nearestEnemies } from '../core/spell';
import type { FireDragonStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { HomingProjectile } from '../entities/HomingProjectile';
import type { ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** Fire Dragon's shot flies as its own dragon (CO-162), drawn at half size over Fire's 6 px body. */
const DRAGON_LOOK: ProjectileLook = {
  texture: 'proj_fire',
  clip: 'fire.dragon',
  scale: DRAGON_DRAW_SCALE,
};

/** One dragon in flight, as the browser suite reads it. */
export interface DragonShot {
  readonly clip: string | null;
  readonly bodyRadius: number;
  readonly rotation: number;
  readonly flipY: boolean;
  readonly vx: number;
  readonly vy: number;
}

/**
 * Fire Dragon (#137, spec §9.2): every `cooldown` s a homing missile leaves the
 * caster at the nearest enemy within `targetRange`, bending toward its target
 * by at most `homingTurnRate` per second (`core/homing.ts`) and expiring after
 * `duration` s of flight. On a hit it deals `damage` to the enemy struck and
 * `damage * aoeDamageFactor` to everything else within `aoeRadius` — reusing
 * Fireball's own `splashTargets` (spec §9.2's splash is the same shape, just a
 * single big hit instead of a volley).
 *
 * `entities/HomingProjectile.ts` is the Phaser side of the steering itself;
 * this class owns the pool, registers it with `CollisionSystem` (the one place
 * overlaps are wired, CO-032) and turns an overlap into damage. With nothing in
 * `targetRange` the cast is spent on nothing, like Meteor's.
 *
 * FX (CO-082): `fire.spawn` flashes at the caster as a dragon leaves and
 * `fire.explode` plays at the hit point, scaled to the live `aoeRadius`.
 */
export class FireDragonSpell extends Spell<'fire_dragon'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Test hook (#140): hits this spell has landed on a direct target. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<FireDragonStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('fire_dragon', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.group = scene.physics.add.group({
      classType: HomingProjectile,
      maxSize: MAX_LIVE_DRAGONS,
      // Dragons steer and expire from `tick`, which only runs while Game does,
      // so a paused scene holds them where they are.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onHit(enemy, hitbox));
  }

  /** Dragons in the air right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Direct hits this spell has landed — what the browser suite watches it fight with. */
  get hits(): number {
    return this.landed;
  }

  /**
   * Test hook (CO-162): how each dragon in the air is drawn right now — its
   * clip, hit radius, rotation and flip beside the velocity it is flying along.
   */
  get shots(): DragonShot[] {
    const shots: DragonShot[] = [];
    for (const child of this.group.getChildren()) {
      if (!(child instanceof HomingProjectile) || !child.active) continue;
      const body = child.body as Phaser.Physics.Arcade.Body;
      shots.push({
        clip: child.anims.currentAnim?.key ?? null,
        bodyRadius: body.halfWidth,
        rotation: child.rotation,
        flipY: child.flipY,
        vx: body.velocity.x,
        vy: body.velocity.y,
      });
    }
    return shots;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (const child of this.group.getChildren()) {
      if (!(child instanceof HomingProjectile) || !child.active) continue;
      child.steer(deltaS, this.enemies.live);
      if (child.spent) child.despawn();
    }
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /** One cast: a dragon at the nearest enemy within `targetRange`. */
  protected cast(): void {
    const { speed, targetRange, homingTurnRate, duration } = this.stats;
    const { x, y } = this.caster;
    const [target] = nearestEnemies(this.caster, this.enemies.live, 1, targetRange);
    if (!target) return;
    // Pool exhausted: the cast is dropped, never queued.
    const shot = this.group.get(x, y) as HomingProjectile | null;
    if (!shot) return;
    shot.fireAt(x, y, target, speed, homingTurnRate, duration, targetRange, DRAGON_LOOK);
    this.fx.burst('fire.spawn', x, y);
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A shot is spent on its first hit; a later overlap the same frame, or one
    // with an enemy something else already killed, flies on.
    if (!(hitbox instanceof HomingProjectile) || !hitbox.active || !enemy.active) return;
    hitbox.despawn();

    const { damage, aoeRadius, aoeDamageFactor } = this.stats;
    const splash = splashTargets(enemy, this.enemies.live, aoeRadius, enemy);
    const blast = damage * aoeDamageFactor;
    this.landed += 1;
    this.fx.burst('fire.explode', enemy.x, enemy.y, { scale: explosionScale(aoeRadius) });
    this.damage(enemy, damage);
    for (const other of splash) this.damage(other, blast);
  }
}
