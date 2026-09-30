import Phaser from 'phaser';
import { DRAGON_DRAW_SCALE } from '../config/fireRoster';
import type { SpellLevel } from '../config/spellLevels';
import { dragonHitsPerFlight, dragonStrike, recordCapped } from '../core/fireLevels';
import { splashTargets, volleyTargets } from '../core/fireball';
import { explosionScale } from '../core/fx';
import { MAX_LIVE_DRAGONS } from '../core/homing';
import type { Vec2 } from '../core/input';
import { Spell, anyWithin } from '../core/spell';
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

/** What one dragon in flight remembers, taken at launch (#327). */
interface Flight {
  readonly level: SpellLevel;
  /** How many different enemies it may strike: level 3 at the launch, so a pick mid-flight changes the next dragon only. */
  readonly allowed: number;
  /** Everyone it has struck, in order; none twice. */
  readonly struck: Enemy[];
  readonly struckSet: Set<Enemy>;
}

/** Fire Dragon's level record, what the test hook reads (#327): cause and effect in one entry. */
export interface DragonLevelReport {
  casts: { level: SpellLevel; dragons: number; distinctTargets: number }[];
  /** Every dragon that has ended, with how many enemies it struck. */
  flights: { level: SpellLevel; allowed: number; hits: number; distinct: number }[];
  mostHitsOneFlight: number;
  /** Overlaps with an enemy the dragon had already struck, which it flew through. */
  refusedRepeats: number;
}

const NONE: ReadonlySet<Enemy> = new Set();

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
 * Levels (#327): level 2's second dragon is a stat add (`projectiles`), each at
 * its own target where it can. Level 3, Dragon swarm: a third dragon (another
 * `projectiles` stat add), and a dragon launched at that level strikes
 * `DRAGON_PIERCE.hitsPerFlight` different enemies instead of dying on the first:
 * after a strike it homes on the nearest enemy it has not struck, within
 * `targetRange`, and with none it flies straight on until its lifetime ends.
 * Each strike is a full hit with the splash; none twice per flight.
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
  private readonly flights = new Map<HomingProjectile, Flight>();
  private readonly castLog: DragonLevelReport['casts'] = [];
  private readonly flightLog: DragonLevelReport['flights'] = [];
  private mostHitsOneFlight = 0;
  private refusedRepeats = 0;

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

  /** Test hook (#327): the casts and flights this spell has made, with the level each ran at. */
  get levelReport(): DragonLevelReport {
    return {
      casts: [...this.castLog],
      flights: [...this.flightLog],
      mostHitsOneFlight: this.mostHitsOneFlight,
      refusedRepeats: this.refusedRepeats,
    };
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    const live = this.enemies.live;
    for (const child of this.group.getChildren()) {
      if (!(child instanceof HomingProjectile) || !child.active) continue;
      const struckSet = this.flights.get(child)?.struckSet;
      // Enemies are pooled: one that left the crowd (dead, dying) may come back
      // as a fresh spawn inside this flight, and must not be skipped then. A
      // dying enemy's body is off, so it cannot be overlapped again meanwhile.
      if (struckSet && struckSet.size > 0) {
        const present = new Set(live);
        for (const enemy of struckSet) if (!present.has(enemy)) struckSet.delete(enemy);
      }
      child.steer(deltaS, live, struckSet ?? NONE);
      if (child.spent) this.retire(child);
    }
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /** One cast: `projectiles` dragons, each at its own nearest enemy within `targetRange`. */
  protected cast(): void {
    const { speed, targetRange, homingTurnRate, duration, projectiles } = this.stats;
    const { x, y } = this.caster;
    const targets = volleyTargets(this.caster, this.enemies.live, projectiles, targetRange);
    const level = this.level;
    let launched = 0;
    for (const target of targets) {
      // Pool exhausted: the rest of the cast is dropped, never queued.
      const shot = this.group.get(x, y) as HomingProjectile | null;
      if (!shot) break;
      shot.fireAt(x, y, target, speed, homingTurnRate, duration, targetRange, DRAGON_LOOK);
      this.flights.set(shot, {
        level,
        allowed: dragonHitsPerFlight(level),
        struck: [],
        struckSet: new Set(),
      });
      launched += 1;
    }
    if (launched === 0) return;
    // One flash per cast, not per dragon: they leave the same hand.
    this.fx.burst('fire.spawn', x, y);
    recordCapped(this.castLog, {
      level,
      dragons: launched,
      distinctTargets: new Set(targets.slice(0, launched)).size,
    });
  }

  private retire(dragon: HomingProjectile): void {
    const flight = this.flights.get(dragon);
    if (flight) {
      const { level, allowed, struck } = flight;
      recordCapped(this.flightLog, {
        level,
        allowed,
        hits: struck.length,
        distinct: new Set(struck).size,
      });
      this.mostHitsOneFlight = Math.max(this.mostHitsOneFlight, struck.length);
    }
    this.flights.delete(dragon);
    dragon.despawn();
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A shot is spent on its last strike (its first, below level 3); a later
    // overlap the same frame, one with an enemy something else already killed,
    // or one with an enemy it already struck, flies on.
    if (!(hitbox instanceof HomingProjectile) || !hitbox.active || !enemy.active) return;
    const flight = this.flights.get(hitbox);
    const strike = dragonStrike(
      flight?.struckSet ?? NONE,
      flight?.struck.length ?? 0,
      enemy,
      flight?.allowed ?? 1,
    );
    if (!strike.strikes) {
      this.refusedRepeats += 1;
      return;
    }
    if (flight) {
      flight.struck.push(enemy);
      flight.struckSet.add(enemy);
    }
    const from = { x: hitbox.x, y: hitbox.y };
    if (strike.spent) this.retire(hitbox);

    const { damage, aoeRadius, aoeDamageFactor } = this.stats;
    const splash = splashTargets(enemy, this.enemies.live, aoeRadius, enemy);
    const blast = damage * aoeDamageFactor;
    this.landed += 1;
    this.fx.burst('fire.explode', enemy.x, enemy.y, { scale: explosionScale(aoeRadius) });
    // The blast spreads from where the dragon struck.
    const centre = { x: enemy.x, y: enemy.y };
    this.damage(enemy, damage, 'hit', from);
    for (const other of splash) this.damage(other, blast, 'hit', centre);
  }
}
