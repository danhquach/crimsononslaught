import Phaser from 'phaser';
import {
  BOMB_SPIN_DEG_PER_S,
  MAX_LIVE_BOMBS,
  MAX_LIVE_ICICLES,
  bombAim,
  bombFrost,
  icicleFrost,
  pulseTargets,
  shouldBurst,
  throwAngles,
  throwsDue,
} from '../core/frostNova';
import { spikeRingScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import { Spell, anyWithin } from '../core/spell';
import type { NovaBombStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** The rolling bomb: `ice.urchin` through its placeholder key, the disc without the atlas. */
const BOMB_LOOK: ProjectileLook = { texture: 'proj_nova_bomb' };

/** One icicle in flight: `ice.icicle` through its placeholder key, the diamond without the atlas. */
const ICICLE_LOOK: ProjectileLook = { texture: 'proj_icicle' };

const SPIN_RAD_PER_S = (BOMB_SPIN_DEG_PER_S * Math.PI) / 180;

/** One rolling bomb's own clock, and the numbers it was thrown with (spec §6.2 snapshot). */
interface Flight {
  /** Which throw this is, counting from 1 — what the test hook tells one bomb from the next by. */
  readonly id: number;
  readonly aimRad: number;
  readonly stats: Readonly<NovaBombStats>;
  elapsedS: number;
  thrown: number;
}

/**
 * Frost Nova Bomb (#141, reworked by CO-182 — see
 * `docs/superpowers/specs/2026-09-28-frost-nova-bomb-rework-design.md`): every
 * `cooldown` s a slow spinning ice bomb leaves the caster toward the densest
 * group within `range` and rolls through the crowd in a straight line, never
 * stopping on an enemy. Every `throwInterval` s it sprays `icicles` icicles
 * outward in a turning spiral; an icicle breaks on the first enemy it meets,
 * slowing it and dealing `icicleDamage`. Once it has rolled
 * `BURST_ARM_DISTANCE` and `BURST_TRIGGER_COUNT` enemies stand close round it,
 * or its range runs out, it bursts: every enemy within
 * `radius` takes `damage`, is slowed by `slowPct` for `slowDuration` s and may
 * be frozen for `freezeDuration` s on `freezeChance`.
 *
 * The rules — the aim, the spiral, the throw clock, the burst trigger, what an
 * icicle and the burst leave on an enemy — live in `core/frostNova.ts`; this
 * class owns the two Arcade pools. Bombs are not registered with
 * `CollisionSystem` (they pass through enemies); icicles are, the one place
 * overlaps are wired (CO-032). The burst is resolved geometrically against the
 * live enemies at the bomb's position, so it puts no body in the world.
 *
 * FX (CO-182): the bomb wears `ice.urchin` and the icicles `ice.icicle`,
 * through their placeholder keys' `STATIC_FRAMES`. `ice.spikeRing` bursts once
 * per detonation where the bomb went off, drawn so its rim sits on the burst
 * `radius` (`spikeRingScale`). Ice Shield keeps `ice.nova` for its shatter.
 * The frost on a slowed enemy and the block on a frozen one are the overlay
 * pool's, driven from its status.
 */
export class NovaBombSpell extends Spell<'ice_nova_bomb'> {
  private readonly bombs: Phaser.Physics.Arcade.Group;
  private readonly icicles: Phaser.Physics.Arcade.Group;
  private readonly flights = new Map<Projectile, Flight>();
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly rng: Rng;
  private readonly fx: FxPool;
  /** Test hook (#141): enemies the bursts have caught, across every detonation. */
  private landed = 0;
  /** Test hook (#141): bombs that have gone off, in a pack or at range. */
  private burst = 0;
  /** Test hook (CO-182): icicles that have broken on an enemy. */
  private icicleLanded = 0;
  /** Test hook (CO-182): how many enemies each burst caught, in order. */
  private readonly caught: number[] = [];
  /** Bombs thrown so far, the next flight's id. */
  private thrownBombs = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<NovaBombStats>,
    damage: DamageSink,
    rng: Rng,
    fx: FxPool,
  ) {
    super('ice_nova_bomb', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.fx = fx;
    // Bombs roll on Arcade velocity and are driven from `tick`, which only runs
    // while Game does, so a paused scene freezes them. They are not registered
    // with CollisionSystem: they pass through the crowd and burst on the rule
    // (CO-182).
    this.bombs = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_BOMBS,
      runChildUpdate: false,
    });
    this.icicles = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_ICICLES,
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.icicles, (enemy, hitbox) => this.onIcicleHit(enemy, hitbox));
  }

  /** Bombs and icicles in the air right now. */
  get liveCount(): number {
    return this.bombs.countActive(true) + this.icicles.countActive(true);
  }

  /** Enemies the bursts have caught — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Bursts so far, in a pack or at range. */
  get detonations(): number {
    return this.burst;
  }

  /** Icicles that have broken on an enemy. */
  get icicleHits(): number {
    return this.icicleLanded;
  }

  /** How many enemies each burst caught, in order. */
  get burstCaught(): readonly number[] {
    return this.caught;
  }

  /**
   * The first live bomb's throw id and rotation in radians, or `null` with none
   * rolling: two samples of one id show whether that bomb turned in between.
   */
  get bombSpin(): { id: number; rotation: number } | null {
    for (const [bomb, flight] of this.flights) {
      if (bomb.active) return { id: flight.id, rotation: bomb.rotation };
    }
    return null;
  }

  /**
   * Turn each rolling bomb, burst it on the rule, then throw the icicles it is
   * owed. The burst check runs first, so the step that bursts throws nothing.
   */
  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    if (this.flights.size > 0) this.roll(deltaS);
    for (const child of this.icicles.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) child.despawn();
    }
  }

  /** Every rolling bomb's step, against one read of the live crowd. */
  private roll(deltaS: number): void {
    const live = this.enemies.live;
    // Deleting a Map entry while iterating it is safe: it just stops being visited.
    for (const [bomb, flight] of this.flights) {
      if (!bomb.active) {
        this.flights.delete(bomb);
        continue;
      }
      flight.elapsedS += deltaS;
      bomb.setRotation(bomb.rotation + SPIN_RAD_PER_S * deltaS);
      if (shouldBurst(bomb, live, bomb.travelled, flight.stats.range, flight.stats.radius)) {
        this.detonate(bomb, flight.stats);
        continue;
      }
      const owed = throwsDue(flight.elapsedS, flight.thrown, flight.stats.throwInterval);
      for (let i = 0; i < owed; i += 1) this.throwIcicles(bomb, flight);
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /** One throw. With no enemy in range nothing leaves the caster and the cast is spent. */
  protected cast(): void {
    const stats = { ...this.stats };
    const aim = bombAim(this.caster, this.enemies.live, stats.radius, stats.range, this.rng);
    if (!aim) return;
    const { x, y } = this.caster;
    // Pool exhausted: the throw is dropped, never queued.
    const bomb = this.bombs.get(x, y) as Projectile | null;
    if (!bomb) return;
    const to = { x: x + aim.x * stats.range, y: y + aim.y * stats.range };
    bomb.fire(x, y, to, stats.speed, stats.range, BOMB_LOOK);
    this.thrownBombs += 1;
    this.flights.set(bomb, {
      id: this.thrownBombs,
      aimRad: Math.atan2(aim.y, aim.x),
      stats,
      elapsedS: 0,
      thrown: 0,
    });
  }

  /** One throw of the spiral: the whole set leaves the bomb's position. */
  private throwIcicles(bomb: Projectile, flight: Flight): void {
    const { icicles, icicleSpeed, icicleRange } = flight.stats;
    for (const angle of throwAngles(flight.aimRad, flight.thrown, icicles)) {
      const icicle = this.icicles.get(bomb.x, bomb.y) as Projectile | null;
      // Pool exhausted: the rest of the throw is dropped, never queued.
      if (!icicle) break;
      const to = {
        x: bomb.x + Math.cos(angle) * icicleRange,
        y: bomb.y + Math.sin(angle) * icicleRange,
      };
      icicle.fire(bomb.x, bomb.y, to, icicleSpeed, icicleRange, ICICLE_LOOK);
    }
    flight.thrown += 1;
  }

  /**
   * An icicle breaks on its first enemy. It reads the live `this.stats` rather
   * than the bomb's snapshot — a deliberate simplification: an icicle in
   * flight takes the current block, the way Ice Arrow's arrow does.
   */
  private onIcicleHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A later overlap the same frame, or one with an enemy something else
    // already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const from = { x: hitbox.x, y: hitbox.y };
    hitbox.despawn();
    this.icicleLanded += 1;
    this.fx.burst('ice.shatter', enemy.x, enemy.y);
    // Chill first, then damage, the way every Ice hit lands.
    enemy.applyFrost(icicleFrost(this.stats));
    this.damage(enemy, this.stats.icicleDamage, 'hit', from);
  }

  /** The burst, resolved at the bomb's position: chill first, then damage, the way every Ice hit lands. */
  private detonate(bomb: Projectile, stats: Readonly<NovaBombStats>): void {
    const origin = { x: bomb.x, y: bomb.y };
    bomb.despawn();
    this.flights.delete(bomb);
    this.burst += 1;
    let caught = 0;
    for (const enemy of pulseTargets(origin, this.enemies.live, stats.radius)) {
      if (!enemy.active) continue;
      caught += 1;
      enemy.applyFrost(bombFrost(stats, this.rng));
      this.damage(enemy, stats.damage, 'hit', origin);
    }
    this.landed += caught;
    this.caught.push(caught);
    this.fx.burst('ice.spikeRing', origin.x, origin.y, { scale: spikeRingScale(stats.radius) });
  }
}
