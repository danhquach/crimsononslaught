import Phaser from 'phaser';
import type { Vec2 } from '../core/input';
import {
  MAX_BOULDERS,
  advanceOrbit,
  boulderAngles,
  boulderDamage,
  boulderPosition,
  knockbackVector,
} from '../core/orbitingBoulders';
import { Spell } from '../core/spell';
import type { EarthStats } from '../core/spellStats';
import { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { DamageSink } from './DamageSink';

/**
 * Earth (spec §5 "Earth — Orbiting Boulders"): `count` boulders circle the
 * caster at `orbitRadius`, turning `orbitSpeed` rad/s. An enemy a boulder rolls
 * over takes `damage` — `crushMultiplier` times that for a Tank — and is shoved
 * `knockback` px away from the boulder, at most once per 0.4 s per enemy.
 *
 * The rules — spacing, the turn, the hit, the shove — live in
 * `core/orbitingBoulders.ts`; this class owns the boulder pool, registers it
 * with `CollisionSystem` (the one place overlaps are wired, CO-032) and turns
 * an overlap into damage.
 *
 * Earth has no cooldown, so it overrides `tick` and never sees the scheduler:
 * every frame the ring turns and each boulder is placed from the live stats,
 * which is what makes a perk take effect on the next frame — a wider orbit
 * moves the ring out, an extra boulder joins and the others re-space.
 */
export class OrbitingBouldersSpell extends Spell<'earth'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly damage: DamageSink;
  /** Where boulder 0 is on the ring, in radians; the rest are spaced from it. */
  private angle = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    collisions: CollisionSystem,
    stats: Readonly<EarthStats>,
    damage: DamageSink,
  ) {
    super('earth', stats);
    this.caster = caster;
    this.damage = damage;
    this.group = scene.physics.add.group({
      classType: Boulder,
      maxSize: MAX_BOULDERS,
      // Boulders are placed from `tick`, which only runs while Game does, so a
      // paused scene freezes the ring.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onHit(enemy, hitbox));
    // The ring is up from the first frame, not one tick later.
    this.place();
  }

  /** Boulders on the ring right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  protected override tick(deltaS: number): void {
    this.angle = advanceOrbit(this.angle, this.stats.orbitSpeed, deltaS);
    this.place();
  }

  /** Never called: Earth has no cast, the ring is always out. */
  protected cast(): void {}

  /**
   * Put `count` boulders on the ring at the live radius and size. Boulders are
   * taken from and returned to the pool as the count changes, and every one is
   * repositioned from the same base angle, so the spacing is even every frame.
   */
  private place(): void {
    const { count, orbitRadius, size } = this.stats;
    const angles = boulderAngles(this.angle, count);
    const live = this.liveBoulders();
    while (live.length > angles.length) live.pop()?.despawn();
    angles.forEach((angle, i) => {
      const { x, y } = boulderPosition(this.caster, orbitRadius, angle);
      const boulder = live[i];
      if (boulder) {
        boulder.setPosition(x, y);
        boulder.resize(size);
      } else {
        // Pool exhausted: the ring is short a boulder until the pool frees one.
        (this.group.get(x, y) as Boulder | null)?.spawn(x, y, size);
      }
    });
  }

  /** Live boulders in pool order, so the same object keeps the same slot frame to frame. */
  private liveBoulders(): Boulder[] {
    const live: Boulder[] = [];
    for (const child of this.group.getChildren()) {
      if (child instanceof Boulder && child.active) live.push(child);
    }
    return live;
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Boulder) || !hitbox.active || !enemy.active) return;
    // The per-enemy window is claimed first: a second boulder on the same
    // enemy this frame, or any boulder within 0.4 s, does nothing.
    if (!enemy.tryBoulderHit()) return;

    const stats = this.stats;
    const push = knockbackVector(hitbox, enemy, stats.knockback, this.caster);
    this.damage(enemy, boulderDamage(stats, enemy.enemyType));
    // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
    if (enemy.active) enemy.knockBack(push);
  }
}
