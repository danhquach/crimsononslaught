import Phaser from 'phaser';
import { FX_DEPTH } from '../config/fx';
import { THUNDERBOLT } from '../config/lightningLevels';
import type { SpellLevel } from '../config/spellLevels';
import { resolveCast, rollStun, type BoltStats } from '../core/chainLightning';
import { recordCapped } from '../core/fireLevels';
import { flightRotation } from '../core/fx';
import type { Vec2 } from '../core/input';
import { BOLT_SPEED, MAX_LIVE_BOLTS, boltStep } from '../core/lightningBolt';
import {
  isThunderboltCast,
  levelOneCount,
  rollsOnLevelStream,
  thunderboltDamage,
  thunderboltTargets,
} from '../core/lightningLevels';
import type { Rng } from '../core/rng';
import { Spell, anyWithin } from '../core/spell';
import { Boss } from '../entities/Boss';
import type { Enemy } from '../entities/Enemy';
import { showEffect } from '../render/animate';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** Lightning Bolt's flight clip (CO-137), drawn flying right. */
const BOLT_CLIP = 'lightning.bolt';

/** One bolt in the air, homing on the enemy it was cast at. */
interface Flight {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly target: Enemy;
  /** Where the target was last seen alive: a bolt whose target is gone flies here and fizzles. */
  readonly aim: Vec2;
  /** False once the target died or left the pool mid-flight; it is never re-read after that. */
  live: boolean;
  /** Whether this bolt's stun roll is the level's, not the run's (#329): taken at the launch. */
  readonly onLevelStream: boolean;
}

/** Lightning Bolt's level record, what the test hook reads (#329): cause and effect in one entry. */
export interface BoltLevelReport {
  /**
   * Every cast that launched a bolt, at the level it was cast at: which cast it
   * was (`castNumber`, the Thunderbolt's count), the bolts launched, how many
   * different enemies they were aimed at, and whether it dropped a Thunderbolt.
   */
  casts: {
    level: SpellLevel;
    castNumber: number;
    bolts: number;
    distinctTargets: number;
    thunderbolt: boolean;
  }[];
  /**
   * Every Thunderbolt: enemies caught, how many of them were stunned once the
   * stun was applied and before the damage (a dying enemy would read false),
   * whether the boss was one of them and the stun it was left with (after its
   * diminishing returns), and the look asked for.
   */
  thunderbolts: {
    level: SpellLevel;
    castNumber: number;
    caught: number;
    stunnedAfter: number;
    boss: boolean;
    bossStunS: number | null;
    look: string;
  }[];
  /** Thunderbolts dropped, all told: rare enough to outlast the sampling of `thunderbolts`. */
  thunderboltCount: number;
  /** Stun rolls drawn from the level stream rather than the run's. */
  levelStreamRolls: number;
}

/**
 * Lightning Bolt (#142, Phase 2 spec §9.4), the element's default: every
 * `cooldown` s, `strikes` bolts leave the caster, each at the nearest enemy
 * within `targetRange` (`resolveCast`, the same rule Chain Lightning casts
 * with, with no chain fields). A bolt is a short shot that flies at
 * `BOLT_SPEED` and homes on the enemy it was cast at (#202); when it gets
 * there it staggers it for `staggerDuration`, on a `stunChance` roll stuns it
 * for `stunDuration`, and deals `damage`. If the target dies first, the bolt
 * flies on to where it was last seen and fizzles: no damage and no retarget.
 *
 * It puts no body in the world: the target is locked at cast time, so there is
 * nothing for an overlap to decide. The stun roll is the one draw from the
 * run's RNG, made on arrival.
 *
 * Levels (#329): level 2's second strike is a stat add. Its stun roll, and any
 * a level adds past what a level-1 cast would have made, is drawn from a stream
 * of its own, so a level-1 run replays its seed unchanged. Level 3,
 * Thunderbolt: every `THUNDERBOLT.every`th cast that launched a bolt also drops
 * one from the sky on the first target the moment it is cast, for
 * `THUNDERBOLT.damageFactor` x the bolt's damage in a `THUNDERBOLT.radius` disc,
 * staggering everything it catches and stunning it for a fixed
 * `THUNDERBOLT.stunS` that no roll and no passive changes.
 *
 * FX (CO-137): the bolt plays `lightning.bolt`, turned along its heading, and
 * `lightning.strike` and `lightning.impact` burst on the target when it lands.
 * With no atlas it flies as the `proj_bolt` placeholder. Chain Lightning's
 * tiled strip is `ChainLightningSpell`'s alone.
 */
