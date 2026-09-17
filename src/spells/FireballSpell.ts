import Phaser from 'phaser';
import {
  MAX_LIVE_PROJECTILES,
  explosionDamage,
  splashTargets,
  volleyTargets,
} from '../core/fireball';
import type { Vec2 } from '../core/input';
import { Spell } from '../core/spell';
import type { FireStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';

/**
 * Where spell damage goes. What a hit costs the run — the kill tally, the gem
 * drop — is `GameScene`'s business, so a spell reports the damage it dealt and
 * the scene applies it.
 */
export type DamageSink = (enemy: Enemy, amount: number) => void;

/**
 * Fire (spec §5 "Fire — Fireball"): every `cooldown` s a volley of
 * `projectiles` fireballs leaves the caster, each at its own nearest enemy
 * within `range`. A hit deals `damage` to the enemy struck and lights it with
 * `burn` dps, then explodes: `damage * aoeDamageFactor` and the same burn to
 * every other enemy within `aoeRadius` of it.
 *
 * The rules — targets, splash, explosion damage, burn — live in
 * `core/fireball.ts`; this class owns the projectile pool, registers it with
 * `CollisionSystem` (the one place overlaps are wired, CO-032) and turns an
 * overlap into damage.
 */
export class FireballSpell extends Spell<'fire'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<FireStats>,
    damage: DamageSink,
  ) {
    super('fire', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
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

  /** One volley. With no enemy in range nothing leaves the caster and the cast is spent. */
  protected cast(): void {
    const { projectiles, range, speed } = this.stats;
    const { x, y } = this.caster;
    for (const target of volleyTargets(this.caster, this.enemies.live, projectiles, range)) {
      const shot = this.group.get(x, y) as Projectile | null;
      // Pool exhausted: the rest of the volley is dropped, never queued.
      if (!shot) return;
      shot.fire(x, y, target, speed, range);
    }
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A shot is spent on its first hit; a later overlap the same frame, or one
    // with an enemy something else already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    hitbox.despawn();

    const { damage, aoeRadius, burn } = this.stats;
    // The blast is resolved against the crowd as it stands before the direct
    // hit lands, so a killing blow still explodes at the spot the enemy held.
    const splash = splashTargets(enemy, this.enemies.live, aoeRadius, enemy);
    const blast = explosionDamage(this.stats);

    enemy.applyBurn(burn);
    this.damage(enemy, damage);
    for (const other of splash) {
      other.applyBurn(burn);
      this.damage(other, blast);
    }
  }
}
