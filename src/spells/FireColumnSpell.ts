import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { MAX_LIVE_COLUMNS, columnTarget, tickHitCooldown, tryHit } from '../core/fireColumn';
import { explosionScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import { Spell, anyWithin } from '../core/spell';
import type { FireColumnStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** Fire Column's body — its own placeholder, sized to the spec §9.2 base `radius`. */
const COLUMN_LOOK: ProjectileLook = { texture: 'fx_column' };

/**
 * Fire Column (spec §9.2): every `cooldown` s a wide column travels from the
 * caster toward the nearest enemy within `range`. Unlike a fireball it is not
 * spent on its first hit — every enemy it touches takes `damage` and a
 * `burn`, at most once per `hitCooldown` s of that enemy's own window on this
 * column — and it despawns only once it has flown `range` (`Projectile.spent`,
 * unchanged).
 *
 * The rules — the target, the per-enemy hit window — live in
 * `core/fireColumn.ts`; this class owns the projectile pool, registers it with
 * `CollisionSystem` (the one place overlaps are wired, CO-032) and keeps each
 * live column's own hit windows, since two columns in the air burn the same
 * enemy on separate clocks (unlike Earth's boulders, which share one ring and
 * keep their window on the `Enemy` itself).
 *
 * FX (CO-082): `fire.spawn` flashes at the caster as a column leaves and a
 * small `fire.explode` plays at each hit.
 */
export class FireColumnSpell extends Spell<'fire_column'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Per live column: how long until it may hit each enemy again inside it. */
  private readonly hitWindows = new Map<Projectile, Map<Enemy, number>>();
  /** Test hook (#140): hits this spell has landed, across every column. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<FireColumnStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('fire_column', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.group = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_COLUMNS,
      // Columns fly on Arcade velocity and expire from `tick`, which only runs
      // while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onOverlap(enemy, hitbox));
  }

  /** Columns in the air right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Hits this spell has landed, across every column — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (const windows of this.hitWindows.values()) {
      for (const [enemy, remainingS] of windows)
        windows.set(enemy, tickHitCooldown(remainingS, deltaS));
    }
    for (const child of this.group.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.despawnColumn(child);
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /**
   * One cast: `projectiles` columns toward the nearest enemy within `range`.
   * With nothing in range the cast is spent on nothing, the same rule
   * Fireball's volley follows with an empty crowd.
   */
  protected cast(): void {
    const { projectiles, range, speed, radius } = this.stats;
    const { x, y } = this.caster;
    const target = columnTarget(this.caster, this.enemies.live, range);
    if (!target) return;
    let fired = 0;
    for (let i = 0; i < Math.floor(projectiles); i += 1) {
      const shot = this.group.get(x, y) as Projectile | null;
      // Pool exhausted: the rest of the cast is dropped, never queued.
      if (!shot) break;
      shot.fire(x, y, target, speed, range, COLUMN_LOOK);
      // The placeholder is drawn at the base `radius`; scaling the sprite scales
      // its Arcade body with it, so an area passive widens what the column hits.
      shot.setScale(radius / (PLACEHOLDERS.fx_column.width / 2));
      this.hitWindows.set(shot, new Map());
      fired += 1;
    }
    if (fired > 0) this.fx.burst('fire.spawn', x, y);
  }

  private onOverlap(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const windows = this.hitWindows.get(hitbox);
    if (!windows) return;
    const { hitCooldown, damage, radius, burn, burnDuration } = this.stats;
    const result = tryHit(windows.get(enemy) ?? 0, hitCooldown);
    windows.set(enemy, result.remainingS);
    if (!result.hit) return;

    this.landed += 1;
    this.fx.burst('fire.explode', enemy.x, enemy.y, { scale: explosionScale(radius) * 0.4 });
    enemy.applyBurn(burn, burnDuration);
    this.damage(enemy, damage);
  }

  private despawnColumn(column: Projectile): void {
    this.hitWindows.delete(column);
    column.despawn();
  }
}
