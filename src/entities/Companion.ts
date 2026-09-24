import Phaser from 'phaser';
import { COMPANION_DRAW_SCALE } from '../config/companions';
import { showSpriteClip } from '../render/animate';

/**
 * One companion ally on screen (#133). It is deliberately the thinnest entity
 * in the game: a plain sprite with no Arcade body at all.
 *
 * That is the acceptance criterion rather than an omission — a companion is not
 * damageable, does not block movement and does not collide with enemies, and
 * the way to guarantee all three is to give it nothing for the physics world to
 * overlap. `spells/CompanionSpell.ts` walks it with `core/companion.ts`'s
 * `stepPosition` and resolves its melee strikes by distance, the way
 * `OrbitingBodySpell` places the ring's bodies rather than driving them.
 *
 * It draws under the FX layer so an explosion is never hidden behind an ally.
 * Each companion plays its own sheet's clips (#184), chosen by
 * `core/animation.ts`'s `companionAnimation`; with no atlas it stays the green
 * placeholder disc.
 */
export class Companion extends Phaser.GameObjects.Sprite {
  /** Below the FX layer (depth 5) and above the arena grid. */
  static readonly DEPTH = 4;

  /** Test hook (#184): every clip this ally has started, in first-shown order. */
  readonly clipsShown = new Set<string>();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'companion');
    this.setOrigin(0.5, 0.5);
    this.setScale(COMPANION_DRAW_SCALE);
    this.setDepth(Companion.DEPTH);
    scene.add.existing(this);
  }

  /** Show clip `name`; `restart` replays an attack already on screen. */
  show(name: string, restart = false): void {
    if (showSpriteClip(this, name, restart)) this.clipsShown.add(name);
  }

  /** The clip on screen now, or null while it is the placeholder. */
  get clip(): string | null {
    return this.anims.currentAnim?.key ?? null;
  }
}
