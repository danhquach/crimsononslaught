import Phaser from 'phaser';
import { NOVA_WAVE } from '../config/iceLevels';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { advanceWave, newWave, waveDone, type Wave } from '../core/fireWave';
import { hasNovaWave } from '../core/iceLevels';
import {
  BOMB_SPIN_DEG_PER_S,
  MAX_LIVE_BOMBS,
  MAX_LIVE_ICICLES,
  bombAim,
  bombFrost,
  icicleFrost,
  rolledOut,
  throwAngles,
  throwsDue,
} from '../core/frostNova';
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
import { IceRingWave, newRingTrace, type RingTrace } from './IceRingWave';

/** The rolling bomb: `ice.urchin` through its placeholder key, the disc without the atlas. */
const BOMB_LOOK: ProjectileLook = { texture: 'proj_nova_bomb' };

/** One icicle in flight: `ice.icicle` through its placeholder key, the diamond without the atlas. */
const ICICLE_LOOK: ProjectileLook = { texture: 'proj_icicle' };

const SPIN_RAD_PER_S = (BOMB_SPIN_DEG_PER_S * Math.PI) / 180;

/**
 * The least turn in one step that counts as a spin. `setRotation` re-wraps the
 * angle, so setting the same rotation again can move it by a float ulp.
 */
const TURN_EPSILON_RAD = 1e-6;

/** One rolling bomb's own clock, and the numbers it was thrown with (spec §6.2 snapshot). */
interface Flight {
  /** The level the bomb was thrown at (#328): the wave is read here, not where the roll ends. */
  readonly level: SpellLevel;
  readonly aimRad: number;
  readonly stats: Readonly<NovaBombStats>;
  elapsedS: number;
  thrown: number;
  /** Test hook (CO-185): a step of this flight turned the sprite. */
  turned: boolean;
}

/** One level 3 cold wave in flight, with the numbers its bomb was thrown with. */
interface LiveWave {
  readonly wave: Wave<Enemy>;
  readonly stats: Readonly<NovaBombStats>;
  readonly level: SpellLevel;
  readonly view: IceRingWave;
  caught: number;
}

/** Frost Nova Bomb's level record, what the test hook reads (#328, #406): cause and effect in one entry. */
export interface NovaLevelReport {
  /** Each throw of the icicle spiral: the icicles that actually left the bomb. */
  throws: { level: SpellLevel; icicles: number }[];
  /** Each bomb whose roll ran out: the level it was thrown at and whether it released a wave. Nothing else happens at the end of a roll. */
  rolls: { level: SpellLevel; wave: boolean }[];
  /** Each wave that has finished: the level it came from and the enemies it hit. */
  waves: { level: SpellLevel; caught: number }[];
  /** Waves finished so far, and those that hit at least one enemy: counts the capped `waves` log cannot lose. */
  wavesDone: number;
  wavesHit: number;
  /** Waves in the air right now. */
  liveWaves: number;
  /** How every wave ring so far was drawn, read off its sprite: the frames it wore, its edge against the rim, its lowest opacity. */
  ring: RingTrace;
}

/**
 * Frost Nova Bomb (#141, reworked by CO-182 — see
 * `docs/superpowers/specs/2026-09-28-frost-nova-bomb-rework-design.md` — and
 * by #406): every `cooldown` s a slow spinning ice bomb leaves the caster
 * toward the densest group within `range` and rolls its whole `range` in a
 * straight line through the crowd, never stopping on an enemy. Every
 * `throwInterval` s it sprays `icicles` icicles outward in a turning spiral;
 * an icicle breaks on the first enemy it meets, slowing it and dealing
 * `icicleDamage`. Those icicles are all its damage: where the roll ends the
 * bomb just vanishes.
 *
 * Level 3, Frost wave (#406): where the roll ends the bomb releases a
 * full-circle cold wave from its core. The rim grows at `NOVA_WAVE.speed` to
 * the bomb's `radius`, and every enemy it sweeps over is hit once: slowed by
 * `slowPct` for `slowDuration` s, perhaps frozen for `freezeDuration` s on
 * `freezeChance`, and dealt `damage`. A wave is a `core/fireWave.ts` wave with
 * a half arc of pi; the look is `IceRingWave`.
 *
 * The rules — the aim, the spiral, the throw clock, the end of the roll, what
 * an icicle and the wave leave on an enemy — live in `core/frostNova.ts`; this
 * class owns the two Arcade pools. Bombs are not registered with
 * `CollisionSystem` (they pass through enemies); icicles are, the one place
 * overlaps are wired (CO-032). A wave is plain data, advanced from `tick`, so
 * the run clock drives it and pause and `?timeScale=` just work.
 *
 * FX (CO-182, #406): the bomb wears `ice.urchin` and the icicles `ice.icicle`,
 * through their placeholder keys' `STATIC_FRAMES`; a wave is drawn as the
 * `ice.wave` ring. The frost on a slowed enemy and the block on a frozen one
 * are the overlay pool's, driven from its status.
 */
