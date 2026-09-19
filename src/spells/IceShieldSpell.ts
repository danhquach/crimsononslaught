import Phaser from 'phaser';
import { novaScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import { nearestEnemies } from '../core/spell';
import type { IceShieldStats } from '../core/spellStats';
import { ShieldAura } from '../entities/ShieldAura';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { ShieldSpell } from './ShieldSpell';

/**
 * Ice Shield (#134, Phase 2 spec §9.3): a layer of ice on the player that
 * absorbs `shieldHp` of damage before their HP is touched, regrows once it is
 * left alone for `rechargeDelay`, and shatters when a hit empties it — dealing
 * `breakDamage` and chilling everything within `breakRadius`.
 *
 * The pool's rules are `core/shield.ts`, worn through `ShieldSpell`; this class
 * owns the layer on screen and the shatter. The layer follows the player every
 * frame and fades with the pool, so a shield about to break reads as one.
 *
 * The shatter is a burst rather than a lingering area: it is the shield's last
 * act, and the frost it leaves is what buys the player the room to back off
 * while the pool regrows.
 */
export class IceShieldSpell extends ShieldSpell<'ice_shield'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly aura: ShieldAura;
  /** Test hook (#134): enemies the shatter has caught, across every break. */
  private shattered = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<IceShieldStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('ice_shield', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.aura = new ShieldAura(scene, caster.x, caster.y);
    // Drawn from the first frame, not one tick later.
    this.aura.show(caster, this.fill);
  }

  /** Enemies this shield's shatters have caught — what the browser suite reads. */
  get shatterHits(): number {
    return this.shattered;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.aura.show(this.caster, this.fill);
  }

  /**
   * The shatter. Everything inside `breakRadius` is chilled and then hit, in
   * that order, so a killing blow still leaves the arena marked where it fell
   * rather than being applied to an enemy that is already gone.
   */
  protected onBreak(): void {
    const { breakDamage, breakRadius, slowPct, slowDuration } = this.stats;
    const { x, y } = this.caster;
    // Off the screen on the step it broke, the way Earth's stones fall in —
    // waiting for the next `tick` would leave a layer drawn over a shatter.
    this.aura.show(this.caster, this.fill);
    // The ice nova is the only clip drawn to a radius, so the shatter is played
    // at the reach the stat block promises; each enemy caught gets its own
    // `ice.shatter` the way Frost Nova marks what it hits.
    this.fx.burst('ice.nova', x, y, { scale: novaScale(breakRadius) });

    const live = this.enemies.live;
    for (const enemy of nearestEnemies(this.caster, live, live.length, breakRadius)) {
      if (!enemy.active) continue;
      this.shattered += 1;
      this.fx.burst('ice.shatter', enemy.x, enemy.y);
      enemy.applyFrost({ slowPct, slowDuration, freeze: false });
      this.damage(enemy, breakDamage);
    }
  }
}
