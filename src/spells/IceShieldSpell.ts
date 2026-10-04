import type Phaser from 'phaser';
import { ICE_SHIELD_WAVE } from '../config/iceLevels';
import { DIAMOND_CLIP, DIAMOND_TEXTURE } from '../config/shields';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { advanceWave, newWave, waveDone, type Wave } from '../core/fireWave';
import { icicleFrost } from '../core/frostNova';
import { diamondWaveDamage, hasDiamondWave } from '../core/iceLevels';
import type { Vec2 } from '../core/input';
import type { OrbitPhase } from '../core/orbitCycle';
import type { IceShieldStats } from '../core/spellStats';
import type { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { IceRingWave, newRingTrace, type RingTrace } from './IceRingWave';
import { OrbitRing } from './OrbitRing';
import { ShieldSpell } from './ShieldSpell';

/** One small cold wave in flight, with the diamond it left and the damage it was released with. */
interface LiveWave {
  readonly wave: Wave<Enemy>;
  readonly level: SpellLevel;
  readonly damage: number;
  readonly view: IceRingWave;
  caught: number;
}

/** Ice Shield's level record, what the test hook reads (#328, #406): cause and effect in one entry. */
export interface IceShieldLevelReport {
  /** Each frost burst: the level the ring held, when it went off on the spell's own clock, the diamonds that each released a wave. */
  bursts: { level: SpellLevel; atS: number; diamonds: number }[];
  /** Bursts so far: a count the capped log cannot lose. */
  burstCount: number;
  /** Each wave that has finished: the level it came from and the enemies it hit. */
  waves: { level: SpellLevel; caught: number }[];
  /** Waves finished so far, and those that hit at least one enemy. */
  wavesDone: number;
  wavesHit: number;
  /** Waves in the air right now. */
  liveWaves: number;
  /** How every wave ring so far was drawn, read off its sprite. */
  ring: RingTrace;
  /** Diamonds on the ring right now; 0 while recharging. */
  diamonds: number;
  /** Whether the diamonds are out or recharging right now. */
  phase: OrbitPhase;
}

/**
 * Ice Shield (#134, Phase 2 spec §9.3, #406): `count` ice diamonds circle the
 * player, chilling and hurting what they cut, over a pool the whole ring
 * shares: it absorbs `shieldHp` of the player's damage while the diamonds are
 * out. They are out for `uptime` s and gone for `recharge` s; the pool is full
 * each time they return and 0 while they are gone, and a pool broken at 0 ends
 * the uptime early, so a hit that breaks it starts the recharge.
 *
 * The pool is `core/shield.ts` through `ShieldSpell`; the ring is `OrbitRing`,
 * shared with Earth Shield and Lightning Sword. This class turns an overlap
 * into damage and a slow, and the ring's vanishing into a frost burst.
 *
 * Levels (#406): level 2's fourth diamond is a stat add (`count`), so the ring
 * simply places one more. Level 3, frost burst: when the diamonds vanish, timed
 * or broken, each one releases a small cold wave from where it hangs
 * (`ICE_SHIELD_WAVE`): a `core/fireWave.ts` wave with a half arc of pi, drawn
 * as `IceRingWave`. Each wave chills and hurts an enemy once.
 *
 * The shield's cue plays as the diamonds return, never as they time out: the
 * break cue is the player's intake path's, played only for a real break.
 */
export class IceShieldSpell extends ShieldSpell<'ice_shield'> {
  private readonly ring: OrbitRing;
  private readonly scene: Phaser.Scene;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly enemies: EnemyPool;
  /** The spell's own clock, on the run clock: what a burst's time is read from. */
  private clockS = 0;
  private readonly waves: LiveWave[] = [];
  private readonly burstLog: IceShieldLevelReport['bursts'] = [];
  private readonly waveLog: IceShieldLevelReport['waves'] = [];
  private readonly trace = newRingTrace();
  private bursts = 0;
  private wavesDone = 0;
  private wavesHit = 0;
  /** Test hook: enemies the diamonds have cut, and those the waves have caught. */
  private cuts = 0;
  private waveLanded = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<IceShieldStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('ice_shield', stats);
    this.scene = scene;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.ring = new OrbitRing(
      scene,
      caster,
      collisions,
      (enemy, diamond) => this.onHit(enemy, diamond),
      this.stats,
      { texture: DIAMOND_TEXTURE, clip: DIAMOND_CLIP },
    );
    // The ring is up from the first frame, not one tick later.
    this.placeRing();
  }

  /** Diamonds on the ring right now; 0 while the diamonds are gone. */
  get liveCount(): number {
    return this.ring.liveCount;
  }

  /** Test hook: whether the diamonds are out or recharging. */
  get cyclePhase(): OrbitPhase {
    return this.ring.phase;
  }

  /** Enemies the diamonds have cut and the waves have caught: what the browser suite watches. */
  get hits(): number {
    return this.cuts + this.waveLanded;
  }

  /** Test hook (#406): the bursts, and the waves they released. */
  get levelReport(): IceShieldLevelReport {
    return {
      bursts: [...this.burstLog],
      burstCount: this.bursts,
      waves: [...this.waveLog],
      wavesDone: this.wavesDone,
      wavesHit: this.wavesHit,
      liveWaves: this.waves.length,
      ring: { ...this.trace, frames: [...this.trace.frames] },
      diamonds: this.liveCount,
      phase: this.cyclePhase,
    };
  }

  protected override tick(deltaS: number): void {
    // Waves first, so a wave born last step is drawn at its core before it first grows.
    if (this.waves.length > 0) this.growWaves(deltaS);
    const { appeared, vanished } = this.ring.step(deltaS, this.stats);
    this.clockS += deltaS;
    if (vanished) this.dismiss(false);
    if (appeared) {
      this.refillPool();
      this.onCast?.();
    }
    this.placeRing();
  }

  /** A pool broken at 0: the diamonds vanish now and the recharge starts. */
  protected onBreak(): void {
    if (this.ring.endEarly(this.stats.recharge)) this.dismiss(true);
  }

  /**
   * The diamonds go: at level 3 each releases its wave from where it is, the
   * pool is emptied, and the ring is cleared. `broke` adds a shatter on each
   * diamond; a timed vanish plays none.
   */
  private dismiss(broke: boolean): void {
    const diamonds = this.ring.bodies;
    if (broke) for (const d of diamonds) this.fx.burst('ice.shatter', d.x, d.y);
    if (hasDiamondWave(this.level)) this.burst(this.level, diamonds);
    this.emptyPool();
    this.placeRing();
  }

  /** Frost burst (level 3): one wave per diamond, at the damage the ring holds now. */
  private burst(level: SpellLevel, diamonds: readonly Boulder[]): void {
    const damage = diamondWaveDamage(this.stats.damage);
    for (const d of diamonds) {
      const view = new IceRingWave(this.scene, d, this.trace);
      view.update(0, ICE_SHIELD_WAVE.range);
      this.waves.push({ wave: newWave<Enemy>(d, 0), level, damage, view, caught: 0 });
    }
    this.bursts += 1;
    recordCapped(this.burstLog, { level, atS: this.clockS, diamonds: diamonds.length });
  }

  /** Grow every wave's rim; chill and hit what it sweeps over, once each; retire it at its range. */
  private growWaves(deltaS: number): void {
    const { range, speed } = ICE_SHIELD_WAVE;
    for (const live of [...this.waves]) {
      const { wave } = live;
      const struck = advanceWave(
        wave,
        this.enemies.live,
        speed * deltaS,
        range,
        Math.PI,
        (enemy) => enemy.bodyRadius,
      );
      for (const enemy of struck) {
        if (!enemy.active) continue;
        live.caught += 1;
        this.waveLanded += 1;
        // Exploit reads the enemy as the wave found it, before its own chill (CO-234).
        const afflicted = enemy.isAfflicted;
        // Chill first, then damage, the way every Ice hit lands.
        enemy.applyFrost(icicleFrost(ICE_SHIELD_WAVE));
        this.damage(enemy, live.damage, 'hit', wave.origin, afflicted);
      }
      if (waveDone(wave, range)) {
        live.view.destroy();
        this.waves.splice(this.waves.indexOf(live), 1);
        this.wavesDone += 1;
        if (live.caught > 0) this.wavesHit += 1;
        recordCapped(this.waveLog, { level: live.level, caught: live.caught });
      } else {
        live.view.update(wave.r, range);
      }
    }
  }

  private placeRing(): void {
    this.ring.place(this.stats, (diamond) => diamond.spin(this.stats.orbitSpeed));
  }

  private onHit(enemy: Enemy, diamond: Boulder): void {
    // The per-enemy window is claimed first: a second diamond on the same enemy
    // this frame, or any diamond within `hitCooldown`, does nothing.
    if (!enemy.tryBoulderHit()) return;

    this.cuts += 1;
    this.fx.burst('ice.shatter', enemy.x, enemy.y);
    // Exploit reads the enemy as the diamond found it, before its own chill (CO-234).
    const afflicted = enemy.isAfflicted;
    // Chill first, then damage, the way every Ice hit lands.
    enemy.applyFrost(icicleFrost(this.stats));
    this.damage(enemy, this.stats.damage, 'hit', diamond, afflicted);
  }
}
