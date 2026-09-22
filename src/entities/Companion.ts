import Phaser from 'phaser';

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
 * Facings and an attack clip arrive with its character sheet (#146); until then
 * it is the green placeholder disc.
 */
export class Companion extends Phaser.GameObjects.Sprite {
  /** Below the FX layer (depth 5) and above the arena grid. */
  static readonly DEPTH = 4;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'companion');
    this.setOrigin(0.5, 0.5);
    this.setDepth(Companion.DEPTH);
    scene.add.existing(this);
  }
}
