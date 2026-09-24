import Phaser from 'phaser';
import { MAX_LIVE_BOMBS, bombFrost, bombTarget, pulseTargets } from '../core/frostNova';
import { novaScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import { Spell, anyWithin } from '../core/spell';
import type { NovaBombStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** The bomb in flight: the ice placeholder, flying still — its own art is #145's. */
const BOMB_LOOK: ProjectileLook = { texture: 'proj_ice' };

/**
 * Frost Nova Bomb (#141, Phase 2 spec §9.3): Phase 1's Frost Nova, thrown.
 * Every `cooldown` s a slow bomb leaves the caster at the nearest enemy within
 * `range` and detonates on its first hit, or where its range runs out with
 * nothing hit. The detonation is the nova: every enemy within `radius` of the
 * bomb takes `damage`, is slowed by `slowPct` for `slowDuration` s and may be
 * frozen for `freezeDuration` s on `freezeChance`.
 *
 * The rules — the target, the pulse's reach, what each enemy is left with —
 * live in `core/frostNova.ts`; this class owns the bomb pool, registers it
 * with `CollisionSystem` (the one place overlaps are wired, CO-032) and
 * resolves the pulse geometrically against the live enemies at the bomb's
 * position, so the nova itself puts no body in the world.
 *
 * FX (CO-082): `ice.nova` bursts once per detonation where the bomb went off,
 * scaled to the live `radius` — the same way Ice Shield draws its shatter. The
 * frost on a slowed enemy and the block on a frozen one are the overlay pool's,
 * driven from its status.
 */
export class NovaBombSpell extends Spell<'ice_nova_bomb'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly rng: Rng;
  private readonly fx: FxPool;
  /** Test hook (#141): enemies the pulses have caught, across every detonation. */
  private landed = 0;
  /** Test hook (#141): bombs that have gone off, on a hit or at range. */
  private burst = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<NovaBombStats>,
    damage: DamageSink,
    rng: Rng,
    fx: FxPool,
  ) {
    super('ice_nova_bomb', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.fx = fx;
    this.group = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_BOMBS,
      // Bombs fly on Arcade velocity and expire from `tick`, which only runs
      // while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onHit(enemy, hitbox));
  }

  /** Bombs in the air right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Enemies the pulses have caught — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Detonations so far, on a hit or at range. */
  get detonations(): number {
    return this.burst;
  }

  /** A bomb that flew its range with nothing in the way goes off where it stopped. */
  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    for (const child of this.group.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.detonate(child);
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /** One throw. With no enemy in range nothing leaves the caster and the cast is spent. */
  protected cast(): void {
    const { range, speed } = this.stats;
    const target = bombTarget(this.caster, this.enemies.live, range);
    if (!target) return;
    const { x, y } = this.caster;
    // Pool exhausted: the throw is dropped, never queued.
    const bomb = this.group.get(x, y) as Projectile | null;
    if (!bomb) return;
    bomb.fire(x, y, target, speed, range, BOMB_LOOK);
  }

  private onHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A bomb is spent on its first hit; a later overlap the same frame, or one
    // with an enemy something else already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    this.detonate(hitbox);
  }

  /** The nova, resolved at the bomb's position: chill first, then damage, the way every Ice hit lands. */
  private detonate(bomb: Projectile): void {
    const origin = { x: bomb.x, y: bomb.y };
    bomb.despawn();
    this.burst += 1;
    const stats = this.stats;
    for (const enemy of pulseTargets(origin, this.enemies.live, stats.radius)) {
      if (!enemy.active) continue;
      this.landed += 1;
      enemy.applyFrost(bombFrost(stats, this.rng));
      this.damage(enemy, stats.damage);
    }
    this.fx.burst('ice.nova', origin.x, origin.y, { scale: novaScale(stats.radius) });
  }
}
