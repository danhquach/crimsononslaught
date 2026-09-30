import Phaser from 'phaser';
import { EMBER, MAX_LIVE_EMBERS } from '../config/fireLevels';
import { emberDamage, emberLaunches, hasEmberSplit, recordCapped } from '../core/fireLevels';
import {
  MAX_LIVE_PROJECTILES,
  explosionDamage,
  splashTargets,
  volleyTargets,
} from '../core/fireball';
import { explosionScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import type { SpellLevel } from '../config/spellLevels';
import { Spell, anyWithin } from '../core/spell';
import type { FireStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
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
 * Levels (#327): level 2's second bolt is a stat add (`projectiles`), which
 * `volleyTargets` already sends at the two nearest. Level 3, Ember split: a bolt
 * that left the caster at that level throws `EMBER.count` half-size fire balls
 * from its blast, out of a pool of their own. An ember hits once for a fraction
 * of the bolt, ignores the enemy it burst from and never splits again.
 *
 * FX (CO-082): `fire.spawn` flashes at the caster as a volley leaves and
 * `fire.explode` plays at the hit point, scaled to the live `aoeRadius`. The
 * flame on a burning enemy is the overlay pool's, driven from its status.
 */
/** Fire Bolt's level record, what the test hook reads (#327): cause and effect in one entry. */
export interface FireBoltLevelReport {
  volleys: { level: SpellLevel; shots: number; distinctTargets: number }[];
  explosions: { level: SpellLevel; embers: number }[];
  liveEmbers: number;
  emberHits: number;
  embersDropped: number;
  emberViews: { clip: string | null; scale: number }[];
}

/** Embers are half-size bolts on the same clip, so they add no art. */
const EMBER_LOOK: ProjectileLook = {
  texture: 'proj_fire',
  clip: 'fire.ball',
  scale: EMBER.drawScale,
};

export class FireballSpell extends Spell<'fire'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly embers: Phaser.Physics.Arcade.Group;
  /** Bolts launched at level 3: the level is taken at the launch, not the hit. */
  private readonly splitters = new Set<Projectile>();
  /** The enemy each ember burst from, which it flies past. */
  private readonly emberSource = new Map<Projectile, Enemy>();
  private readonly volleys: FireBoltLevelReport['volleys'] = [];
  private readonly explosions: FireBoltLevelReport['explosions'] = [];
  private emberHitCount = 0;
  private emberDropCount = 0;
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
    this.embers = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_EMBERS,
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.embers, (enemy, hitbox) => this.onEmberHit(enemy, hitbox));
  }

  /** Test hook (#327): the volleys and blasts this spell has made, and its embers. */
  get levelReport(): FireBoltLevelReport {
    const live = this.embers
      .getChildren()
      .filter((child): child is Projectile => child instanceof Projectile && child.active);
    return {
      volleys: [...this.volleys],
      explosions: [...this.explosions],
      liveEmbers: live.length,
      emberHits: this.emberHitCount,
      embersDropped: this.emberDropCount,
      emberViews: live.map((ember) => ({
        clip: ember.anims.currentAnim?.key ?? null,
        scale: ember.scaleX,
      })),
    };
  }

  /** Fireballs in the air right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (const child of this.group.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.retire(child);
    }
    for (const child of this.embers.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.retireEmber(child);
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
    const targets = volleyTargets(this.caster, this.enemies.live, projectiles, range);
    for (const target of targets) {
      const shot = this.group.get(x, y) as Projectile | null;
      // Pool exhausted: the rest of the volley is dropped, never queued.
      if (!shot) break;
      shot.fire(x, y, target, speed, range);
      if (hasEmberSplit(this.level)) this.splitters.add(shot);
      else this.splitters.delete(shot);
      fired += 1;
    }
    if (fired > 0) {
      recordCapped(this.volleys, {
        level: this.level,
        shots: fired,
        distinctTargets: new Set(targets.slice(0, fired)).size,
      });
    }
    // One flash per volley, not per shot: three fireballs leave one hand.
    if (fired > 0) this.fx.burst('fire.spawn', x, y);
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A shot is spent on its first hit; a later overlap the same frame, or one
    // with an enemy something else already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const from = { x: hitbox.x, y: hitbox.y };
    // Read before `despawn` zeroes the velocity: the embers fan out from it.
    const { x: vx, y: vy } = (hitbox.body as Phaser.Physics.Arcade.Body).velocity;
    const splits = this.splitters.has(hitbox);
    this.retire(hitbox);

    const { damage, aoeRadius } = this.stats;
    // The blast is resolved against the crowd as it stands before the direct
    // hit lands, so a killing blow still explodes at the spot the enemy held.
    const splash = splashTargets(enemy, this.enemies.live, aoeRadius, enemy);
    const blast = explosionDamage(this.stats);
    this.fx.burst('fire.explode', enemy.x, enemy.y, { scale: explosionScale(aoeRadius) });

    // The blast spreads from where the shot struck.
    const centre = { x: enemy.x, y: enemy.y };
    this.damage(enemy, damage, 'hit', from);
    for (const other of splash) {
      this.damage(other, blast, 'hit', centre);
    }

    if (splits) this.throwEmbers(centre, Math.atan2(vy, vx), enemy);
  }

  /** Ember split (level 3): `EMBER.count` embers leave the blast, dropped when the pool is out. */
  private throwEmbers(centre: Readonly<Vec2>, heading: number, source: Enemy): void {
    let thrown = 0;
    for (const { to } of emberLaunches(centre, heading, EMBER.count, EMBER.range)) {
      const ember = this.embers.get(centre.x, centre.y) as Projectile | null;
      // Pool exhausted: the ember is dropped, never queued.
      if (!ember) {
        this.emberDropCount += 1;
        continue;
      }
      ember.fire(centre.x, centre.y, to, EMBER.speed, EMBER.range, EMBER_LOOK);
      this.emberSource.set(ember, source);
      thrown += 1;
    }
    recordCapped(this.explosions, { level: this.level, embers: thrown });
  }

  private onEmberHit(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    // An ember flies past the enemy it burst from.
    if (this.emberSource.get(hitbox) === enemy) return;
    const from = { x: hitbox.x, y: hitbox.y };
    this.retireEmber(hitbox);
    this.emberHitCount += 1;
    this.damage(enemy, emberDamage(this.stats.damage), 'hit', from);
  }

  private retire(shot: Projectile): void {
    this.splitters.delete(shot);
    shot.despawn();
  }

  private retireEmber(ember: Projectile): void {
    this.emberSource.delete(ember);
    ember.despawn();
  }
}
