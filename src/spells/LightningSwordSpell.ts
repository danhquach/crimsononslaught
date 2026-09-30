import type Phaser from 'phaser';
import { MAX_LIVE_SWORD_ARC_STRIPS, SWORD_ARC } from '../config/lightningLevels';
import { SWORD_CLIP, SWORD_TEXTURE } from '../config/lightningRoster';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { tickHitCooldown, tryHit } from '../core/hitWindow';
import type { Vec2 } from '../core/input';
import {
  bladeArcReady,
  hasSwordArc,
  swordArcPath,
  swordHitCooldown,
} from '../core/lightningLevels';
import { bladeRotation, swordCut } from '../core/lightningSword';
import type { SwordStats } from '../core/spellStats';
import type { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import { ChainStripPool } from '../systems/ChainStripPool';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { OrbitingBodySpell } from './OrbitingBodySpell';

/** Lightning Sword's level record, what the test hook reads (#329): cause and effect in one entry. */
export interface SwordLevelReport {
  /** Every cut that landed, at the level it landed at, and the blades on the ring then. */
  cuts: { level: SpellLevel; blades: number }[];
  /**
   * Every arc: where the cutting blade was (`blade`), where the arc's first
   * strip started (`from`), how far the blade was from the caster against the
   * ring's radius, the enemies it reached and the distance of each link, and
   * the seconds since that blade last arced (null for its first).
   */
  arcs: {
    level: SpellLevel;
    blade: Vec2;
    from: Vec2;
    casterDistance: number;
    orbitRadius: number;
    targets: number;
    linkDistances: number[];
    sinceLastArcS: number | null;
  }[];
  /** Arcs, all told: rare enough to outlast the sampling of `arcs`. */
  arcCount: number;
  liveArcStrips: number;
}

/**
 * Lightning Sword (#142, Phase 2 spec §9.4): `count` blades circle the caster
 * at `orbitRadius`, turning `orbitSpeed` rad/s. An enemy a blade passes through
 * takes `damage` and is staggered for `staggerDuration`, at most once per
 * `hitCooldown` s per enemy. No knockback: the sword keeps the crowd where the
 * blade comes round again.
 *
 * The ring is `OrbitingBodySpell`'s, shared with Earth's boulders; what is the
 * sword's alone is in `core/lightningSword.ts` — how the blade lies on the ring
 * and what a cut leaves — and the per-enemy window is `core/hitWindow.ts`'s `tryHit`,
 * kept here per enemy because the spec gives the sword its own `hitCooldown`
 * where Earth's ring shares one constant through the `Enemy`.
 *
 * Levels (#329): the extra blades (level 2's fourth, level 3's fifth) are stat
 * adds. Each shortens the per-enemy window between two cuts (`swordHitCooldown`),
 * or the extra blades' cuts would be swallowed by the base one. Level 3: a cut
 * also arcs from the blade that made it to up to two other enemies within 60 px,
 * each link drawn as a chain strip from a pool of its own (`ChainStripPool`,
 * capped) and each enemy staggered for the sword's own stagger and dealt half
 * the damage. A blade arcs at most once per `SWORD_ARC.perBladeCooldownS`. No
 * stun and no roll, so nothing draws from the RNG.
 *
 * FX: `lightning.impact` plays on every cut. The blade plays `lightning.sword`
 * when the atlas carries it, and is the bolt placeholder bar when it does not.
 */
export class LightningSwordSpell extends OrbitingBodySpell<'lightning_sword'> {
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly enemies: EnemyPool;
  private readonly strips: ChainStripPool;
  /** Per enemy: how long until a blade may cut it again. */
  private readonly hitWindows = new Map<Enemy, number>();
  /** Per blade: how long until it may arc again (#329). Forgotten once run out or the body is gone. */
  private readonly bladeCooldowns = new Map<Boulder, number>();
  /** Per blade: the run-clock time of its last arc, for the report; forgotten with the body. */
  private readonly lastArcs = new Map<Boulder, number>();
  private clockS = 0;
  private readonly cutLog: SwordLevelReport['cuts'] = [];
  private readonly arcLog: SwordLevelReport['arcs'] = [];
  private arcs = 0;
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
    this.strips = new ChainStripPool(scene, MAX_LIVE_SWORD_ARC_STRIPS);
  }

  /** Cuts landed so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Test hook (#329): the cuts and arcs this spell has made. */
  get levelReport(): SwordLevelReport {
    return {
      cuts: [...this.cutLog],
      arcs: [...this.arcLog],
      arcCount: this.arcs,
      liveArcStrips: this.strips.liveCount,
    };
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.clockS += deltaS;
    this.strips.update(deltaS);
    for (const [body, remainingS] of this.bladeCooldowns) {
      const next = tickHitCooldown(remainingS, deltaS);
      if (next > 0 && body.active) this.bladeCooldowns.set(body, next);
      else this.bladeCooldowns.delete(body);
    }
    for (const body of this.lastArcs.keys()) if (!body.active) this.lastArcs.delete(body);
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
    // The arc is resolved before the damage lands, so a killing cut cannot change who it reaches.
    const path =
      hasSwordArc(level) && bladeArcReady(this.bladeCooldowns.get(body))
        ? swordArcPath(body, enemy, this.enemies.live)
        : [];
    // Status before damage, the convention every on-hit effect follows: a
    // killing cut has still staggered the enemy while it was there to take it.
    enemy.applyStagger(cut.staggerS);
    this.damage(enemy, cut.damage, 'hit', body);
    if (path.length > 0) this.arc(body, path, cut, level);
  }

  /** Level 3: the cut arcs from the blade through `path`, each link a strip, each enemy staggered then hit. */
  private arc(
    body: Boulder,
    path: readonly Enemy[],
    cut: { damage: number; staggerS: number },
    level: SpellLevel,
  ): void {
    const blade = { x: body.x, y: body.y };
    let from: Readonly<Vec2> = blade;
    const linkDistances: number[] = [];
    for (const enemy of path) {
      this.strips.lay(from, enemy);
      linkDistances.push(Math.hypot(enemy.x - from.x, enemy.y - from.y));
      const link = from;
      from = { x: enemy.x, y: enemy.y };
      enemy.applyStagger(cut.staggerS);
      this.damage(enemy, cut.damage * SWORD_ARC.damageFactor, 'hit', link);
    }
    const last = this.lastArcs.get(body);
    this.bladeCooldowns.set(body, SWORD_ARC.perBladeCooldownS);
    this.lastArcs.set(body, this.clockS);
    this.arcs += 1;
    recordCapped(this.arcLog, {
      level,
      blade,
      from: blade,
      casterDistance: Math.hypot(blade.x - this.caster.x, blade.y - this.caster.y),
      orbitRadius: this.stats.orbitRadius,
      targets: path.length,
      linkDistances,
      sinceLastArcS: last === undefined ? null : this.clockS - last,
    });
  }
}
