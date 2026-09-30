import type Phaser from 'phaser';
import { FX_DEPTH } from '../config/fx';
import { MAX_LIVE_STORM_BOLTS, STORM_CELL, TWIN_TORNADO } from '../config/lightningLevels';
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
  tornadoesPerCast,
  twinHeadings,
} from '../core/lightningLevels';
import { Spell, anyWithin } from '../core/spell';
import type { TornadoStats } from '../core/spellStats';
import { driftArea, tornadoHeading, tornadoPulls } from '../core/tornado';
import type { Enemy } from '../entities/Enemy';
import { showEffect } from '../render/animate';
import type { AreaPool } from '../systems/AreaPool';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/**
 * What only Tornado's level 3 needs (#329): the scene to draw its storm cell
 * bolts in and the effects pool they burst on. Without it a tornado throws
 * nothing, whatever its level.
 */
export interface TornadoLevelKit {
  readonly scene: Phaser.Scene;
  readonly fx: FxPool;
}

/** One storm cell bolt in the air, homing on the enemy its funnel picked. */
interface StormBolt {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly target: Enemy;
  readonly aim: Vec2;
  live: boolean;
  readonly damage: number;
}

/** Tornado's level record, what the test hook reads (#329): cause and effect in one entry. */
export interface TornadoLevelReport {
  /** Each cast: the level it went out at and the tornadoes it placed. */
  casts: { level: SpellLevel; tornadoes: number; spreadDeg: number }[];
  /**
   * Each storm cell funnel that has run out: its life, the bolts that fell due
   * over it (one every `STORM_CELL.everyS`) and those it threw at an enemy.
   */
  funnels: { level: SpellLevel; lifeS: number; due: number; thrown: number }[];
  /** Storm cell bolts thrown, landed and dropped at the pool cap, all run. */
  boltsThrown: number;
  boltHits: number;
  boltsDropped: number;
  liveBolts: number;
  /** `clip@scale` of each storm cell bolt in the air. */
  boltViews: { clip: string | null; scale: number }[];
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
 * Spec §6.2: a tornado has a finite lifetime, so every number it uses is read
 * once at the cast and closed over — a passive taken mid-flight grows the next
 * one, never the one already tearing through the crowd.
 *
 * Levels (#329): level 2 sends `TWIN_TORNADO.count` tornadoes a cast, fanned
 * about the aim (`twinHeadings`). Level 3, Storm cell: every
 * `STORM_CELL.everyS` of its life a funnel throws a small bolt at the nearest
 * enemy around it (`stormCellTarget`), out of a pool of this spell's own capped
 * at `MAX_LIVE_STORM_BOLTS`; a bolt past the cap is dropped. A bolt homes like
 * Lightning Bolt's and staggers what it lands on; it never stuns and draws
 * nothing from any RNG. The level is taken at the cast. Level 1 is one
 * tornado on the heading it always had.
 */
export class TornadoSpell extends Spell<'lightning_tornado'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly areas: AreaPool;
  private readonly kit: TornadoLevelKit | undefined;
  /** Test hook (#142): tornadoes this spell has sent out. */
  private sent = 0;
  /** Tornadoes of this spell's own on the ground right now. */
  private out = 0;
  /** Test hook (#142): enemy-ticks its tornadoes have paid out, across every cast. */
  private ticked = 0;
  private readonly bolts: StormBolt[] = [];
  private readonly spareBolts: Phaser.GameObjects.Sprite[] = [];
  private readonly castLog: TornadoLevelReport['casts'] = [];
  private readonly funnelLog: TornadoLevelReport['funnels'] = [];
  private boltsThrown = 0;
  private boltHits = 0;
  private boltsDropped = 0;

  constructor(
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<TornadoStats>,
    damage: DamageSink,
    areas: AreaPool,
    kit?: TornadoLevelKit,
  ) {
    super('lightning_tornado', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.areas = areas;
    this.kit = kit;
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

  /** Test hook (#329): the casts this spell has made and what its storm cells threw. */
  get levelReport(): TornadoLevelReport {
    return {
      casts: [...this.castLog],
      funnels: [...this.funnelLog],
      boltsThrown: this.boltsThrown,
      boltHits: this.boltHits,
      boltsDropped: this.boltsDropped,
      liveBolts: this.bolts.length,
      boltViews: this.bolts.map(({ sprite }) => ({
        clip: sprite.anims.currentAnim?.key ?? null,
        scale: sprite.scaleX,
      })),
    };
  }

  /** Stepped on the run clock, so a paused run holds every storm cell bolt where it is. */
  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.bolts[i] as StormBolt;
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
      this.spareBolts.push(sprite);
      if (bolt.live) this.landBolt(bolt, from);
    }
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /**
   * One cast: a tornado from the caster toward the nearest enemy in
   * `targetRange` (two, fanned about it, from level 2); with nothing in range
   * the cast is spent on nothing, the rule Fire Wave follows. A pool at its cap
   * drops the tornado, so the cast is spent — a backlog waiting for room would
   * land them all at once, long after the moment that asked for them.
   */
  protected cast(): void {
    const { targetRange } = this.stats;
    const heading = tornadoHeading(this.caster, this.enemies.live, targetRange);
    if (!heading) return;
    const level = this.level;
    const count = tornadoesPerCast(level);
    let placed = 0;
    for (const aim of twinHeadings(heading, count)) {
      if (this.place(aim, level)) placed += 1;
    }
    recordCapped(this.castLog, {
      level,
      tornadoes: placed,
      spreadDeg: count > 1 ? TWIN_TORNADO.spreadDeg : 0,
    });
  }

  /** One tornado on `heading`; false when the area pool is full. */
  private place(heading: Readonly<Vec2>, level: SpellLevel): boolean {
    const { radius, duration, tickRate, tickDamage, speed, pullRadius, pullForce } = this.stats;
    const area = createArea(this.caster, { radius, durationS: duration, tickEveryS: tickRate });
    // A storm cell's own clock and count, closed over at the cast so two funnels never share one.
    const cell =
      this.kit && hasStormCell(level)
        ? { lifeS: 0, due: 0, thrown: 0, damage: stormBoltDamage(tickDamage) }
        : null;
    const placed = this.areas.place(
      area,
      (live) => this.applyTick(live, tickDamage),
      {
        onStep: (live, deltaS) => {
          const moved = this.step(live, heading, speed, pullRadius, pullForce, deltaS);
          if (cell) this.stormCell(moved, cell, deltaS);
          return moved;
        },
        onExpire: () => {
          this.out -= 1;
          if (cell) {
            recordCapped(this.funnelLog, {
              level,
              lifeS: Math.round(cell.lifeS * 1000) / 1000,
              due: cell.due,
              thrown: cell.thrown,
            });
          }
        },
      },
      TORNADO_LOOK,
    );
    if (!placed) return false;
    this.sent += 1;
    this.out += 1;
    return true;
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

  /**
   * One frame of a storm cell (level 3): the bolts that fell due over this
   * stretch of the funnel's life, each thrown from its eye. A funnel's life is
   * capped at its duration, so the bolts it can ever throw are
   * `floor(duration / everyS)`.
   */
  private stormCell(
    area: Readonly<GroundArea>,
    cell: { lifeS: number; due: number; thrown: number; damage: number },
    deltaS: number,
  ): void {
    if (!(deltaS > 0)) return;
    const prev = cell.lifeS;
    cell.lifeS = Math.min(area.durationS, prev + deltaS);
    const due = stormBoltsDue(prev, cell.lifeS);
    for (let i = 0; i < due; i += 1) {
      cell.due += 1;
      const target = stormCellTarget(area, this.enemies.live, area.radius);
      if (!target) continue;
      if (this.throwBolt(area, target, cell.damage)) cell.thrown += 1;
    }
  }

  /** A storm cell bolt from the funnel's eye at `target`; false past the pool cap, where it is dropped. */
  private throwBolt(from: Readonly<Vec2>, target: Enemy, damage: number): boolean {
    const kit = this.kit;
    if (!kit) return false;
    if (this.bolts.length >= MAX_LIVE_STORM_BOLTS) {
      this.boltsDropped += 1;
      return false;
    }
    const sprite =
      this.spareBolts.pop() ??
      kit.scene.add.sprite(0, 0, 'proj_bolt').setDepth(FX_DEPTH).setVisible(false);
    const heading = { x: target.x - from.x, y: target.y - from.y };
    sprite
      .setPosition(from.x, from.y)
      .setRotation(flightRotation(heading, 0))
      .setScale(STORM_CELL.drawScale)
      .setVisible(true);
    if (!showEffect(sprite, STORM_CELL.clip)) sprite.setOrigin(0.5, 0.5);
    this.bolts.push({ sprite, target, aim: { x: target.x, y: target.y }, live: true, damage });
    this.boltsThrown += 1;
    return true;
  }

  /** A storm cell bolt lands: a burst, the stagger, then the damage. */
  private landBolt(bolt: StormBolt, from: Readonly<Vec2>): void {
    const { target } = bolt;
    this.boltHits += 1;
    this.kit?.fx.burst('lightning.impact', target.x, target.y, { scale: STORM_CELL.drawScale });
    target.applyStagger(STORM_CELL.staggerS);
    this.damage(target, bolt.damage, 'hit', from);
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
