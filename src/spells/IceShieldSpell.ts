import Phaser from 'phaser';
import { FROST_AURA, MAX_LIVE_SHIELD_ICICLES, SHATTER_RING } from '../config/iceLevels';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { icicleFrost } from '../core/frostNova';
import { novaScale } from '../core/fx';
import { hasFrostAura, inAura, shatterRingFrost, shatterRingHeadings } from '../core/iceLevels';
import { spawnsDue } from '../core/iceStorm';
import type { Vec2 } from '../core/input';
import { nearestEnemies } from '../core/spell';
import type { IceShieldStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { ShieldAura } from '../entities/ShieldAura';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { ShieldSpell } from './ShieldSpell';

/** One shatter-ring icicle: the icicle placeholder the Frost Nova Bomb uses, so no new art (#328). */
const RING_ICICLE_LOOK: ProjectileLook = { texture: 'proj_icicle' };

/** Ice Shield's level record, what the test hook reads (#328): cause and effect in one entry. */
export interface IceShieldLevelReport {
  /** Each aura pulse that caught an enemy, only ever while the shield was up. */
  auraPulses: { level: SpellLevel; caught: number; slowedAfter: number }[];
  /** Pulses fired in all, whether or not they caught anything. */
  pulseCount: number;
  /** Each break: the enemies it caught, how many of those were frozen after it, the icicles fired. */
  breaks: { level: SpellLevel; caught: number; frozenAfter: number; icicles: number }[];
  liveIcicles: number;
  icicleHits: number;
  iciclesDropped: number;
}

/**
 * Ice Shield (#134, Phase 2 spec §9.3): a layer of ice on the player that
 * absorbs `shieldHp` of damage before their HP is touched, regrows once it is
 * left alone for `rechargeDelay`, and shatters when a hit empties it — dealing
 * `breakDamage` and chilling everything within `breakRadius`.
 *
 * The pool's rules are `core/shield.ts`, worn through `ShieldSpell`; this class
 * owns the layer on screen and the shatter. The layer follows the player every
 * frame and fades with the pool, so a shield about to break reads as one.
 *
 * The shatter is a burst rather than a lingering area: it is the shield's last
 * act, and the frost it leaves is what buys the player the room to back off
 * while the pool regrows.
 *
 * Levels (#328): level 2, Frost aura: while the shield is up, every
 * `FROST_AURA.tickEveryS` each enemy within `FROST_AURA.radius` of the player's
 * edge (plus its own body) is slowed; a shield that is down chills nothing and
 * its clock starts over when it returns. Level 3, Shatter ring: a break also
 * freezes what it chills (`SHATTER_RING.freezeS`, through `applyFrost` so the
 * boss's diminishing returns cap it) and fires `SHATTER_RING.icicles` icicles
 * round the player, out of a pool of their own. The level is read when the
 * break happens.
 */
export class IceShieldSpell extends ShieldSpell<'ice_shield'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly aura: ShieldAura;
  private readonly icicles: Phaser.Physics.Arcade.Group;
  /** Run-clock seconds the shield has stood, which the aura's pulses are counted off; 0 while it is down. */
  private auraClockS = 0;
  private pulses = 0;
  private readonly pulseLog: IceShieldLevelReport['auraPulses'] = [];
  private readonly breakLog: IceShieldLevelReport['breaks'] = [];
  private icicleHitCount = 0;
  private icicleDropCount = 0;
  /** Test hook (#134): enemies the shatter has caught, across every break. */
  private shattered = 0;

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
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.aura = new ShieldAura(scene, caster.x, caster.y);
    // Drawn from the first frame, not one tick later.
    this.aura.show(caster, this.fill);
    // Icicles fly on Arcade velocity and expire from `tick`, which only runs
    // while Game does, so a paused scene freezes them.
    this.icicles = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_SHIELD_ICICLES,
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.icicles, (enemy, hitbox) => this.onIcicleHit(enemy, hitbox));
  }

  /** Test hook (#328): the aura's pulses, the breaks and the icicles this shield has made. */
  get levelReport(): IceShieldLevelReport {
    return {
      auraPulses: [...this.pulseLog],
      pulseCount: this.pulses,
      breaks: [...this.breakLog],
      liveIcicles: this.icicles.countActive(true),
      icicleHits: this.icicleHitCount,
      iciclesDropped: this.icicleDropCount,
    };
  }

  /** Enemies this shield's shatters have caught — what the browser suite reads. */
  get shatterHits(): number {
    return this.shattered;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.aura.show(this.caster, this.fill);
    this.frostAura(deltaS);
    for (const child of this.icicles.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) child.despawn();
    }
  }

  /**
   * Frost aura (level 2): while the shield is up, one pulse per
   * `FROST_AURA.tickEveryS` slows every enemy touching it. Down, or below level
   * 2, the clock does not run, so a shield that returns starts a fresh count.
   */
  private frostAura(deltaS: number): void {
    const level = this.level;
    if (!hasFrostAura(level) || !this.up) {
      this.auraClockS = 0;
      return;
    }
    const due = spawnsDue(this.auraClockS, deltaS, 1 / FROST_AURA.tickEveryS);
    this.auraClockS += deltaS;
    for (let i = 0; i < due; i += 1) this.pulse(level);
  }

  /** One pulse: every live enemy in reach is chilled; only a pulse that caught something is logged. */
  private pulse(level: SpellLevel): void {
    this.pulses += 1;
    const { slowPct, slowDurationS } = FROST_AURA;
    let caught = 0;
    let slowedAfter = 0;
    for (const enemy of this.enemies.live) {
      if (!enemy.active || !inAura(this.caster, enemy, FROST_AURA.radius)) continue;
      caught += 1;
      enemy.applyFrost({ slowPct, slowDuration: slowDurationS, freeze: false });
      if (enemy.slowed) slowedAfter += 1;
    }
    if (caught > 0) recordCapped(this.pulseLog, { level, caught, slowedAfter });
  }

  /**
   * The shatter. Everything inside `breakRadius` is chilled and then hit, in
   * that order, so a killing blow still leaves the arena marked where it fell
   * rather than being applied to an enemy that is already gone.
   */
  protected onBreak(): void {
    const { breakDamage, breakRadius, slowPct, slowDuration } = this.stats;
    const { x, y } = this.caster;
    // Off the screen on the step it broke, the way Earth's stones fall in —
    // waiting for the next `tick` would leave a layer drawn over a shatter.
    this.aura.show(this.caster, this.fill);
    // The ice nova is the only clip drawn to a radius, so the shatter is played
    // at the reach the stat block promises; each enemy caught gets its own
    // `ice.shatter` the way Frost Nova marks what it hits.
    this.fx.burst('ice.nova', x, y, { scale: novaScale(breakRadius) });

    // The break's level is taken as it happens; a fallen shield starts its aura count afresh.
    const level = this.level;
    this.auraClockS = 0;
    const frost = shatterRingFrost({ slowPct, slowDuration }, level);
    const live = this.enemies.live;
    let caught = 0;
    let frozenAfter = 0;
    for (const enemy of nearestEnemies(this.caster, live, live.length, breakRadius)) {
      if (!enemy.active) continue;
      this.shattered += 1;
      caught += 1;
      this.fx.burst('ice.shatter', enemy.x, enemy.y);
      enemy.applyFrost(frost);
      if (enemy.isFrozen) frozenAfter += 1;
      this.damage(enemy, breakDamage, 'hit', { x, y });
    }
    const icicles = level >= 3 ? this.fireIcicles(x, y) : 0;
    recordCapped(this.breakLog, { level, caught, frozenAfter, icicles });
  }

  /** Shatter ring (level 3): `SHATTER_RING.icicles` icicles leave the player, dropped when the pool is out. */
  private fireIcicles(x: number, y: number): number {
    let fired = 0;
    for (const angle of shatterRingHeadings()) {
      const icicle = this.icicles.get(x, y) as Projectile | null;
      // Pool exhausted: the icicle is dropped, never queued.
      if (!icicle) {
        this.icicleDropCount += 1;
        continue;
      }
      const to = {
        x: x + Math.cos(angle) * SHATTER_RING.range,
        y: y + Math.sin(angle) * SHATTER_RING.range,
      };
      icicle.fire(x, y, to, SHATTER_RING.speed, SHATTER_RING.range, RING_ICICLE_LOOK);
      fired += 1;
    }
    return fired;
  }

  /** A ring icicle breaks on its first enemy: the shield's slow, then a fraction of the break's damage. */
  private onIcicleHit(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const from = { x: hitbox.x, y: hitbox.y };
    hitbox.despawn();
    this.icicleHitCount += 1;
    this.fx.burst('ice.shatter', enemy.x, enemy.y);
    // Chill first, then damage, the way every Ice hit lands.
    enemy.applyFrost(icicleFrost(this.stats));
    this.damage(enemy, this.stats.breakDamage * SHATTER_RING.damageFactor, 'hit', from);
  }
}