export class LightningBoltSpell extends Spell<'lightning'> {
  private readonly scene: Phaser.Scene;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly rng: Rng;
  private readonly levelRng: Rng;
  private readonly flights: Flight[] = [];
  private readonly spare: Phaser.GameObjects.Sprite[] = [];
  private readonly castLog: BoltLevelReport['casts'] = [];
  private readonly thunderboltLog: BoltLevelReport['thunderbolts'] = [];
  /** Casts that launched at least one bolt: the Thunderbolt's count. */
  private castNumber = 0;
  private thunderbolts = 0;
  private levelRolls = 0;
  /** Test hook: enemies this spell has struck. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: BoltStats,
    damage: DamageSink,
    rng: Rng,
    fx: FxPool,
    levelRng: Rng,
  ) {
    super('lightning', stats);
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.levelRng = levelRng;
    this.fx = fx;
  }

  /** Bolts in the air right now. */
  get liveCount(): number {
    return this.flights.length;
  }

  /** Enemies struck so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Test hook (#329): the casts and Thunderbolts this spell has made and the stun rolls its level stream has drawn. */
  get levelReport(): BoltLevelReport {
    return {
      casts: [...this.castLog],
      thunderbolts: [...this.thunderboltLog],
      thunderboltCount: this.thunderbolts,
      levelStreamRolls: this.levelRolls,
    };
  }

  /** Stepped on the run clock, so a paused run holds every bolt where it is. */
  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (let i = this.flights.length - 1; i >= 0; i -= 1) {
      const flight = this.flights[i] as Flight;
      // Checked every frame, so a target that dies and is re-spawned from the
      // pool mid-flight is let go before it can be hit in its new life.
      if (flight.live && (!flight.target.active || flight.target.isDying)) flight.live = false;
      if (flight.live) {
        flight.aim.x = flight.target.x;
        flight.aim.y = flight.target.y;
      }
      const { sprite } = flight;
      // Where it flies in from, since on arrival it sits on the target.
      const from = { x: sprite.x, y: sprite.y };
      const step = boltStep(sprite, flight.aim, BOLT_SPEED, deltaS);
      const heading = { x: step.x - sprite.x, y: step.y - sprite.y };
      sprite.setPosition(step.x, step.y).setRotation(flightRotation(heading, sprite.rotation));
      if (!step.arrived) continue;
      this.flights.splice(i, 1);
      sprite.setVisible(false);
      sprite.anims.stop();
      this.spare.push(sprite);
      if (flight.live) this.strike(flight.target, from, flight.onLevelStream);
    }
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /**
   * One cast: a bolt leaves the caster for each target, aimed where it stands
   * now. A cast that launched a bolt counts toward the Thunderbolt, which from
   * level 3 lands on the first target the moment it is the 5th.
   */
  protected cast(): void {
    const { stats } = this;
    const level = this.level;
    // What a level-1 cast would have launched: the first strikes keep the run's stream.
    const levelOneStrikes = levelOneCount(stats.strikes, this.id, level, 'strikes');
    const targets: Enemy[] = [];
    resolveCast(this.caster, this.enemies.live, stats).forEach((bolt, index) => {
      const [first] = bolt;
      if (!first) return;
      // Pool exhausted: the rest of the cast is dropped, never queued.
      if (this.flights.length >= MAX_LIVE_BOLTS) return;
      this.launch(first.target, rollsOnLevelStream(index, levelOneStrikes));
      targets.push(first.target);
    });
    const [struck] = targets;
    if (!struck) return;
    this.castNumber += 1;
    const thunderbolt = isThunderboltCast(this.castNumber, level);
    recordCapped(this.castLog, {
      level,
      castNumber: this.castNumber,
      bolts: targets.length,
      distinctTargets: new Set(targets).size,
      thunderbolt,
    });
    if (thunderbolt) this.dropThunderbolt(struck, level);
  }

