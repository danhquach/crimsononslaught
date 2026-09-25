import type Phaser from 'phaser';
import { SWORD_CLIP, SWORD_TEXTURE } from '../config/lightningRoster';
import { tickHitCooldown, tryHit } from '../core/hitWindow';
import type { Vec2 } from '../core/input';
import { bladeRotation, swordCut } from '../core/lightningSword';
import type { SwordStats } from '../core/spellStats';
import type { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { OrbitingBodySpell } from './OrbitingBodySpell';

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
 */
export class LightningSwordSpell extends OrbitingBodySpell<'lightning_sword'> {
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Per enemy: how long until a blade may cut it again. */
  private readonly hitWindows = new Map<Enemy, number>();
  /** Test hook (#142): cuts this spell has landed. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
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
  }

  /** Cuts landed so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
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

  protected onHit(enemy: Enemy): void {
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
    this.damage(enemy, cut.damage);
  }
}
