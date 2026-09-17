import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { resolveCast } from '../core/chainLightning';
import type { Vec2 } from '../core/input';
import { Spell } from '../core/spell';
import type { LightningStats } from '../core/spellStats';
import type { EnemyPool } from '../systems/EnemyPool';
import type { DamageSink } from './DamageSink';

/** How long the arc FX takes to fade after a cast, in ms of scene time. Cosmetic. */
const ARC_FADE_MS = 150;
/** Arc line width in px. */
const ARC_WIDTH = 3;
/** The arc FX sits above enemies so a chain reads even in a crowd. */
const ARC_DEPTH = 5;

/**
 * Lightning (spec §5 "Lightning — Chain Lightning"): every `cooldown` s,
 * `strikes` bolts leave the caster. Each hits the nearest enemy for `damage`,
 * then chains up to `chains` times to the nearest unhit enemy within
 * `chainRange` for `damage * chainFalloff`. Every enemy struck is stunned for
 * `stun` s.
 *
 * The rules — where a bolt starts, who it jumps to, what each hit pays — live in
 * `core/chainLightning.ts`. A cast is instantaneous and resolved against the
 * live enemies geometrically, like Ice, so it puts no body in the world; the
 * arc is a set of line segments drawn once per cast and faded out.
 */
export class ChainLightningSpell extends Spell<'lightning'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly arcs: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<LightningStats>,
    damage: DamageSink,
  ) {
    super('lightning', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    // One Graphics, redrawn per cast: the fade is far shorter than any cooldown
    // a perk can reach, so two casts never need to be on screen at once.
    this.arcs = scene.add.graphics().setDepth(ARC_DEPTH).setVisible(false);
  }

  /** One cast. Positions are read before any damage lands, so a killing blow still draws to where the enemy stood. */
  protected cast(): void {
    const stats = this.stats;
    const bolts = resolveCast(this.caster, this.enemies.live, stats);
    if (bolts.length === 0) return;

    this.arcs.clear();
    this.arcs.lineStyle(ARC_WIDTH, PLACEHOLDERS.fx_bolt.color, 1);
    for (const bolt of bolts) {
      let from: Readonly<Vec2> = this.caster;
      for (const { target } of bolt) {
        this.arcs.lineBetween(from.x, from.y, target.x, target.y);
        from = { x: target.x, y: target.y };
      }
    }
    for (const bolt of bolts) {
      for (const { target, damage } of bolt) {
        target.applyStun(stats.stun);
        this.damage(target, damage);
      }
    }
    this.showArcs();
  }

  /** Flash the arcs drawn for this cast and fade them. */
  private showArcs(): void {
    const scene = this.arcs.scene;
    scene.tweens.killTweensOf(this.arcs);
    this.arcs.setAlpha(1).setVisible(true);
    scene.tweens.add({
      targets: this.arcs,
      alpha: 0,
      duration: ARC_FADE_MS,
      onComplete: () => this.arcs.setVisible(false),
    });
  }
}