export class NovaBombSpell extends Spell<'ice_nova_bomb'> {
  private readonly scene: Phaser.Scene;
  private readonly bombs: Phaser.Physics.Arcade.Group;
  private readonly icicles: Phaser.Physics.Arcade.Group;
  private readonly flights = new Map<Projectile, Flight>();
  private readonly waves: LiveWave[] = [];
  private readonly throwLog: NovaLevelReport['throws'] = [];
  private readonly rollLog: NovaLevelReport['rolls'] = [];
  private readonly waveLog: NovaLevelReport['waves'] = [];
  private readonly ring = newRingTrace();
  private wavesDone = 0;
  private wavesHit = 0;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly rng: Rng;
  private readonly fx: FxPool;
  /** Test hook (#406): enemies the waves have caught, across every wave. */
  private waveLanded = 0;
  /** Test hook (#406): bombs whose roll has run out. */
  private rolled = 0;
  /** Test hook (CO-182): icicles that have broken on an enemy. */
  private icicleLanded = 0;
  /** Test hook (CO-185): rolls whose bomb sprite turned during the flight. */
  private spun = 0;

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
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.fx = fx;
    // Bombs roll on Arcade velocity and are driven from `tick`, which only runs
    // while Game does, so a paused scene freezes them. They are not registered
    // with CollisionSystem: they pass through the crowd and end on the rule
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

  /** Test hook (#328, #406): the throws, roll ends and waves this spell has made, and the waves in the air. */
  get levelReport(): NovaLevelReport {
    return {
      throws: [...this.throwLog],
      rolls: [...this.rollLog],
      waves: [...this.waveLog],
      wavesDone: this.wavesDone,
      wavesHit: this.wavesHit,
      liveWaves: this.waves.length,
      ring: { ...this.ring, frames: [...this.ring.frames] },
    };
  }

  /** Bombs and icicles in the air right now. */
  get liveCount(): number {
    return this.bombs.countActive(true) + this.icicles.countActive(true);
  }

  /** Enemies this spell has hit, by icicle or by wave — what the browser suite watches. */
  get hits(): number {
    return this.icicleLanded + this.waveLanded;
  }

  /** Bombs whose roll has run out so far. */
  get rollouts(): number {
    return this.rolled;
  }

  /** Icicles that have broken on an enemy. */
  get icicleHits(): number {
    return this.icicleLanded;
  }

  /** Enemies the waves have hit, across every wave. */
  get waveHits(): number {
    return this.waveLanded;
  }

  /**
   * Rolls whose bomb sprite turned during its flight. Recorded here rather than
   * sampled by the suite: a flight is 150–300 ms of wall clock at time scale 10,
   * shorter than a CI sample round (CO-185).
   */
  get spunRolls(): number {
    return this.spun;
  }

