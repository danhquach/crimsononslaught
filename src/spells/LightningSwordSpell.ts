import type Phaser from 'phaser';
import { MAX_LIVE_SWORD_BURST_STRIPS, SWORD_BURST } from '../config/lightningLevels';
import { SWORD_CLIP, SWORD_TEXTURE } from '../config/lightningRoster';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { tickHitCooldown, tryHit } from '../core/hitWindow';
import type { Vec2 } from '../core/input';
import { hasSwordBurst, swordBurstPath, swordHitCooldown } from '../core/lightningLevels';
import { bladeRotation, swordCut } from '../core/lightningSword';
import type { OrbitPhase } from '../core/orbitCycle';
import type { SwordStats } from '../core/spellStats';
import type { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import { ChainStripPool } from '../systems/ChainStripPool';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { OrbitingBodySpell } from './OrbitingBodySpell';

/** Lightning Sword's level record, what the test hook reads (#329, #406): cause and effect in one entry. */
export interface SwordLevelReport {
  /** Every cut that landed, at the level it landed at, and the blades on the ring then. */
  cuts: { level: SpellLevel; blades: number }[];
  /**
   * Every blade's burst as the blades vanish: where the blade was, the enemies
   * it reached and the distance of each link (the first from the blade).
   */
  bursts: {
    level: SpellLevel;
    blade: Vec2;
    casterDistance: number;
    orbitRadius: number;
    targets: number;
    linkDistances: number[];
  }[];
  /** Bursts, all told: rare enough to outlast the sampling of `bursts`. */
  burstCount: number;
  liveBurstStrips: number;
  /** Whether the blades are out or recharging right now. */
  phase: OrbitPhase;
  /** Blades on the ring right now; 0 while recharging. */
  blades: number;
}

/**
 * Lightning Sword (#142, Phase 2 spec §9.4): `count` blades circle the caster
 * at `orbitRadius`, turning `orbitSpeed` rad/s, out for `uptime` s and gone for
 * `recharge` s (#406). An enemy a blade passes through takes `damage` and is
 * staggered for `staggerDuration`, at most once per `hitCooldown` s per enemy;
 * while the blades are gone nothing is hit. No knockback: the sword keeps the
 * crowd where the blade comes round again.
 *
 * The ring is `OrbitRing`'s, shared with Earth Shield's stones; what is the
 * sword's alone is in `core/lightningSword.ts` — how the blade lies on the ring
 * and what a cut leaves — and the per-enemy window is `core/hitWindow.ts`'s `tryHit`,
 * kept here per enemy because the spec gives the sword its own `hitCooldown`
 * where Earth's ring shares one constant through the `Enemy`.
 *
 * Levels (#329, #406): level 2's fourth blade is a stat add. It shortens the
 * per-enemy window between two cuts (`swordHitCooldown`), or its cuts would be
 * swallowed by the base one. Level 3: when the blades vanish, each blade fires
 * once, a chain burst from the blade to the nearest enemy within 60 px and on
 * to up to two more (`SWORD_BURST`), each link drawn as a chain strip from a
 * pool of its own (`ChainStripPool`, capped) and each enemy staggered for the
 * sword's own stagger and dealt the sword's damage. No stun and no roll, so
 * nothing draws from the RNG.
 *
 * FX: `lightning.impact` plays on every cut and every burst target. The blade
 * plays `lightning.sword` when the atlas carries it, and is the bolt
 * placeholder bar when it does not.
 */
export class LightningSwordSpell extends OrbitingBodySpell<'lightning_sword'> {
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly enemies: EnemyPool;
  private readonly strips: ChainStripPool;
  /** Per enemy: how long until a blade may cut it again. */
  private readonly hitWindows = new Map<Enemy, number>();
  private readonly cutLog: SwordLevelReport['cuts'] = [];
  private readonly burstLog: SwordLevelReport['bursts'] = [];
  private bursts = 0;
  /** Test hook (#142): cuts this spell has landed. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<SwordStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super(scene, 'lightning_sword', caster, collisions, stats, {
      texture: SWORD_TEXTURE,
      clip: SWORD_CLIP,
    });
    this.damage = damage;
    this.fx = fx;
    this.enemies = enemies;
    this.strips = new ChainStripPool(scene, MAX_LIVE_SWORD_BURST_STRIPS);
  }

  /** Cuts landed so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Test hook (#329, #406): the cuts and bursts this spell has made. */
  get levelReport(): SwordLevelReport {
    return {
      cuts: [...this.cutLog],
      bursts: [...this.burstLog],
      burstCount: this.bursts,
      liveBurstStrips: this.strips.liveCount,
      phase: this.cyclePhase,
      blades: this.liveCount,
    };
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.strips.update(deltaS);
    for (const [enemy, remainingS] of this.hitWindows) {
      // A window that has run out, or an enemy that has gone, is forgotten so
      // the map never grows past the enemies the blade has recently touched.
      const next = tickHitCooldown(remainingS, deltaS);
      if (next > 0 && enemy.active) this.hitWindows.set(enemy, next);
      else this.hitWindows.delete(enemy);
    }
  }

  /** A blade points out from the caster: hilt in, tip out (#172). */
  protected override orient(body: Boulder, angle: number): void {
    body.setRotation(bladeRotation(angle));
  }

  protected onHit(enemy: Enemy, body: Boulder): void {
    const level = this.level;
    const result = tryHit(
      this.hitWindows.get(enemy) ?? 0,
      swordHitCooldown(this.stats.hitCooldown, level),
    );
    this.hitWindows.set(enemy, result.remainingS);
    if (!result.hit) return;

    this.landed += 1;
    recordCapped(this.cutLog, { level, blades: this.liveCount });
    const cut = swordCut(this.stats);
    this.fx.burst('lightning.impact', enemy.x, enemy.y);
    // Status before damage, the convention every on-hit effect follows: a
    // killing cut has still staggered the enemy while it was there to take it.
    enemy.applyStagger(cut.staggerS);
    this.damage(enemy, cut.damage, 'hit', body);
  }

  /**
   * The blades' uptime is over: at level 3 each fires its chain burst from
   * where it is, before the ring is cleared. Every blade's path is resolved
   * from the crowd as it stands, before any damage lands, so a killing burst
   * cannot change who the next blade reaches.
   */
  protected override onVanish(bodies: readonly Boulder[]): void {
    const level = this.level;
    if (!hasSwordBurst(level)) return;
    const cut = swordCut(this.stats);
    const live = this.enemies.live;
    const blades = bodies.map((body) => {
      const blade = { x: body.x, y: body.y };
      return { blade, path: swordBurstPath(blade, live) };
    });
    for (const { blade, path } of blades) this.burst(blade, path, cut, level);
  }

  /** One blade's burst: each link a strip, each enemy staggered then hit. */
  private burst(
    blade: Readonly<Vec2>,
    path: readonly Enemy[],
    cut: { damage: number; staggerS: number },
    level: SpellLevel,
  ): void {
    let from: Readonly<Vec2> = blade;
    const linkDistances: number[] = [];
    for (const enemy of path) {
      if (!enemy.active) continue;
      this.strips.lay(from, enemy);
      linkDistances.push(Math.hypot(enemy.x - from.x, enemy.y - from.y));
      const link = from;
      from = { x: enemy.x, y: enemy.y };
      this.fx.burst('lightning.impact', enemy.x, enemy.y);
      enemy.applyStagger(cut.staggerS);
      this.damage(enemy, cut.damage * SWORD_BURST.damageFactor, 'hit', link);
    }
    this.bursts += 1;
    recordCapped(this.burstLog, {
      level,
      blade: { ...blade },
      casterDistance: Math.hypot(blade.x - this.caster.x, blade.y - this.caster.y),
      orbitRadius: this.stats.orbitRadius,
      targets: path.length,
      linkDistances,
    });
  }
}
