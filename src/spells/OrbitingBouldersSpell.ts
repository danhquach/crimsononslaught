import type Phaser from 'phaser';
import { dustFlip } from '../core/fx';
import type { Vec2 } from '../core/input';
import { boulderDamage, knockbackVector } from '../core/orbitingBoulders';
import type { EarthStats } from '../core/spellStats';
import type { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { OrbitingBodySpell } from './OrbitingBodySpell';

/**
 * Earth (spec §5 "Earth — Orbiting Boulders"): `count` boulders circle the
 * caster at `orbitRadius`, turning `orbitSpeed` rad/s. An enemy a boulder rolls
 * over takes `damage` — `crushMultiplier` times that for a Tank — and is shoved
 * `knockback` px away from the boulder, at most once per 0.4 s per enemy.
 *
 * The ring is `OrbitingBodySpell`'s (#142 generalised it out of here); what is
 * Earth's alone is the hit — the crush, the shove and the per-enemy window the
 * `Enemy` keeps for every boulder at once (`core/orbitingBoulders.ts`).
 *
 * FX (CO-082): each boulder rolls at a rate that follows `orbitSpeed`,
 * `earth.impact` plays on every hit, and `earth.dust` kicks up under a shoved
 * enemy, blowing the way it was pushed.
 */
export class OrbitingBouldersSpell extends OrbitingBodySpell<'earth'> {
  private readonly damage: DamageSink;
  private readonly fx: FxPool;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    collisions: CollisionSystem,
    stats: Readonly<EarthStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super(scene, 'earth', caster, collisions, stats);
    this.damage = damage;
    this.fx = fx;
  }

  /** A boulder rolls at a rate that follows the orbit speed (CO-082). */
  protected orient(boulder: Boulder): void {
    boulder.spin(this.stats.orbitSpeed);
  }

  protected onHit(enemy: Enemy, boulder: Boulder): void {
    // The per-enemy window is claimed first: a second boulder on the same
    // enemy this frame, or any boulder within 0.4 s, does nothing.
    if (!enemy.tryBoulderHit()) return;

    const stats = this.stats;
    const push = knockbackVector(boulder, enemy, stats.knockback, this.caster);
    this.fx.burst('earth.impact', enemy.x, enemy.y);
    this.damage(enemy, boulderDamage(stats, enemy.enemyType));
    // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
    if (!enemy.active) return;
    enemy.knockBack(push);
    // The dust is drawn from its top edge, so it sits at the enemy's feet.
    this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
  }
}
