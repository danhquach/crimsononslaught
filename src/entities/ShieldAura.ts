import Phaser from 'phaser';

/**
 * The Ice Shield's layer on screen (#134): a ring drawn around the player while
 * the pool holds, gone the moment it breaks.
 *
 * Like `entities/Companion.ts` it carries no Arcade body at all. That is the
 * point rather than an omission — a shield is not something the world collides
 * with, it is a number in front of the player's HP (`core/shield.ts`), and
 * `spells/IceShieldSpell.ts` moves this sprite onto the player every frame the
 * way the companion is stepped.
 *
 * It fades with the pool, so a shield about to break reads as one. Its own art
 * is #145; until then it is the pale ring placeholder.
 */
export class ShieldAura extends Phaser.GameObjects.Sprite {
  /** Above the player and the FX layer, so the layer reads as being in front. */
  static readonly DEPTH = 6;

  /** Alpha at an empty pool and at a full one; in between it follows the pool. */
  static readonly MIN_ALPHA = 0.35;
  static readonly MAX_ALPHA = 0.9;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'shield_ice');
    this.setOrigin(0.5, 0.5);
    this.setDepth(ShieldAura.DEPTH);
    scene.add.existing(this);
  }

  /**
   * Draw the layer around `centre` at `fill` (0-1) of its pool. A shield that
   * is down is hidden outright rather than drawn at zero alpha, so nothing of
   * it is left on screen between a break and its return.
   */
  show(centre: Readonly<{ x: number; y: number }>, fill: number): void {
    const held = Number.isFinite(fill) ? Math.min(1, Math.max(0, fill)) : 0;
    this.setPosition(centre.x, centre.y);
    this.setVisible(held > 0);
    const { MIN_ALPHA, MAX_ALPHA } = ShieldAura;
    this.setAlpha(MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * held);
  }
}
