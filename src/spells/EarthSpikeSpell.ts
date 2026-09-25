import Phaser from 'phaser';
import { MAX_LIVE_SPIKES, rollBleed, spikeHit, spikeTarget } from '../core/earthSpike';
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
  ) {
    super('earth', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.fx = fx;
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

  /** One spike, flung at where the nearest enemy within `range` stands now. */
  protected cast(): void {
    const { range, speed } = this.stats;
    const { x, y } = this.caster;
    const target = spikeTarget(this.caster, this.enemies.live, range);
    if (!target) return;
    // Pool exhausted: the cast is dropped, never queued.
    const spike = this.group.get(x, y) as Projectile | null;
    if (!spike) return;
    spike.fire(x, y, target, speed, range, SPIKE_LOOK);
    this.struck.set(spike, new Set());
  }

  private onOverlap(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const hit = this.struck.get(hitbox);
    // Already struck: a piercing spike is still passing through the same
    // enemy, not a new one, so it costs neither damage nor pierce.
    if (!hit || hit.has(enemy)) return;
    hit.add(enemy);

    // Read live, so a pick taken while a spike is in the air (#206's Pierce)
    // reaches it too.
    const stats = this.stats;
    const push = knockbackVector(hitbox, enemy, stats.knockback, this.caster);
    const { damage, bleed, bleedDurationS } = spikeHit(
      stats,
      rollBleed(this.rng, stats.bleedChance),
    );
    this.landed += 1;
    this.fx.burst('earth.impact', enemy.x, enemy.y);
    // Status before damage, so a killing spike has still marked the enemy
    // while it was there.
    if (bleed > 0) enemy.applyBleed(bleed, bleedDurationS);
    this.damage(enemy, damage);
    // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
    if (enemy.active) {
      enemy.knockBack(push);
      // The dust is drawn from its top edge, so it sits at the enemy's feet.
      this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
    }
    if (rollSpent(hit.size, stats.pierce)) this.despawn(hitbox);
  }

  private despawn(spike: Projectile): void {
    this.struck.delete(spike);
    spike.despawn();
  }
}
