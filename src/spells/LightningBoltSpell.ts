import Phaser from 'phaser';
import { FX_DEPTH } from '../config/fx';
import { resolveCast, rollStun, type BoltStats } from '../core/chainLightning';
import { flightRotation } from '../core/fx';
import type { Vec2 } from '../core/input';
import { BOLT_SPEED, MAX_LIVE_BOLTS, boltStep } from '../core/lightningBolt';
import type { Rng } from '../core/rng';
import { Spell } from '../core/spell';
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
  private readonly flights: Flight[] = [];
  private readonly spare: Phaser.GameObjects.Sprite[] = [];
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
  ) {
    super('lightning', stats);
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
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
      const step = boltStep(sprite, flight.aim, BOLT_SPEED, deltaS);
      const heading = { x: step.x - sprite.x, y: step.y - sprite.y };
      sprite.setPosition(step.x, step.y).setRotation(flightRotation(heading, sprite.rotation));
      if (!step.arrived) continue;
      this.flights.splice(i, 1);
      sprite.setVisible(false);
      sprite.anims.stop();
      this.spare.push(sprite);
      if (flight.live) this.strike(flight.target);
    }
  }

  /** One cast: a bolt leaves the caster for each target, aimed where it stands now. */
  protected cast(): void {
    for (const bolt of resolveCast(this.caster, this.enemies.live, this.stats)) {
      const [first] = bolt;
      if (!first) continue;
      // Pool exhausted: the rest of the cast is dropped, never queued.
      if (this.flights.length >= MAX_LIVE_BOLTS) break;
      this.launch(first.target);
    }
  }

  private launch(target: Enemy): void {
    const { x, y } = this.caster;
    const sprite = this.spare.pop() ?? this.makeSprite();
    const heading = { x: target.x - x, y: target.y - y };
    sprite.setPosition(x, y).setRotation(flightRotation(heading, 0)).setVisible(true);
    if (!showEffect(sprite, BOLT_CLIP)) sprite.setOrigin(0.5, 0.5);
    this.flights.push({ sprite, target, aim: { x: target.x, y: target.y }, live: true });
  }

  /** The bolt lands: bursts on the enemy, then status before damage, as every Lightning hit does. */
  private strike(target: Enemy): void {
    const stats: BoltStats = this.stats;
    this.landed += 1;
    this.fx.burst('lightning.strike', target.x, target.y);
    this.fx.burst('lightning.impact', target.x, target.y);
    target.applyStagger(stats.staggerDuration);
    if (rollStun(this.rng, stats.stunChance)) target.applyStun(stats.stunDuration);
    this.damage(target, stats.damage);
  }

  private makeSprite(): Phaser.GameObjects.Sprite {
    return this.scene.add.sprite(0, 0, 'proj_bolt').setDepth(FX_DEPTH).setVisible(false);
  }
}
