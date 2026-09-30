import type Phaser from 'phaser';
import { FX_DEPTH } from '../config/fx';
import { MAX_LIVE_STORM_BOLTS, STORM_CELL } from '../config/lightningLevels';
import { TORNADO_LOOK } from '../config/lightningRoster';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { flightRotation } from '../core/fx';
import { createArea, membersOf, type GroundArea } from '../core/groundArea';
import type { Vec2 } from '../core/input';
import { boltStep } from '../core/lightningBolt';
import {
  hasStormCell,
  stormBoltDamage,
  stormBoltsDue,
  stormCellTarget,
  tornadoHeadings,
  tornadoesPerCast,
} from '../core/lightningLevels';
import { Spell, anyWithin } from '../core/spell';
import type { TornadoStats } from '../core/spellStats';
import { TORNADO_EYE, driftArea, tornadoHeading, tornadoPulls } from '../core/tornado';
import type { Enemy } from '../entities/Enemy';
import { showEffect } from '../render/animate';
import type { AreaPool } from '../systems/AreaPool';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** One storm-cell bolt in the air, homing on the enemy it was thrown at (#329). */
interface StormBolt {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly target: Enemy;
  /** Where the target was last seen alive: a bolt whose target is gone flies here and fizzles. */
  readonly aim: Vec2;
  readonly damage: number;
  /** False once the target died or left the pool mid-flight; it is never re-read after that. */
  live: boolean;
}

/** Tornado's level record, what the test hook reads (#329): cause and effect in one entry. */
export interface TornadoLevelReport {
  /**
   * Every cast that sent a funnel, at the level it was cast at: funnels sent and
   * the angle between the first and the last heading, 0 for a lone funnel.
   */
  casts: { level: SpellLevel; sent: number; spreadDeg: number }[];
  /**
   * Every storm bolt thrown: the level its funnel was cast at, which funnel it
   * was (`patch`, 1-based, in the order sent), which bolt of that funnel's life
   * it was (`dueIndex`, 1-based) and how far from the funnel's eye its target stood.
   */
  stormBolts: { level: SpellLevel; patch: number; dueIndex: number; targetDistance: number }[];
  /** Bolts that landed a hit, and bolts dropped for a full pool, all told. */
  stormBoltHits: number;
  stormBoltsDropped: number;
  liveStormBolts: number;
  /** `clip@scale` of every storm bolt in the air now. */
  boltViews: string[];
}

/**
 * Tornado (#142, Phase 2 spec §9.4): every `cooldown` s a vortex leaves the
 * caster toward the nearest enemy within `targetRange` and drifts that way at
 * `speed` px/s for `duration`. Every frame it pulls each enemy within
 * `pullRadius` toward its eye at `pullForce` px/s (#136); every `tickRate` it
 * deals `tickDamage` to each enemy inside `radius` (#135).
 *
 * It is `GroundAreaSpell`'s patch with a heading: the pool (`systems/AreaPool.ts`)
 * owns the lifetime, the ticks and the ring on screen, and this class hands it
 * the step that moves and pulls (`core/tornado.ts`) and the tick that hurts.
 * Nothing here touches the physics world directly: the pull is asked of each
 * `Enemy` through `addForce` and spent in its own next chase step.
 *
 * Levels (#329): level 2 sends `TORNADO_SPLIT.count` funnels a cast, the second
 * at the second-nearest enemy (or fanned off the first when it is alone). Level
 * 3, Storm cell: every `STORM_CELL.everyS` of its life a funnel throws a homing
 * bolt at the nearest enemy within `STORM_CELL.range` of its eye, outside the
 * eye where it can, staggering it and dealing `STORM_CELL.damageFactor` x the
 * funnel's tick damage. Stagger only: no stun, no roll, so nothing draws from
 * the RNG. The bolts are this spell's own pool, capped at `MAX_LIVE_STORM_BOLTS`;
 * a bolt past it is dropped.
 *
 * Spec §6.2: a tornado has a finite lifetime, so every number it uses is read
 * once at the cast and closed over — a passive taken mid-flight grows the next
 * one, never the one already tearing through the crowd.
 */
export class TornadoSpell extends Spell<'lightning_tornado'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly areas: AreaPool;
  /** Test hook (#142): tornadoes this spell has sent out. */
  private sent = 0;
  /** Tornadoes of this spell's own on the ground right now. */
  private out = 0;
  /** Test hook (#142): enemy-ticks its tornadoes have paid out, across every cast. */
  private ticked = 0;
  private readonly scene: Phaser.Scene;
  private readonly fx: FxPool;
  private readonly bolts: StormBolt[] = [];
  private readonly spare: Phaser.GameObjects.Sprite[] = [];
  private readonly castLog: TornadoLevelReport['casts'] = [];
  private readonly boltLog: TornadoLevelReport['stormBolts'] = [];
  private boltHits = 0;
  private boltDrops = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<TornadoStats>,
    damage: DamageSink,
    areas: AreaPool,
    fx: FxPool,
  ) {
    super('lightning_tornado', stats);
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.areas = areas;
    this.fx = fx;
  }

  /** Tornadoes sent so far — what the browser suite watches a run cast. */
  get placed(): number {
    return this.sent;
  }

  /** Enemy-ticks paid out so far: one per enemy per tick of every tornado. */
  get hits(): number {
    return this.ticked;
  }

  /** This spell's tornadoes live right now — its own, not every patch the arena's pool holds. */
  get liveCount(): number {
    return this.out;
  }

  /** Test hook (#329): the casts and storm bolts this spell has made. */
  get levelReport(): TornadoLevelReport {
    return {
      casts: [...this.castLog],
      stormBolts: [...this.boltLog],
      stormBoltHits: this.boltHits,
      stormBoltsDropped: this.boltDrops,
      liveStormBolts: this.bolts.length,
      boltViews: this.bolts.map(
        ({ sprite }) => `${sprite.anims.currentAnim?.key ?? null}@${sprite.scaleX}`,
      ),
    };
  }

  /** Stepped on the run clock, so a paused run holds every storm bolt where it is. */
  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.bolts[i] as StormBolt;
      // Checked every frame, so a target that dies and is re-spawned from the
      // pool mid-flight is let go before it can be hit in its new life.
      if (bolt.live && (!bolt.target.active || bolt.target.isDying)) bolt.live = false;
      if (bolt.live) {
        bolt.aim.x = bolt.target.x;
        bolt.aim.y = bolt.target.y;
      }
      const { sprite } = bolt;
      const from = { x: sprite.x, y: sprite.y };
      const step = boltStep(sprite, bolt.aim, STORM_CELL.speed, deltaS);
      const heading = { x: step.x - sprite.x, y: step.y - sprite.y };
      sprite.setPosition(step.x, step.y).setRotation(flightRotation(heading, sprite.rotation));
      if (!step.arrived) continue;
      this.bolts.splice(i, 1);
      sprite.setVisible(false);
      sprite.anims.stop();
      this.spare.push(sprite);
      if (bolt.live) this.land(bolt, from);
    }
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /**
   * One cast: a tornado from the caster toward the nearest enemy in
   * `targetRange`; with nothing in range the cast is spent on nothing, the rule
   * Fire Wave follows. A pool at its cap drops the tornado, so the cast is
   * spent — a backlog waiting for room would land them all at once, long after
   * the moment that asked for them.
   */
  protected cast(): void {
    const { radius, duration, tickRate, targetRange, tickDamage, speed, pullRadius, pullForce } =
      this.stats;
    const level = this.level;
    // Level 1 keeps `tornadoHeading` itself; from level 2 the funnels each take a heading.
    const one =
      level >= 2 ? undefined : tornadoHeading(this.caster, this.enemies.live, targetRange);
    const headings =
      level >= 2
        ? tornadoHeadings(this.caster, this.enemies.live, tornadoesPerCast(level), targetRange)
        : one
          ? [one]
          : [];
    // Read once, with everything else: a funnel keeps the level and the bolt damage it was cast at.
    const stormy = hasStormCell(level);
    const boltDamage = stormBoltDamage(tickDamage);
    let placedNow = 0;
    for (const heading of headings) {
      const area = createArea(this.caster, { radius, durationS: duration, tickEveryS: tickRate });
      const patch = this.sent + 1;
      const placed = this.areas.place(
        area,
        (live) => this.applyTick(live, tickDamage),
        {
          onStep: (live, deltaS) => {
            const moved = this.step(live, heading, speed, pullRadius, pullForce, deltaS);
            if (stormy) this.stormStep(moved, live, deltaS, { level, patch, boltDamage });
            return moved;
          },
          onExpire: () => {
            this.out -= 1;
          },
        },
        TORNADO_LOOK,
      );
      if (!placed) break;
      this.sent += 1;
      this.out += 1;
      placedNow += 1;
    }
    if (placedNow === 0) return;
    const [first, ...rest] = headings.slice(0, placedNow);
    // The widest angle between the first funnel's heading and another's, from their dot product.
    const spread = Math.max(
      0,
      ...rest.map((h) =>
        Math.acos(Math.min(1, Math.max(-1, (first?.x ?? 0) * h.x + (first?.y ?? 0) * h.y))),
      ),
    );
    recordCapped(this.castLog, {
      level,
      sent: placedNow,
      spreadDeg: Math.round(((spread * 180) / Math.PI) * 10) / 10,
    });
  }

  /**
   * Level 3: the storm bolts a funnel owes this frame, from its own life clock,
   * each thrown from its eye at the nearest enemy in `STORM_CELL.range`. `live`
   * is the funnel before this frame's step, whose life is read; `moved` is
   * where it stands now.
   */
  private stormStep(
    moved: Readonly<GroundArea>,
    live: Readonly<GroundArea>,
    deltaS: number,
    funnel: { level: SpellLevel; patch: number; boltDamage: number },
  ): void {
    const elapsedS = live.durationS - live.remainingS;
    // The last frame pays only what is left of the life.
    const due = stormBoltsDue(elapsedS, Math.min(deltaS, live.remainingS));
    const first = Math.floor(elapsedS / STORM_CELL.everyS + 1e-9);
    for (let i = 0; i < due; i += 1) {
      const target = stormCellTarget(moved, TORNADO_EYE, this.enemies.live);
      if (!target) continue;
      if (!this.throwBolt(moved, target, funnel.boltDamage)) continue;
      recordCapped(this.boltLog, {
        level: funnel.level,
        patch: funnel.patch,
        dueIndex: first + i + 1,
        targetDistance: Math.hypot(target.x - moved.x, target.y - moved.y),
      });
    }
  }

  /** One storm bolt leaves the eye; false, and counted, when the pool is full. */
  private throwBolt(from: Readonly<Vec2>, target: Enemy, damage: number): boolean {
    if (this.bolts.length >= MAX_LIVE_STORM_BOLTS) {
      this.boltDrops += 1;
      return false;
    }
    const sprite = this.spare.pop() ?? this.makeSprite();
    const heading = { x: target.x - from.x, y: target.y - from.y };
    sprite
      .setPosition(from.x, from.y)
      .setRotation(flightRotation(heading, 0))
      .setScale(STORM_CELL.drawScale)
      .setVisible(true);
    if (!showEffect(sprite, STORM_CELL.clip)) sprite.setOrigin(0.5, 0.5);
    this.bolts.push({ sprite, target, aim: { x: target.x, y: target.y }, damage, live: true });
    return true;
  }

  /** The bolt lands: an impact, then the stagger before the damage, as every Lightning hit does. */
  private land(bolt: StormBolt, from: Readonly<Vec2>): void {
    const { target } = bolt;
    this.boltHits += 1;
    this.fx.burst('lightning.impact', target.x, target.y, { scale: STORM_CELL.impactScale });
    target.applyStagger(STORM_CELL.staggerS);
    this.damage(target, bolt.damage, 'hit', from);
  }

  private makeSprite(): Phaser.GameObjects.Sprite {
    return this.scene.add.sprite(0, 0, 'proj_bolt').setDepth(FX_DEPTH).setVisible(false);
  }

  /** One frame of one tornado: drift, then ask every enemy in reach for its pull. */
  private step(
    area: Readonly<GroundArea>,
    heading: Readonly<Vec2>,
    speed: number,
    pullRadius: number,
    pullForce: number,
    deltaS: number,
  ): GroundArea {
    const moved = driftArea(area, heading, speed, deltaS);
    for (const { enemy, force } of tornadoPulls(moved, this.enemies.live, pullRadius, pullForce)) {
      if (enemy.active) enemy.addForce(force);
    }
    return moved;
  }

  /** One tick of one tornado: every enemy inside the eye's radius is hit. */
  private applyTick(area: Readonly<GroundArea>, tickDamage: number): void {
    for (const enemy of membersOf(area, this.enemies.live)) {
      if (!enemy.active) continue;
      this.ticked += 1;
      this.damage(enemy, tickDamage, 'tick', area);
    }
  }
}