  /**
   * Turn each rolling bomb, end its roll on the rule, then throw the icicles it
   * is owed, and grow the waves. The end check runs first, so the step that
   * ends a roll throws nothing.
   */
  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    // Waves first, so a wave born this step is drawn at its core before it first grows.
    if (this.waves.length > 0) this.growWaves(deltaS);
    if (this.flights.size > 0) this.roll(deltaS);
    for (const child of this.icicles.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) child.despawn();
    }
  }

  /** Every rolling bomb's step. */
  private roll(deltaS: number): void {
    // Deleting a Map entry while iterating it is safe: it just stops being visited.
    for (const [bomb, flight] of this.flights) {
      if (!bomb.active) {
        this.flights.delete(bomb);
        continue;
      }
      flight.elapsedS += deltaS;
      const before = bomb.rotation;
      bomb.setRotation(before + SPIN_RAD_PER_S * deltaS);
      if (Math.abs(Phaser.Math.Angle.Wrap(bomb.rotation - before)) > TURN_EPSILON_RAD) {
        flight.turned = true;
      }
      if (rolledOut(bomb.travelled, flight.stats.range)) {
        if (flight.turned) this.spun += 1;
        this.endRoll(bomb, flight);
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
    this.flights.set(bomb, {
      level: this.level,
      aimRad: Math.atan2(aim.y, aim.x),
      stats,
      elapsedS: 0,
      thrown: 0,
      turned: false,
    });
  }

  /** One throw of the spiral: the whole set leaves the bomb's position. */
  private throwIcicles(bomb: Projectile, flight: Flight): void {
    const { icicles, icicleSpeed, icicleRange } = flight.stats;
    let thrown = 0;
    for (const angle of throwAngles(flight.aimRad, flight.thrown, icicles)) {
      const icicle = this.icicles.get(bomb.x, bomb.y) as Projectile | null;
      // Pool exhausted: the rest of the throw is dropped, never queued.
      if (!icicle) break;
      const to = {
        x: bomb.x + Math.cos(angle) * icicleRange,
        y: bomb.y + Math.sin(angle) * icicleRange,
      };
      icicle.fire(bomb.x, bomb.y, to, icicleSpeed, icicleRange, ICICLE_LOOK);
      thrown += 1;
    }
    flight.thrown += 1;
    recordCapped(this.throwLog, { level: flight.level, icicles: thrown });
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
    // Exploit reads the enemy as the icicle found it, before its own chill (CO-234).
    const afflicted = enemy.isAfflicted;
    // Chill first, then damage, the way every Ice hit lands.
    enemy.applyFrost(icicleFrost(this.stats));
    this.damage(enemy, this.stats.icicleDamage, 'hit', from, afflicted);
  }

  /**
   * The roll's end, at the bomb's position. Below level 3 the bomb just
   * vanishes: no damage, no effect. At level 3 it releases a cold wave. The
   * level is the one it was thrown at.
   */
  private endRoll(bomb: Projectile, flight: Flight): void {
    const origin = { x: bomb.x, y: bomb.y };
    bomb.despawn();
    this.flights.delete(bomb);
    this.rolled += 1;
    const wave = hasNovaWave(flight.level);
    recordCapped(this.rollLog, { level: flight.level, wave });
    if (!wave) return;
    const view = new IceRingWave(this.scene, origin, this.ring);
    view.update(0, flight.stats.radius);
    this.waves.push({
      wave: newWave<Enemy>(origin, 0),
      stats: flight.stats,
      level: flight.level,
      view,
      caught: 0,
    });
  }

  /** Grow every wave's rim; hit what it sweeps over, once each; retire it at its radius. */
  private growWaves(deltaS: number): void {
    for (const live of [...this.waves]) {
      const { wave, stats } = live;
      const struck = advanceWave(
        wave,
        this.enemies.live,
        NOVA_WAVE.speed * deltaS,
        stats.radius,
        Math.PI,
        (enemy) => enemy.bodyRadius,
      );
      for (const enemy of struck) {
        if (!enemy.active) continue;
        live.caught += 1;
        this.waveLanded += 1;
        // Exploit reads the enemy as the wave found it, before its own chill (CO-234).
        const afflicted = enemy.isAfflicted;
        // Chill (and the freeze roll) first, then damage, the way every Ice hit lands.
        enemy.applyFrost(bombFrost(stats, this.rng));
        this.damage(enemy, stats.damage, 'hit', wave.origin, afflicted);
      }
      if (waveDone(wave, stats.radius)) {
        live.view.destroy();
        this.waves.splice(this.waves.indexOf(live), 1);
        this.wavesDone += 1;
        if (live.caught > 0) this.wavesHit += 1;
        recordCapped(this.waveLog, { level: live.level, caught: live.caught });
      } else {
        live.view.update(wave.r, stats.radius);
      }
    }
  }
}