  private launch(target: Enemy, onLevelStream: boolean): void {
    const { x, y } = this.caster;
    const sprite = this.spare.pop() ?? this.makeSprite();
    const heading = { x: target.x - x, y: target.y - y };
    sprite.setPosition(x, y).setRotation(flightRotation(heading, 0)).setVisible(true);
    if (!showEffect(sprite, BOLT_CLIP)) sprite.setOrigin(0.5, 0.5);
    this.flights.push({
      sprite,
      target,
      aim: { x: target.x, y: target.y },
      live: true,
      onLevelStream,
    });
  }

  /**
   * The bolt lands: bursts on the enemy, then status before damage, as every
   * Lightning hit does. `from` is the last point of its flight.
   */
  private strike(target: Enemy, from: Readonly<Vec2>, onLevelStream: boolean): void {
    const stats: BoltStats = this.stats;
    this.landed += 1;
    this.fx.burst('lightning.strike', target.x, target.y);
    this.fx.burst('lightning.impact', target.x, target.y);
    // Exploit reads the enemy as the bolt found it, before its own stagger and stun (CO-234).
    const afflicted = target.isAfflicted;
    target.applyStagger(stats.staggerDuration);
    if (onLevelStream) this.levelRolls += 1;
    if (rollStun(onLevelStream ? this.levelRng : this.rng, stats.stunChance)) {
      target.applyStun(stats.stunDuration);
    }
    this.damage(target, stats.damage, 'hit', from, afflicted);
  }

  /**
   * Level 3: a bolt from the sky on `target`. Everything within
   * `THUNDERBOLT.radius` is staggered and stunned for the fixed `stunS` (both
   * through the enemy's own apply, so the boss's diminishing returns count
   * them), then dealt double the bolt's damage. The stuns are counted before
   * any damage lands, so a kill cannot hide one.
   */
  private dropThunderbolt(target: Enemy, level: SpellLevel): void {
    const { stats } = this;
    const at = { x: target.x, y: target.y };
    this.fx.burst(THUNDERBOLT.strikeClip, at.x, at.y, { scale: THUNDERBOLT.strikeScale });
    this.fx.burst(THUNDERBOLT.impactClip, at.x, at.y, { scale: THUNDERBOLT.impactScale });
    const caught = thunderboltTargets(target, this.enemies.live);
    // Exploit reads each enemy as the bolt found it, before the stagger and stun (CO-234).
    const afflicted = caught.map((enemy) => enemy.isAfflicted);
    let stunnedAfter = 0;
    let boss: Boss | undefined;
    for (const enemy of caught) {
      enemy.applyStagger(stats.staggerDuration);
      enemy.applyStun(THUNDERBOLT.stunS);
      if (enemy.isStunned) stunnedAfter += 1;
      if (enemy instanceof Boss) boss = enemy;
    }
    this.thunderbolts += 1;
    recordCapped(this.thunderboltLog, {
      level,
      castNumber: this.castNumber,
      caught: caught.length,
      stunnedAfter,
      boss: boss !== undefined,
      bossStunS: boss ? boss.crowdControlRemainingS.stunS : null,
      look: `${THUNDERBOLT.strikeClip}@${THUNDERBOLT.strikeScale}`,
    });
    const damage = thunderboltDamage(stats.damage);
    caught.forEach((enemy, i) => this.damage(enemy, damage, 'hit', at, afflicted[i]));
  }

  private makeSprite(): Phaser.GameObjects.Sprite {
    return this.scene.add.sprite(0, 0, 'proj_bolt').setDepth(FX_DEPTH).setVisible(false);
  }
}
