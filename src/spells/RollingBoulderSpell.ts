import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { ROLLING_BOULDER_CLIP, ROLLING_BOULDER_TEXTURE } from '../config/earthRoster';
import { dustFlip } from '../core/fx';
import type { Vec2 } from '../core/input';
import { knockbackVector } from '../core/orbitingBoulders';
import { MAX_LIVE_BOULDERS, rollSpent, rollTarget } from '../core/rollingBoulder';
import { Spell, anyWithin } from '../core/spell';
import type { BoulderStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** A thrown boulder's body: the ring's own stone, rolling (see `config/earthRoster.ts`). */
const BOULDER_LOOK: ProjectileLook = {
  texture: ROLLING_BOULDER_TEXTURE,
  clip: ROLLING_BOULDER_CLIP,
};

/**
 * Boulder (#143, Phase 2 spec §9.5): every `cooldown` s a heavy stone is
 * thrown at the nearest enemy within `range` and keeps rolling past it. Each
 * enemy it rolls over is struck once for `damage` and hurled `knockback` px
 * away; the boulder despawns once it has struck `pierce` of them or has flown
 * its `range` (`Projectile.spent`).
 *
 * The rules — the throw's heading, when a boulder is used up — live in
 * `core/rollingBoulder.ts`, and the shove is the ring's `knockbackVector`
 * (`core/orbitingBoulders.ts`), the one every Earth spell pushes with. This
 * class owns the projectile pool, registers it with `CollisionSystem` (the one
 * place overlaps are wired, CO-032) and keeps each live boulder's own set of
 * enemies struck, so a boulder never hits the same enemy twice while it rolls
 * over it and two boulders in the air count their pierce separately.
 *
 * FX (CO-082): `earth.impact` plays at every strike and `earth.dust` kicks up
 * under each survivor, blowing the way it was hurled.
 */
export class RollingBoulderSpell extends Spell<'earth_boulder'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Per live boulder: the enemies it has already struck, and how many that is. */
  private readonly struck = new Map<Projectile, Set<Enemy>>();
  /** Test hook (#143): strikes this spell has landed, across every boulder. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<BoulderStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('earth_boulder', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.group = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_BOULDERS,
      // Boulders roll on Arcade velocity and expire from `tick`, which only
      // runs while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onOverlap(enemy, hitbox));
  }

  /** Boulders rolling right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Strikes this spell has landed, across every boulder — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (const child of this.group.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.despawn(child);
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /**
   * One throw, at the nearest enemy within `range`. With nothing in range the
   * cast is spent on nothing, the same rule Fireball's volley follows with an
   * empty crowd.
   */
  protected cast(): void {
    const { range, speed, radius } = this.stats;
    const { x, y } = this.caster;
    const target = rollTarget(this.caster, this.enemies.live, range);
    if (!target) return;
    // Pool exhausted: the throw is dropped, never queued.
    const boulder = this.group.get(x, y) as Projectile | null;
    if (!boulder) return;
    boulder.fire(x, y, target, speed, range, BOULDER_LOOK);
    // The placeholder is drawn at its own size; scaling the sprite scales its
    // Arcade body with it, so the stone hits exactly as wide as it looks and an
    // area passive widens both.
    boulder.setScale(radius / (PLACEHOLDERS[ROLLING_BOULDER_TEXTURE].width / 2));
    this.struck.set(boulder, new Set());
  }

  private onOverlap(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const hit = this.struck.get(hitbox);
    // Already struck: the boulder is rolling over the same enemy, not through
    // a new one, so it costs neither damage nor pierce.
    if (!hit || hit.has(enemy)) return;
    hit.add(enemy);

    const { damage, knockback, pierce } = this.stats;
    const push = knockbackVector(hitbox, enemy, knockback, this.caster);
    this.landed += 1;
    this.fx.burst('earth.impact', enemy.x, enemy.y);
    this.damage(enemy, damage);
    // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
    if (enemy.active) {
      enemy.knockBack(push);
      // The dust is drawn from its top edge, so it sits at the enemy's feet.
      this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
    }
    if (rollSpent(hit.size, pierce)) this.despawn(hitbox);
  }

  private despawn(boulder: Projectile): void {
    this.struck.delete(boulder);
    boulder.despawn();
  }
}
