import { spikeCaught, spikeHit, spikeTarget } from '../core/earthSpike';
import { dustFlip } from '../core/fx';
import type { Vec2 } from '../core/input';
import { knockbackVector } from '../core/orbitingBoulders';
import { Spell, anyWithin } from '../core/spell';
import type { EarthStats } from '../core/spellStats';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/**
 * Earth Spike (#143, Phase 2 spec §9.5): the element's default. Every
 * `cooldown` s a spike erupts under the nearest enemy within `targetRange`.
 * Everything within `radius` of the eruption takes `damage`, is shoved
 * `knockback` px away from it and is left bleeding for `bleedDuration` (#139).
 *
 * The rules — where it erupts, who it catches, what a hit leaves — live in
 * `core/earthSpike.ts`, and the shove is the ring's `knockbackVector`
 * (`core/orbitingBoulders.ts`), the one every Earth spell pushes with. A cast
 * is instantaneous and resolved geometrically against the live enemies, so it
 * puts no body in the world and needs no pool of its own; the only thing on
 * screen is the burst, and `FxPool` caps those.
 *
 * FX (CO-082): `earth.impact` plays at the eruption and again on each enemy
 * caught, and `earth.dust` kicks up under every survivor, blowing the way it
 * was shoved.
 */
export class EarthSpikeSpell extends Spell<'earth'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Test hook (#143): enemies this spell has caught, across every cast. */
  private landed = 0;

  constructor(
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<EarthStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('earth', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
  }

  /**
   * Bodies this spell has in the world: never any. The spike is instantaneous,
   * so the hook exists to read the same way every other spell's does.
   */
  get liveCount(): number {
    return 0;
  }

  /** Enemies caught so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /**
   * One cast. The eruption point is where the target stands this frame and is
   * read before any damage lands, so a killing blow still shoves the rest of
   * the crowd away from the same spot.
   */
  protected cast(): void {
    const stats = this.stats;
    const target = spikeTarget(this.caster, this.enemies.live, stats.targetRange);
    if (!target) return;

    const origin: Vec2 = { x: target.x, y: target.y };
    this.fx.burst('earth.impact', origin.x, origin.y);
    const { damage, bleed, bleedDurationS } = spikeHit(stats);

    for (const enemy of spikeCaught(origin, this.enemies.live, stats.radius)) {
      this.landed += 1;
      const push = knockbackVector(origin, enemy, stats.knockback, this.caster);
      // Status before damage, so a killing spike has still marked the enemy
      // while it was there.
      enemy.applyBleed(bleed, bleedDurationS);
      this.damage(enemy, damage);
      // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
      if (!enemy.active) continue;
      enemy.knockBack(push);
      // The dust is drawn from its top edge, so it sits at the enemy's feet.
      this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
    }
  }
}
