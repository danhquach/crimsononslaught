import type Phaser from 'phaser';
import { MAX_SWORD_ARC_SPRITES, SWORD_ARC } from '../config/lightningLevels';
import { SWORD_CLIP, SWORD_TEXTURE } from '../config/lightningRoster';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { tickHitCooldown, tryHit } from '../core/hitWindow';
import type { Vec2 } from '../core/input';
import { hasSwordArc, swordArcPath } from '../core/lightningLevels';
import { bladeRotation, swordCut } from '../core/lightningSword';
import type { SwordStats } from '../core/spellStats';
import type { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import { ArcFlashPool } from '../systems/ArcFlashPool';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { OrbitingBodySpell } from './OrbitingBodySpell';

/** Lightning Sword's level record, what the test hook reads (#329): cause and effect in one entry. */
export interface SwordLevelReport {
  /** Blades on the ring now, and the count the live block asks for. */
  blades: number;
  count: number;
  /**
   * Each arc a level 3 cut threw: the enemies it struck, the gap from the blade
   * to the first of them and each hop after, in px.
   */
  arcs: {
    level: SpellLevel;
    hits: number;
    firstGapPx: number;
    hopGapsPx: number[];
    /** Each hop's reach: `SWORD_ARC.range` plus the body radius of the enemy it reached. */
    reachPx: number[];
  }[];
  /** Cuts at level 3, and those whose arc struck at least one enemy: counts the capped log cannot lose. */
  levelThreeCuts: number;
  arcedCuts: number;
  /** Arcs that reached `SWORD_ARC.maxTargets` enemies. */
  fullArcs: number;
  arcHits: number;
  /** Sprites the arcs on screen are drawn with. */
  liveArcSprites: number;
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
 * FX: `lightning.impact` plays on every cut. The blade plays `lightning.sword`
 * when the atlas carries it, and is the bolt placeholder bar when it does not.
 *
 * Levels (#329): levels 2 and 3 each add a blade (`count`, 3 -> 4 -> 5), a
 * stat add. Level 3 also arcs every cut on: a short chain from the blade that
 * made the cut to up to `SWORD_ARC.maxTargets` other enemies within
 * `SWORD_ARC.range` of its edge (`swordArcPath`), each staggered and hit for a fraction of
 * the cut, and drawn as `lightning.chain` arcs from the blade
 * (`ArcFlashPool`). An arc hit is not a cut: it neither opens nor reads an
 * enemy's cut window, and has no cooldown of its own (deliberate: it rides
 * the cut's). No RNG.
 */
export class LightningSwordSpell extends OrbitingBodySpell<'lightning_sword'> {
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Per enemy: how long until a blade may cut it again. */
  private readonly hitWindows = new Map<Enemy, number>();
  /** Test hook (#142): cuts this spell has landed. */
  private landed = 0;
  /** What level 3's arcs need: who they can reach, and the arcs they draw. */
  private readonly enemies: EnemyPool | undefined;
  private readonly arcs: ArcFlashPool;
  private readonly arcLog: SwordLevelReport['arcs'] = [];
  private levelThreeCuts = 0;
  private arcedCuts = 0;
  private fullArcs = 0;
  private arcHits = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    collisions: CollisionSystem,
    stats: Readonly<SwordStats>,
    damage: DamageSink,
    fx: FxPool,
    enemies?: EnemyPool,
  ) {
    super(scene, 'lightning_sword', caster, collisions, stats, {
      texture: SWORD_TEXTURE,
      clip: SWORD_CLIP,
    });
    this.damage = damage;
    this.fx = fx;
    this.enemies = enemies;
    this.arcs = new ArcFlashPool(scene, MAX_SWORD_ARC_SPRITES);
  }

  /** Test hook (#329): the ring's blades and the arcs its level 3 cuts threw. */
  get levelReport(): SwordLevelReport {
    return {
      blades: this.liveCount,
      count: Math.floor(this.stats.count),
      arcs: [...this.arcLog],
      levelThreeCuts: this.levelThreeCuts,
      arcedCuts: this.arcedCuts,
      fullArcs: this.fullArcs,
      arcHits: this.arcHits,
      liveArcSprites: this.arcs.spriteCount,
    };
  }

  /** Cuts landed so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.arcs.step(deltaS);
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
    const { hitCooldown } = this.stats;
    const result = tryHit(this.hitWindows.get(enemy) ?? 0, hitCooldown);
    this.hitWindows.set(enemy, result.remainingS);
    if (!result.hit) return;

    this.landed += 1;
    const cut = swordCut(this.stats);
    this.fx.burst('lightning.impact', enemy.x, enemy.y);
    // Status before damage, the convention every on-hit effect follows: a
    // killing cut has still staggered the enemy while it was there to take it.
    enemy.applyStagger(cut.staggerS);
    // Who the arc reaches is read before the cut lands, from where the blade is now.
    const level = this.level;
    const arc = hasSwordArc(level) && this.enemies ? this.arcFrom(body, enemy) : null;
    this.damage(enemy, cut.damage, 'hit', body);
    if (arc) this.landArc(arc, cut, level);
  }

  /** The arc from `blade` after it cut `cut`: the enemies it strikes and where each strike comes from. */
  private arcFrom(blade: Readonly<Vec2>, cut: Enemy): { from: Vec2; target: Enemy }[] {
    const path = swordArcPath(blade, cut, this.enemies?.live ?? []);
    let from: Vec2 = { x: blade.x, y: blade.y };
    return path.map((target) => {
      const hop = { from, target };
      from = { x: target.x, y: target.y };
      return hop;
    });
  }

  /** Level 3: the arc drawn from the blade on, then each struck enemy staggered and hit. */
  private landArc(
    arc: { from: Vec2; target: Enemy }[],
    cut: { damage: number; staggerS: number },
    level: SpellLevel,
  ): void {
    this.levelThreeCuts += 1;
    const gaps = arc.map(({ from, target }) => Math.hypot(target.x - from.x, target.y - from.y));
    for (const { from, target } of arc) this.arcs.lay(from, target);
    for (const { from, target } of arc) {
      if (!target.active || target.isDying) continue;
      // No burst of its own: the arc drawn to it marks the hit, and leaves the
      // shared effects pool to the cuts.
      this.arcHits += 1;
      target.applyStagger(cut.staggerS);
      this.damage(target, cut.damage * SWORD_ARC.damageFactor, 'hit', from);
    }
    if (arc.length === 0) return;
    this.arcedCuts += 1;
    if (arc.length >= SWORD_ARC.maxTargets) this.fullArcs += 1;
    recordCapped(this.arcLog, {
      level,
      hits: arc.length,
      firstGapPx: Math.round((gaps[0] ?? 0) * 10) / 10,
      hopGapsPx: gaps.slice(1).map((gap) => Math.round(gap * 10) / 10),
      reachPx: arc.map(({ target }) => SWORD_ARC.range + target.bodyRadius),
    });
  }
}
