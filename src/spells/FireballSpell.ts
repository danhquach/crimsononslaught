import Phaser from 'phaser';
import {
  MAX_LIVE_PROJECTILES,
  explosionDamage,
  splashTargets,
  volleyTargets,
} from '../core/fireball';
import { explosionScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import { Spell, anyWithin } from '../core/spell';
import type { FireStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/**
 * Fire Bolt (spec §9.2): every `cooldown` s a volley of `projectiles` bolts
 * leaves the caster, each at its own nearest enemy within `range`. A hit deals
 * `damage` to the enemy struck, then explodes: `damage * aoeDamageFactor` to
 * every other enemy within `aoeRadius` of it. Burn is Fire Wave's identity
 * now (spec §9.2), not Fire Bolt's.
 *
 * The rules — targets, splash, explosion damage, burn — live in
 * `core/fireball.ts`; this class owns the projectile pool, registers it with
 * `CollisionSystem` (the one place overlaps are wired, CO-032) and turns an
 * overlap into damage.
 *
 * FX (CO-082): `fire.spawn` flashes at the caster as a volley leaves and
 * `fire.explode` plays at the hit point, scaled to the live `aoeRadius`. The
 * flame on a burning enemy is the overlay pool's, driven from its status.
 */
export class FireballSpell extends Spell<'fire'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<FireStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('fire', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.group = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_PROJECTILES,
      // Projectiles fly on Arcade velocity and expire from `tick`, which only
      // runs while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onHit(enemy, hitbox));
  }

  /** Fireballs in the air right now. */
  get liveCount(): number {
    return this.group.countActive(true);
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
    let fired = 0;
    for (const target of volleyTargets(this.caster, this.enemies.live, projectiles, range)) {
      const shot = this.group.get(x, y) as Projectile | null;
      // Pool exhausted: the rest of the volley is dropped, never queued.
      if (!shot) break;
      shot.fire(x, y, target, speed, range);
      fired += 1;
    }
    // One flash per volley, not per shot: three fireballs leave one hand.
    if (fired > 0) this.fx.burst('fire.spawn', x, y);
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A shot is spent on its first hit; a later overlap the same frame, or one
    // with an enemy something else already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    hitbox.despawn();

    const { damage, aoeRadius } = this.stats;
    // The blast is resolved against the crowd as it stands before the direct
    // hit lands, so a killing blow still explodes at the spot the enemy held.
    const splash = splashTargets(enemy, this.enemies.live, aoeRadius, enemy);
    const blast = explosionDamage(this.stats);
    this.fx.burst('fire.explode', enemy.x, enemy.y, { scale: explosionScale(aoeRadius) });

    this.damage(enemy, damage);
    for (const other of splash) {
      this.damage(other, blast);
    }
  }
}
