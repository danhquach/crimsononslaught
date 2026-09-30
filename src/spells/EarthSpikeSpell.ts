import Phaser from 'phaser';
import { SPLINTER } from '../config/earthLevels';
import type { SpellLevel } from '../config/spellLevels';
import { MAX_LIVE_SPIKES, rollBleed, spikeHit, spikeTarget } from '../core/earthSpike';
import {
  hasSplinter,
  spikeHeadings,
  spikeRollsOnLevelStream,
  splinterDamage,
  splinterPush,
  splinterTargets,
} from '../core/earthLevels';
import { recordCapped } from '../core/fireLevels';
import { dustFlip } from '../core/fx';
import type { Vec2 } from '../core/input';
import { knockbackVector } from '../core/orbitingBoulders';
import type { Rng } from '../core/rng';
import { rollSpent } from '../core/rollingBoulder';
import { Spell, anyWithin } from '../core/spell';
import type { EarthStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** A spike in flight: the veined stone shard (CO-138), a stone diamond without the atlas. */
const SPIKE_LOOK: ProjectileLook = { texture: 'proj_spike', clip: 'earth.fly' };

/** What one live spike remembers from its launch (#330): the level it flew at and whose stream its bleed rolls on. */
interface SpikeFlight {
  readonly level: SpellLevel;
  readonly onLevelStream: boolean;
}

/** Earth Spike's level record, what the test hook reads (#330): cause and effect in one entry. */
export interface SpikeLevelReport {
  /** Every cast that flung a spike, at the level it was cast at: spikes flung and the angle between the first and the last, 0 for a lone one. */
  casts: { level: SpellLevel; spikes: number; spreadDeg: number }[];
  /** Every splinter: the level its spike flew at, the enemies the shards caught and how many were hit. */
  splinters: { level: SpellLevel; caught: number; hit: number }[];
  /** Splinters so far: a count the capped log cannot lose. */
  splinterCount: number;
  /** The most enemies any one spike has struck, by the level it flew at: a level 3 spike breaks on its first, so never more than 1. */
  maxStruck: Record<SpellLevel, number>;
  /** Bleed rolls drawn from the level stream (the spikes a level added), all told. */
  levelStreamRolls: number;
  liveSpikes: number;
}

/**
 * Earth Spike (#143, Phase 2 spec §9.5): the element's default. Every
 * `cooldown` s a slow stone spike is flung at the nearest enemy within `range`
 * (#205). It strikes the first enemy it touches for `damage`, shoves it a light
 * `knockback` px, and on a `bleedChance` roll leaves it bleeding for
 * `bleedDuration` (#139). It despawns once it has struck `pierce` enemies, or
 * flies on past a target that stepped aside and despawns at its `range`
 * (`Projectile.spent`).
 *
 * The rules — the heading, the bleed roll, what a strike leaves — live in
 * `core/earthSpike.ts`; when a spike is used up is Boulder's `rollSpent`, and
 * the shove is the ring's `knockbackVector` (`core/orbitingBoulders.ts`), the
 * one every Earth spell pushes with. This class owns the projectile pool,
 * registers it with `CollisionSystem` (the one place overlaps are wired,
 * CO-032) and keeps each live spike's own set of enemies struck, so a spike
 * that pierces never strikes the same enemy twice. The bleed roll is the one
 * draw from the run's RNG, made on each strike.
 *
 * Levels (#330): level 2 flings `SPIKES_PER_CAST` spikes in a fan about the aim.
 * The first keeps the run's bleed stream; every spike a level added rolls on a
 * stream of its own, so a level-1 run replays its seed unchanged. Level 3,
 * Splinter: the spike breaks on the first enemy it hits, which takes the
 * spike's own hit, and shatters over `SPLINTER.radiusPx` round it: every other
 * enemy there takes a share of the spike's damage and a shove; no bleed, no
 * roll. A spike that reaches its range without a hit shatters nothing. A spike
 * keeps the level it flew at, and every map of a spike's is cleared when it
 * despawns.
 *
 * FX (CO-082): the spike plays `earth.fly` (CO-138), turned along its flight;
 * `earth.impact` plays at every strike and `earth.dust` kicks up under each
 * survivor, blowing the way it was shoved.
 */
export class EarthSpikeSpell extends Spell<'earth'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly rng: Rng;
  private readonly fx: FxPool;
  /** Per live spike: the enemies it has already struck. */
  private readonly struck = new Map<Projectile, Set<Enemy>>();
  /** Per live spike: what its launch fixed (#330). */
  private readonly flights = new Map<Projectile, SpikeFlight>();
  private readonly levelRng: Rng;
  private readonly castLog: SpikeLevelReport['casts'] = [];
  private readonly splinterLog: SpikeLevelReport['splinters'] = [];
  private splinters = 0;
  private readonly mostStruck: Record<SpellLevel, number> = { 1: 0, 2: 0, 3: 0 };
  private levelRolls = 0;
  /** Test hook (#143): strikes this spell has landed, across every spike. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<EarthStats>,
    damage: DamageSink,
    rng: Rng,
    fx: FxPool,
    levelRng: Rng,
  ) {
    super('earth', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.fx = fx;
    this.levelRng = levelRng;
    this.group = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_SPIKES,
      // Spikes fly on Arcade velocity and expire from `tick`, which only runs
      // while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onOverlap(enemy, hitbox));
  }

  /** Spikes in the air right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Strikes landed so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Test hook (#330): the casts and splinters this spell has made. */
  get levelReport(): SpikeLevelReport {
    return {
      casts: [...this.castLog],
      splinters: [...this.splinterLog],
      splinterCount: this.splinters,
      maxStruck: { ...this.mostStruck },
      levelStreamRolls: this.levelRolls,
      liveSpikes: this.liveCount,
    };
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (const child of this.group.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.despawn(child);
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /**
   * One cast, flung at where the nearest enemy within `range` stands now: a
   * spike, or from level 2 a fan of them about that line. Level 1 flies at the
   * target itself, exactly as it always did.
   */
  protected cast(): void {
    const { range, speed } = this.stats;
    const { x, y } = this.caster;
    const target = spikeTarget(this.caster, this.enemies.live, range);
    if (!target) return;
    const level = this.level;
    const aimRad = Math.atan2(target.y - y, target.x - x);
    const headings = level >= 2 ? spikeHeadings(aimRad, level) : [aimRad];
    let flung = 0;
    for (const [i, headingRad] of headings.entries()) {
      // Pool exhausted: the rest of the fan is dropped, never queued.
      const spike = this.group.get(x, y) as Projectile | null;
      if (!spike) break;
      const aim =
        level >= 2
          ? { x: x + Math.cos(headingRad) * range, y: y + Math.sin(headingRad) * range }
          : target;
      spike.fire(x, y, aim, speed, range, SPIKE_LOOK);
      this.struck.set(spike, new Set());
      this.flights.set(spike, { level, onLevelStream: spikeRollsOnLevelStream(i) });
      flung += 1;
    }
    if (flung === 0) return;
    const first = headings[0] ?? aimRad;
    const last = headings[flung - 1] ?? first;
    recordCapped(this.castLog, {
      level,
      spikes: flung,
      spreadDeg: Math.round((((last - first) * 180) / Math.PI) * 10) / 10,
    });
  }

  private onOverlap(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const hit = this.struck.get(hitbox);
    // Already struck: a piercing spike is still passing through the same
    // enemy, not a new one, so it costs neither damage nor pierce.
    if (!hit || hit.has(enemy)) return;
    hit.add(enemy);
    const flight = this.flights.get(hitbox);
    const flightLevel = flight?.level ?? 1;
    this.mostStruck[flightLevel] = Math.max(this.mostStruck[flightLevel], hit.size);
    // Where the spike struck, before the shove moves the enemy: a splinter centres here.
    const struckAt = { x: enemy.x, y: enemy.y };

    // Read live, so a pick taken while a spike is in the air (#206's Pierce)
    // reaches it too.
    const stats = this.stats;
    const push = knockbackVector(hitbox, enemy, stats.knockback, this.caster);
    // The spikes a level added roll on the level's own stream (#330); the
    // first keeps the run's, so a level-1 run draws exactly what it always did.
    const onLevelStream = flight?.onLevelStream === true;
    if (onLevelStream && stats.bleedChance > 0) this.levelRolls += 1;
    const { damage, bleed, bleedDurationS } = spikeHit(
      stats,
      rollBleed(onLevelStream ? this.levelRng : this.rng, stats.bleedChance),
    );
    this.landed += 1;
    this.fx.burst('earth.impact', enemy.x, enemy.y);
    // Status before damage, so a killing spike has still marked the enemy
    // while it was there.
    if (bleed > 0) enemy.applyBleed(bleed, bleedDurationS);
    this.damage(enemy, damage, 'hit', hitbox);
    // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
    if (enemy.active) {
      enemy.knockBack(push);
      // The dust is drawn from its top edge, so it sits at the enemy's feet.
      this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
    }
    // Level 3 breaks on its first hit and shatters; the others pierce as ever.
    if (flight && hasSplinter(flight.level)) {
      this.splinter(struckAt, enemy, flight.level);
      this.despawn(hitbox);
    } else if (rollSpent(hit.size, stats.pierce)) this.despawn(hitbox);
  }

  /** A spike used up, at its range or on its last pierce (or, at level 3, on its first hit). */
  private despawn(spike: Projectile): void {
    this.struck.delete(spike);
    this.flights.delete(spike);
    spike.despawn();
  }

  /**
   * Level 3, Splinter: the spike shattered on `struck` at `at`. Every other
   * enemy within `SPLINTER.radiusPx` of it, to its edge, is hit once for a share
   * of the spike's damage and shoved out from `at`. Draws nothing from any
   * stream.
   */
  private splinter(at: Readonly<Vec2>, struck: Enemy, level: SpellLevel): void {
    this.fx.burst(SPLINTER.clip, at.x, at.y, { scale: SPLINTER.drawScale });
    // Resolved before any damage lands, so a kill cannot change who was caught.
    const caught = splinterTargets(at, this.enemies.live, [struck]);
    const damage = splinterDamage(this.stats.damage);
    let hit = 0;
    for (const enemy of caught) {
      if (!enemy.active) continue;
      hit += 1;
      const push = splinterPush(at, enemy);
      this.damage(enemy, damage, 'hit', at);
      // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
      if (!enemy.active) continue;
      enemy.knockBack(push);
      this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
    }
    this.splinters += 1;
    recordCapped(this.splinterLog, { level, caught: caught.length, hit });
  }
}
