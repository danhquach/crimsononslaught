import Phaser from 'phaser';
import { dustFlip } from '../core/fx';
import type { Vec2 } from '../core/input';
import {
  MAX_BOULDERS,
  advanceOrbit,
  boulderAngles,
  boulderPosition,
  knockbackVector,
} from '../core/orbitingBoulders';
import type { EarthShieldStats } from '../core/spellStats';
import { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { ShieldSpell } from './ShieldSpell';

/**
 * Earth Shield (#134, Phase 2 spec §9.5): `count` stones circle the player,
 * hurting and hurling back what they roll over, over a pool the whole ring
 * shares — it absorbs `shieldHp` of the player's damage, breaks at 0, and the
 * ring returns once `rechargeDelay` has passed.
 *
 * So the ring is both the element's defence and its offence, and losing it
 * costs the player both at once: while the pool is empty there are no stones
 * on screen, nothing is being shoved away, and the next hit lands on HP.
 *
 * The pool is `core/shield.ts` through `ShieldSpell`; the ring's maths are the
 * same `core/orbitingBoulders.ts` Phase 1's Earth turns on. This class owns the
 * stone pool, registers it with `CollisionSystem` (the one place overlaps are
 * wired, CO-032) and turns an overlap into damage.
 */
export class EarthShieldSpell extends ShieldSpell<'earth_shield'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Where stone 0 is on the ring, in radians; the rest are spaced from it. */
  private angle = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    collisions: CollisionSystem,
    stats: Readonly<EarthShieldStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('earth_shield', stats);
    this.caster = caster;
    this.damage = damage;
    this.fx = fx;
    this.group = scene.physics.add.group({
      classType: Boulder,
      maxSize: MAX_BOULDERS,
      // Stones are placed from `tick`, which only runs while Game does, so a
      // paused scene freezes the ring.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onHit(enemy, hitbox));
    // The ring is up from the first frame, not one tick later.
    this.place();
  }

  /** Stones on the ring right now; 0 while the shield is broken. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.angle = advanceOrbit(this.angle, this.stats.orbitSpeed, deltaS);
    this.place();
  }

  /** The stones fall in: nothing is left on screen until the pool comes back. */
  protected onBreak(): void {
    this.clearRing();
    this.fx.burst('earth.impact', this.caster.x, this.caster.y);
  }

  /**
   * Put `count` stones on the ring at the live radius, size and roll, or take
   * the ring off the board while the shield is down. Stones are taken from and
   * returned to the pool as the count changes, and every one is repositioned
   * from the same base angle, so the spacing is even every frame.
   */
  private place(): void {
    if (!this.up) {
      this.clearRing();
      return;
    }
    const { count, orbitRadius, orbitSpeed, size } = this.stats;
    const angles = boulderAngles(this.angle, count);
    const live = this.liveStones();
    while (live.length > angles.length) live.pop()?.despawn();
    angles.forEach((angle, i) => {
      const { x, y } = boulderPosition(this.caster, orbitRadius, angle);
      let stone = live[i];
      if (stone) {
        stone.setPosition(x, y);
        stone.resize(size);
      } else {
        // Pool exhausted: the ring is short a stone until the pool frees one.
        stone = (this.group.get(x, y) as Boulder | null) ?? undefined;
        stone?.spawn(x, y, size);
      }
      stone?.spin(orbitSpeed);
    });
  }

  private clearRing(): void {
    for (const stone of this.liveStones()) stone.despawn();
  }

  /** Live stones in pool order, so the same object keeps the same slot frame to frame. */
  private liveStones(): Boulder[] {
    const live: Boulder[] = [];
    for (const child of this.group.getChildren()) {
      if (child instanceof Boulder && child.active) live.push(child);
    }
    return live;
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Boulder) || !hitbox.active || !enemy.active) return;
    // The per-enemy window is claimed first: a second stone on the same enemy
    // this frame, or any stone within `hitCooldown`, does nothing.
    if (!enemy.tryBoulderHit()) return;

    const { damage, knockback } = this.stats;
    const push = knockbackVector(hitbox, enemy, knockback, this.caster);
    this.fx.burst('earth.impact', enemy.x, enemy.y);
    this.damage(enemy, damage);
    // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
    if (!enemy.active) return;
    enemy.knockBack(push);
    // The dust is drawn from its top edge, so it sits at the enemy's feet.
    this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
  }
}
