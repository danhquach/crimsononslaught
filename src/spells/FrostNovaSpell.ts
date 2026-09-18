import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { FX_DEPTH } from '../config/fx';
import { pulseDamage, pulseTargets, rollFreeze } from '../core/frostNova';
import { novaScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import { Spell } from '../core/spell';
import type { IceStats } from '../core/spellStats';
import { showEffect } from '../render/animate';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** With no atlas, how long the placeholder ring takes to fade after a pulse, in ms of scene time. */
const RING_FADE_MS = 250;
/** The pulse clip (CO-082). */
const NOVA_CLIP = 'ice.nova';

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
 *
 * FX (CO-082): `ice.nova` plays once per pulse at the caster, scaled to the
 * live `radius`, and `ice.shatter` bursts on every enemy Shatter paid out on.
 * The frost on a slowed enemy and the block on a frozen one are the overlay
 * pool's, driven from its status.
 */
export class FrostNovaSpell extends Spell<'ice'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly rng: Rng;
  private readonly fx: FxPool;
  private readonly ring: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<IceStats>,
    damage: DamageSink,
    rng: Rng,
    fx: FxPool,
  ) {
    super('ice', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.fx = fx;
    // One ring, reused per pulse: the clip is far shorter than any cooldown a
    // perk can reach, so two pulses never need to be on screen at once.
    this.ring = scene.add
      .sprite(caster.x, caster.y, 'fx_nova')
      .setDepth(FX_DEPTH)
      .setVisible(false);
    this.ring.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.ring.setVisible(false));
  }

  /** One pulse. Shatter is decided before this pulse's own slow lands, so it sees the *previous* one. */
  protected cast(): void {
    const stats = this.stats;
    const { slowPct, slowDuration, freezeChance, shatterBonus } = stats;
    for (const enemy of pulseTargets(this.caster, this.enemies.live, stats.radius)) {
      const shattered = enemy.slowed && shatterBonus > 0;
      const amount = pulseDamage(stats, enemy.slowed);
      if (shattered) this.fx.burst('ice.shatter', enemy.x, enemy.y);
      enemy.applyFrost({ slowPct, slowDuration, freeze: rollFreeze(this.rng, freezeChance) });
      this.damage(enemy, amount);
    }
    this.showRing(stats.radius);
  }

  /** Play the pulse at its true radius; with no atlas, flash the placeholder ring and fade it. */
  private showRing(radius: number): void {
    const { x, y } = this.caster;
    const scene = this.ring.scene;
    scene.tweens.killTweensOf(this.ring);
    this.ring.anims.stop();
    this.ring.setPosition(x, y).setAlpha(1).setVisible(true);
    if (showEffect(this.ring, NOVA_CLIP)) {
      this.ring.setScale(novaScale(radius));
      return;
    }
    this.ring.setScale((radius * 2) / PLACEHOLDERS.fx_nova.width);
    scene.tweens.add({
      targets: this.ring,
      alpha: 0,
      duration: RING_FADE_MS,
      onComplete: () => this.ring.setVisible(false),
    });
  }
}
