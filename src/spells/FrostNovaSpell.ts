import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { pulseDamage, pulseTargets, rollFreeze } from '../core/frostNova';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import { Spell } from '../core/spell';
import type { IceStats } from '../core/spellStats';
import type { EnemyPool } from '../systems/EnemyPool';
import type { DamageSink } from './DamageSink';

/** How long the ring FX takes to fade after a pulse, in ms of scene time. Cosmetic. */
const RING_FADE_MS = 250;
/** The ring FX sits above enemies so a pulse reads even in a crowd. */
const RING_DEPTH = 5;

/**
 * Ice (spec §5 "Ice — Frost Nova"): every `cooldown` s a ring of `radius`
 * pulses out from the caster. Every enemy inside takes `damage` — more with
 * Shatter if it was already slowed — then is slowed by `slowPct` for
 * `slowDuration` s, and may be frozen solid for a second on `freezeChance`.
 *
 * The rules — targets, stacking, Shatter, the freeze roll — live in
 * `core/frostNova.ts`. The pulse is instantaneous and resolved against the
 * live enemies geometrically, so unlike Fire it puts no body in the world and
 * needs no overlap; the ring sprite is only ever drawn.
 */
export class FrostNovaSpell extends Spell<'ice'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly rng: Rng;
  private readonly ring: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<IceStats>,
    damage: DamageSink,
    rng: Rng,
  ) {
    super('ice', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    // One ring, reused per pulse: the fade is far shorter than any cooldown a
    // perk can reach, so two pulses never need to be on screen at once.
    this.ring = scene.add
      .image(caster.x, caster.y, 'fx_nova')
      .setDepth(RING_DEPTH)
      .setVisible(false);
  }

  /** One pulse. Shatter is decided before this pulse's own slow lands, so it sees the *previous* one. */
  protected cast(): void {
    const stats = this.stats;
    const { slowPct, slowDuration, freezeChance } = stats;
    for (const enemy of pulseTargets(this.caster, this.enemies.live, stats.radius)) {
      const amount = pulseDamage(stats, enemy.slowed);
      enemy.applyFrost({ slowPct, slowDuration, freeze: rollFreeze(this.rng, freezeChance) });
      this.damage(enemy, amount);
    }
    this.showRing(stats.radius);
  }

  /** Flash the ring at the pulse's true radius and fade it. */
  private showRing(radius: number): void {
    const { x, y } = this.caster;
    const scene = this.ring.scene;
    scene.tweens.killTweensOf(this.ring);
    this.ring
      .setPosition(x, y)
      .setScale((radius * 2) / PLACEHOLDERS.fx_nova.width)
      .setAlpha(1)
      .setVisible(true);
    scene.tweens.add({
      targets: this.ring,
      alpha: 0,
      duration: RING_FADE_MS,
      onComplete: () => this.ring.setVisible(false),
    });
  }
}
