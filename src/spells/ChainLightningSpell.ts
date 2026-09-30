import type Phaser from 'phaser';
import { FORK } from '../config/lightningLevels';
import type { SpellLevel } from '../config/spellLevels';
import {
  MAX_SEGMENTS,
  hitDamage,
  resolveCast,
  rollStun,
  type Bolt,
  type BoltHit,
} from '../core/chainLightning';
import { recordCapped } from '../core/fireLevels';
import type { Vec2 } from '../core/input';
import { forkPaths, hasFork, levelOneCount, rollsOnLevelStream } from '../core/lightningLevels';
import type { Rng } from '../core/rng';
import { Spell, anyWithin } from '../core/spell';
import type { ChainLightningStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { ChainStripPool } from '../systems/ChainStripPool';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** Re-exported: the cap lives with the rules (`core/chainLightning.ts`), the browser suite reads it here. */
export { MAX_SEGMENTS };

/** Chain Lightning's level record, what the test hook reads (#329): cause and effect in one entry. */
export interface ChainLevelReport {
  /**
   * One entry per bolt, at the level it was cast at: enemies struck in all,
   * whether it forked, and the jumps on each branch (the first target is on
   * neither: a bolt with no fork has `branchB` 0).
   */
  bolts: {
    level: SpellLevel;
    hits: number;
    forked: boolean;
    branchA: number;
    branchB: number;
  }[];
  /** Bolts that forked, all told: rare enough to outlast the sampling of `bolts`. */
  forks: number;
  /** Stun rolls drawn from the level stream rather than the run's. */
  levelStreamRolls: number;
}

/**
 * Chain Lightning (#142, Phase 2 spec §9.4): every `cooldown` s, `strikes`
 * bolts leave the caster. Each hits the nearest enemy within `targetRange` for
 * `damage`, staggers it for `staggerDuration` and, on a `stunChance` roll,
 * stuns it for `stunDuration`, then chains up to `chains` times to the nearest
 * unhit enemy within `chainRange` for `damage * chainFalloff`. Lightning Bolt
 * resolves its targets by the same rule but flies as a shot, so it is
 * `LightningBoltSpell`'s (#202).
 *
 * The rules — where a bolt starts, who it jumps to, what each hit pays, whether
 * it stuns — live in `core/chainLightning.ts`. A cast is instantaneous and
 * resolved against the live enemies geometrically, so it puts no body in the
 * world. The stun roll is the one draw from the run's RNG, so a seed reproduces
 * which hits stunned.
 *
 * Levels (#329): level 2's four chains are a stat add. Level 3, Fork: each bolt
 * splits at its first hit into two branches (`core/lightningLevels.ts`'s
 * `forkPaths`), seven enemies at most, each link struck like any chain jump.
 * The stun rolls of the hits a level-1 cast would have made stay on the run's
 * RNG in their old order; those a level added, and every hit on the second
 * branch, roll on a stream of their own, so a level-1 run replays its seed
 * unchanged.
 *
 * FX (CO-082): every bolt is drawn from the caster — a tiled `lightning.chain`
 * strip from the player to the first target (#118: the bolt travels out from
 * the caster rather than reading as a strike from the sky), then one more from
 * each enemy to the next along the arc — each for one pass of the clip, cycled
 * on the run clock so a paused run holds it (`ChainStripPool`).
 * `lightning.strike` and `lightning.impact` play on each bolt's first target.
 * With no atlas the strip is the `fx_bolt` placeholder. The sparks on a stunned
 * or staggered enemy are the overlay pool's, driven from its status.
 */
export class ChainLightningSpell extends Spell<'lightning_chain'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly rng: Rng;
  private readonly levelRng: Rng;
  private readonly strips: ChainStripPool;
  private readonly boltLog: ChainLevelReport['bolts'] = [];
  private forkCount = 0;
  private levelRolls = 0;
  /** Test hook (#142): enemies this spell has struck, across every bolt. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<ChainLightningStats>,
    damage: DamageSink,
    rng: Rng,
    fx: FxPool,
    levelRng: Rng,
  ) {
    super('lightning_chain', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.levelRng = levelRng;
    this.fx = fx;
    this.strips = new ChainStripPool(scene, MAX_SEGMENTS);
  }

  /** Bolt strips on screen right now. */
  get liveCount(): number {
    return this.strips.liveCount;
  }

  /** Enemies struck so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Test hook (#329): the bolts this spell has cast and the stun rolls its level stream has drawn. */
  get levelReport(): ChainLevelReport {
    return {
      bolts: [...this.boltLog],
      forks: this.forkCount,
      levelStreamRolls: this.levelRolls,
    };
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.strips.update(deltaS);
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /**
   * One cast. Positions are read before any damage lands, so a killing blow
   * still draws to where the enemy stood; the lead-in strip leaves from where
   * the caster stands this frame.
   */
  protected cast(): void {
    const { stats } = this;
    const level = this.level;
    const bolts = this.branches(resolveCast(this.caster, this.enemies.live, stats), level);
    if (bolts.length === 0) return;

    for (const { a, b } of bolts) {
      const [first] = a;
      if (!first) continue;
      this.strips.lay(this.caster, first.target);
      this.fx.burst('lightning.strike', first.target.x, first.target.y);
      this.fx.burst('lightning.impact', first.target.x, first.target.y);
      // Each branch's links run out from the first target.
      for (const branch of [a.slice(1), b]) {
        let from: Readonly<Vec2> = first.target;
        for (const { target } of branch) {
          this.strips.lay(from, target);
          from = { x: target.x, y: target.y };
        }
      }
    }
    // What a level-1 cast would have hit: the first `chains + 1` hits of a branch keep the run's stream.
    const levelOneHits = levelOneCount(stats.chains, this.id, level, 'chains') + 1;
    for (const { a, b } of bolts) {
      const [first] = a;
      if (!first) continue;
      const firstAt = { x: first.target.x, y: first.target.y };
      // Each link strikes from the one before it; the first from the caster.
      let from: Readonly<Vec2> = { x: this.caster.x, y: this.caster.y };
      a.forEach((hit, i) => {
        from = this.strike(hit, from, rollsOnLevelStream(i, levelOneHits));
      });
      // The second branch leaves the first target, and is all the level's.
      from = firstAt;
      for (const hit of b) from = this.strike(hit, from, true);
      recordCapped(this.boltLog, {
        level,
        hits: a.length + b.length,
        forked: b.length > 0,
        branchA: a.length - 1,
        branchB: b.length,
      });
      if (b.length > 0) this.forkCount += 1;
    }
  }

  /**
   * The two branches of each bolt of the cast. Below level 3 a bolt is the
   * chain `resolveCast` found and has no second branch; from level 3 it forks at
   * its first target, no enemy on more than one bolt of the cast.
   */
  private branches(
    bolts: Bolt<Enemy>[],
    level: SpellLevel,
  ): { a: BoltHit<Enemy>[]; b: BoltHit<Enemy>[] }[] {
    if (!hasFork(level)) return bolts.map((bolt) => ({ a: bolt, b: [] }));
    const { stats } = this;
    const struck = new Set<Enemy>();
    return bolts.flatMap((bolt) => {
      const first = bolt[0]?.target;
      if (!first) return [];
      const { a, b } = forkPaths(
        level,
        first,
        this.enemies.live,
        stats.chains,
        stats.chainRange,
        struck,
        FORK.maxHits,
      );
      for (const target of [...a, ...b]) struck.add(target);
      return [
        {
          a: a.map((target, i) => ({ target, damage: hitDamage(stats, i > 0) })),
          b: b.map((target) => ({ target, damage: hitDamage(stats, true) })),
        },
      ];
    });
  }

  /**
   * One enemy struck: status before damage, so a killing bolt has still marked
   * the enemy while it was there; the stun roll draws once per enemy struck, on
   * the level's own stream when `onLevelStream`. Returns where it stood, the
   * next link's `from`.
   */
  private strike(
    { target, damage }: BoltHit<Enemy>,
    from: Readonly<Vec2>,
    onLevelStream: boolean,
  ): Readonly<Vec2> {
    const { stats } = this;
    const at = { x: target.x, y: target.y };
    this.landed += 1;
    target.applyStagger(stats.staggerDuration);
    if (onLevelStream) this.levelRolls += 1;
    if (rollStun(onLevelStream ? this.levelRng : this.rng, stats.stunChance)) {
      target.applyStun(stats.stunDuration);
    }
    this.damage(target, damage, 'hit', from);
    return at;
  }
}
