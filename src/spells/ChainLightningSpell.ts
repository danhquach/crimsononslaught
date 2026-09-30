import type Phaser from 'phaser';
import { FORK } from '../config/lightningLevels';
import type { SpellLevel } from '../config/spellLevels';
import { resolveCast, rollStun } from '../core/chainLightning';
import { recordCapped } from '../core/fireLevels';
import type { Vec2 } from '../core/input';
import { forkCast, hasFork, stunStream, type ForkHit } from '../core/lightningLevels';
import type { Rng } from '../core/rng';
import { Spell, anyWithin } from '../core/spell';
import type { ChainLightningStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { ChainStripPool } from '../systems/ChainStripPool';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/**
 * Chain segments that may be up at once. A cast draws `strikes * (chains + 1)`
 * at most, or `strikes * FORK.maxHits` forked at level 3 (#329) — a maxed
 * build is a handful — and each lives one clip cycle, far
 * shorter than any cooldown a perk can reach; the headroom covers a stalled
 * frame paying out several casts. Past it a segment is dropped, never queued.
 */
export const MAX_SEGMENTS = 32;

/** Chain Lightning's level record, what the test hook reads (#329): cause and effect in one entry. */
export interface ChainLevelReport {
  /**
   * Each cast: the level it went out at, the enemies each bolt struck (its
   * first target included), whether it forked, and for a fork the jumps each
   * branch made.
   */
  casts: {
    level: SpellLevel;
    hits: number[];
    forked: boolean;
    branches: [number, number][];
  }[];
  /** Casts that forked with both branches striking: a count the capped log cannot lose. */
  fullForks: number;
  liveStrips: number;
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
 * FX (CO-082): every bolt is drawn from the caster — a tiled `lightning.chain`
 * strip from the player to the first target (#118: the bolt travels out from
 * the caster rather than reading as a strike from the sky), then one more from
 * each enemy to the next along the arc — each for one pass of the clip, cycled
 * on the run clock so a paused run holds it. `lightning.strike` and
 * `lightning.impact` play on each bolt's first target. With no atlas the strip
 * is the `fx_bolt` placeholder. The sparks on a stunned or staggered enemy are
 * the overlay pool's, driven from its status. The strips are a
 * `ChainStripPool`'s, capped at `MAX_SEGMENTS`.
 *
 * Levels (#329): level 2's two extra jumps are a stat add (`chains`). Level 3,
 * Fork: at each bolt's first target the chain splits in two branches that take
 * turns jumping (`forkPaths`), the bolt striking at most `FORK.maxHits` enemies
 * in all. From level 2 the stun rolls are made on the levels' own stream
 * (`stunStream`), so the hits a level adds never move the run's own draws;
 * level 1 rolls on the run's RNG exactly as it always has.
 */
export class ChainLightningSpell extends Spell<'lightning_chain'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly rng: Rng;
  private readonly levelRng: Rng;
  private readonly strips: ChainStripPool;
  /** Test hook (#142): enemies this spell has struck, across every bolt. */
  private landed = 0;
  private readonly castLog: ChainLevelReport['casts'] = [];
  private fullForks = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<ChainLightningStats>,
    damage: DamageSink,
    rng: Rng,
    fx: FxPool,
    levelRng: Rng = rng,
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
    return this.strips.count;
  }

  /** Test hook (#329): the casts this spell has made and how each chain ran. */
  get levelReport(): ChainLevelReport {
    return { casts: [...this.castLog], fullForks: this.fullForks, liveStrips: this.strips.count };
  }

  /** Enemies struck so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.strips.step(deltaS);
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
    const level = this.level;
    if (hasFork(level)) {
      this.castForked(level);
      return;
    }
    const { stats } = this;
    const rng = stunStream(level, this.rng, this.levelRng);
    const bolts = resolveCast(this.caster, this.enemies.live, stats);
    if (bolts.length === 0) return;
    recordCapped(this.castLog, {
      level,
      hits: bolts.map((bolt) => bolt.length),
      forked: false,
      branches: [],
    });

    for (const bolt of bolts) {
      const [first] = bolt;
      if (!first) continue;
      this.lay(this.caster, first.target);
      this.fx.burst('lightning.strike', first.target.x, first.target.y);
      this.fx.burst('lightning.impact', first.target.x, first.target.y);
      let from: Readonly<Vec2> = first.target;
      for (const { target } of bolt.slice(1)) {
        this.lay(from, target);
        from = { x: target.x, y: target.y };
      }
    }
    for (const bolt of bolts) {
      // Each link strikes from the one before it; the first from the caster.
      let from: Readonly<Vec2> = { x: this.caster.x, y: this.caster.y };
      for (const { target, damage } of bolt) {
        const at = { x: target.x, y: target.y };
        this.landed += 1;
        // Status before damage, so a killing bolt has still marked the enemy
        // while it was there; the stun roll draws once per enemy struck.
        target.applyStagger(stats.staggerDuration);
        if (rollStun(rng, stats.stunChance)) target.applyStun(stats.stunDuration);
        this.damage(target, damage, 'hit', from);
        from = at;
      }
    }
  }

  /**
   * One level 3 cast (#329): the same order as a plain one, over forked bolts.
   * Every strip and every position is laid before any damage lands; each hit
   * strikes from the enemy it jumped from, the first from the caster.
   */
  private castForked(level: SpellLevel): void {
    const { stats } = this;
    const bolts: ForkHit<Enemy>[][] = forkCast(this.caster, this.enemies.live, stats, FORK.maxHits);
    if (bolts.length === 0) return;
    const branches = bolts.map((bolt): [number, number] => [
      bolt.filter((hit) => hit.branch === 0).length,
      bolt.filter((hit) => hit.branch === 1).length,
    ]);
    if (branches.some(([a, b]) => a > 0 && b > 0)) this.fullForks += 1;
    recordCapped(this.castLog, {
      level,
      hits: bolts.map((bolt) => bolt.length),
      forked: true,
      branches,
    });
    const origins = bolts.map((bolt) =>
      bolt.map(({ from }): Vec2 => ({ x: (from ?? this.caster).x, y: (from ?? this.caster).y })),
    );
    for (const bolt of bolts) {
      const [first] = bolt;
      if (!first) continue;
      this.fx.burst('lightning.strike', first.target.x, first.target.y);
      this.fx.burst('lightning.impact', first.target.x, first.target.y);
      for (const { target, from } of bolt) this.lay(from ?? this.caster, target);
    }
    bolts.forEach((bolt, i) => {
      bolt.forEach(({ target, damage }, j) => {
        this.landed += 1;
        target.applyStagger(stats.staggerDuration);
        if (rollStun(this.levelRng, stats.stunChance)) target.applyStun(stats.stunDuration);
        this.damage(target, damage, 'hit', origins[i]?.[j] ?? this.caster);
      });
    });
  }

  /** Put one strip between two points — the caster and a target, or two enemies. */
  private lay(from: Readonly<Vec2>, to: Readonly<Vec2>): void {
    this.strips.lay(from, to);
  }
}
