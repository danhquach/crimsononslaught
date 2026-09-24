import Phaser from 'phaser';
import { volleyTargets } from '../core/fireball';
import { MAX_LIVE_ARROWS, arrowFrost } from '../core/iceArrow';
import type { Vec2 } from '../core/input';
import { Spell, anyWithin } from '../core/spell';
import type { IceStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** The arrow's look: the ice placeholder, flying still — its flight art is #145's. */
const ARROW_LOOK: ProjectileLook = { texture: 'proj_ice' };

/**
 * Ice Arrow (#141, Phase 2 spec §9.3), the element's default: every
 * `cooldown` s a volley of `projectiles` arrows leaves the caster, each at its
 * own nearest enemy within `range`. A hit deals `damage` to the enemy struck
 * and slows it by `slowPct` for `slowDuration` s. No blast, no freeze: those
 * are Frost Nova Bomb's, and a plain arrow is what lets this one fire faster
 * than Fire Bolt.
 *
 * The volley is Fire Bolt's (`core/fireball.ts`'s `volleyTargets`) and the hit
 * is `core/iceArrow.ts`'s; this class owns the projectile pool, registers it
 * with `CollisionSystem` (the one place overlaps are wired, CO-032) and turns
 * an overlap into damage and frost.
 *
 * FX (CO-082): `ice.shatter` bursts where an arrow lands. The frost on a slowed
 * enemy is the overlay pool's, driven from its status.
 */
export class IceArrowSpell extends Spell<'ice'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Test hook (#141): hits this spell has landed, across every arrow. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<IceStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('ice', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.group = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_ARROWS,
      // Arrows fly on Arcade velocity and expire from `tick`, which only runs
      // while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onHit(enemy, hitbox));
  }

  /** Arrows in the air right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Hits this spell has landed — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (const child of this.group.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) child.despawn();
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /** One volley. With no enemy in range nothing leaves the caster and the cast is spent. */
  protected cast(): void {
    const { projectiles, range, speed } = this.stats;
    const { x, y } = this.caster;
    for (const target of volleyTargets(this.caster, this.enemies.live, projectiles, range)) {
      const shot = this.group.get(x, y) as Projectile | null;
      // Pool exhausted: the rest of the volley is dropped, never queued.
      if (!shot) break;
      shot.fire(x, y, target, speed, range, ARROW_LOOK);
    }
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // An arrow is spent on its first hit; a later overlap the same frame, or
    // one with an enemy something else already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    hitbox.despawn();
    this.landed += 1;
    this.fx.burst('ice.shatter', enemy.x, enemy.y);
    // Status before damage, the convention every Ice hit keeps: a killing
    // arrow has still chilled the enemy while it was there to take it.
    enemy.applyFrost(arrowFrost(this.stats));
    this.damage(enemy, this.stats.damage);
  }
}
