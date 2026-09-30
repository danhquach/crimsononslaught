import Phaser from 'phaser';
import { MAX_LIVE_SHARDS, SHATTER } from '../config/iceLevels';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { volleyTargets } from '../core/fireball';
import { MAX_LIVE_ARROWS, arrowFrost } from '../core/iceArrow';
import { fanHeadings, hasShatter, shardDamage, shatterHeadings } from '../core/iceLevels';
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

/** A shard is a small arrow on the arrow's own clip, so it adds no art (#328). */
const SHARD_LOOK: ProjectileLook = {
  texture: 'proj_ice',
  clip: SHATTER.clip,
  scale: SHATTER.drawScale,
};

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
 * Levels (#328): level 2's second arrow is a stat add (`projectiles`); from
 * level 2 the volley aims both arrows at the nearest enemy, fanned
 * `ICE_ARROW_FAN.spreadDeg` apart, instead of one each at the nearest few.
 * Level 3, Shatter: an arrow that left the caster at that level and hits an
 * enemy that was already slowed before the arrow's own chill throws
 * `SHATTER.count` shards forward from it, out of a pool of their own. A shard
 * hits once for a fraction of the arrow, chills, ignores the enemy it flew
 * from and never shatters again. Level 1 targeting is untouched.
 *
 * FX (CO-082): `ice.shatter` bursts where an arrow lands. The frost on a slowed
 * enemy is the overlay pool's, driven from its status.
 */
/** Ice Arrow's level record, what the test hook reads (#328): cause and effect in one entry. */
export interface IceArrowLevelReport {
  /** `fanDeg`: the angle from the first arrow of the volley to the last, 0 for a lone arrow. */
  volleys: { level: SpellLevel; shots: number; fanDeg: number }[];
  /** Every arrow hit, at the level it was launched at: whether the enemy was already slowed, and the shards thrown. */
  hits: { level: SpellLevel; wasSlowed: boolean; shards: number }[];
  /** Only the hits that shattered: rare enough to outlast the browser suite's sampling of `hits`. */
  shatters: { level: SpellLevel; shards: number }[];
  liveShards: number;
  shardHits: number;
  shardsDropped: number;
  shardViews: { clip: string | null; scale: number }[];
}

export class IceArrowSpell extends Spell<'ice'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly shards: Phaser.Physics.Arcade.Group;
  /** The level each arrow in the air was launched at: the level is taken at the launch, not the hit. */
  private readonly launched = new Map<Projectile, SpellLevel>();
  /** The enemy each shard flew from, which it flies past. */
  private readonly shardSource = new Map<Projectile, Enemy>();
  private readonly volleys: IceArrowLevelReport['volleys'] = [];
  private readonly hitLog: IceArrowLevelReport['hits'] = [];
  private readonly shatterLog: IceArrowLevelReport['shatters'] = [];
  private shardHitCount = 0;
  private shardDropCount = 0;
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
    this.shards = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_SHARDS,
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.shards, (enemy, hitbox) => this.onShardHit(enemy, hitbox));
  }

  /** Test hook (#328): the volleys and hits this spell has made, and its shards. */
  get levelReport(): IceArrowLevelReport {
    const live = this.shards
      .getChildren()
      .filter((child): child is Projectile => child instanceof Projectile && child.active);
    return {
      volleys: [...this.volleys],
      hits: [...this.hitLog],
      shatters: [...this.shatterLog],
      liveShards: live.length,
      shardHits: this.shardHitCount,
      shardsDropped: this.shardDropCount,
      shardViews: live.map((shard) => ({
        clip: shard.anims.currentAnim?.key ?? null,
        scale: shard.scaleX,
      })),
    };
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
      if (child instanceof Projectile && child.active && child.spent) this.retire(child);
    }
    for (const child of this.shards.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.retireShard(child);
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /**
   * One volley. With no enemy in range nothing leaves the caster and the cast
   * is spent. Level 1 sends each arrow at its own nearest enemy; from level 2
   * they all leave in a fan about the nearest one.
   */
  protected cast(): void {
    const { projectiles, range, speed } = this.stats;
    const { x, y } = this.caster;
    const level = this.level;
    const targets = volleyTargets(this.caster, this.enemies.live, projectiles, range);
    const nearest = targets[0];
    // A level 1 volley is one aim per target; a fan is one aim, several headings.
    const fan =
      level >= 2 && nearest
        ? fanHeadings(Math.atan2(nearest.y - y, nearest.x - x), Math.floor(projectiles))
        : null;
    const aims: Vec2[] = fan
      ? fan.map((heading) => ({
          x: x + Math.cos(heading) * range,
          y: y + Math.sin(heading) * range,
        }))
      : targets;
    let fired = 0;
    for (const aim of aims) {
      const shot = this.group.get(x, y) as Projectile | null;
      // Pool exhausted: the rest of the volley is dropped, never queued.
      if (!shot) break;
      shot.fire(x, y, aim, speed, range, ARROW_LOOK);
      this.launched.set(shot, level);
      fired += 1;
    }
    if (fired > 0) {
      const first = fan?.[0];
      const last = fan?.[fired - 1];
      const fanDeg =
        first === undefined || last === undefined ? 0 : Math.abs(last - first) * (180 / Math.PI);
      recordCapped(this.volleys, { level, shots: fired, fanDeg: Math.round(fanDeg * 10) / 10 });
    }
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // An arrow is spent on its first hit; a later overlap the same frame, or
    // one with an enemy something else already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const from = { x: hitbox.x, y: hitbox.y };
    // Read before `despawn` zeroes the velocity: the shards fan out from it.
    const { x: vx, y: vy } = (hitbox.body as Phaser.Physics.Arcade.Body).velocity;
    const level = this.launched.get(hitbox) ?? 1;
    // Shatter reads the enemy as the arrow found it, before the arrow's own chill.
    const wasSlowed = enemy.slowed;
    this.retire(hitbox);
    this.landed += 1;
    this.fx.burst('ice.shatter', enemy.x, enemy.y);
    // Status before damage, the convention every Ice hit keeps: a killing
    // arrow has still chilled the enemy while it was there to take it.
    enemy.applyFrost(arrowFrost(this.stats));
    this.damage(enemy, this.stats.damage, 'hit', from);
    // Only an arrow launched at level 3 shatters, and only on an enemy already slowed.
    const shards = hasShatter(level) && wasSlowed ? this.throwShards(enemy, Math.atan2(vy, vx)) : 0;
    recordCapped(this.hitLog, { level, wasSlowed, shards });
    if (shards > 0) recordCapped(this.shatterLog, { level, shards });
  }

  /** Shatter (level 3): `SHATTER.count` shards leave the struck enemy in a forward cone; those past the pool cap are dropped. */
  private throwShards(source: Enemy, heading: number): number {
    const { x, y } = source;
    let thrown = 0;
    for (const angle of shatterHeadings(heading)) {
      const shard = this.shards.get(x, y) as Projectile | null;
      // Pool exhausted: the shard is dropped, never queued.
      if (!shard) {
        this.shardDropCount += 1;
        continue;
      }
      const to = {
        x: x + Math.cos(angle) * SHATTER.range,
        y: y + Math.sin(angle) * SHATTER.range,
      };
      shard.fire(x, y, to, SHATTER.speed, SHATTER.range, SHARD_LOOK);
      this.shardSource.set(shard, source);
      thrown += 1;
    }
    return thrown;
  }

  private onShardHit(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    // A shard flies past the enemy it flew from.
    if (this.shardSource.get(hitbox) === enemy) return;
    const from = { x: hitbox.x, y: hitbox.y };
    this.retireShard(hitbox);
    this.shardHitCount += 1;
    this.fx.burst('ice.shatter', enemy.x, enemy.y);
    enemy.applyFrost(arrowFrost(this.stats));
    this.damage(enemy, shardDamage(this.stats.damage), 'hit', from);
  }

  private retire(arrow: Projectile): void {
    this.launched.delete(arrow);
    arrow.despawn();
  }

  private retireShard(shard: Projectile): void {
    this.shardSource.delete(shard);
    shard.despawn();
  }
}
