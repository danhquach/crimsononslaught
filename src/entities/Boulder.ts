import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';

/**
 * One boulder on the ring (spec §5 "Earth — Orbiting Boulders"). It has no
 * motion of its own: `spells/OrbitingBouldersSpell.ts` places it every frame
 * from the orbit maths in `core/orbitingBoulders.ts`, and Arcade reads the new
 * position on its next step, so the body is where the sprite is drawn.
 *
 * Pooled — never constructed per perk. The spell owns the pool and calls
 * `spawn` / `despawn`; an inactive boulder has its body disabled, so it costs
 * nothing until the count perk brings it back.
 */
export class Boulder extends Phaser.Physics.Arcade.Sprite {
  private radius = 0;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, 'boulder');
  }

  /** Take this pooled object out of the pool at (x, y) as a boulder of `size` px radius. */
  spawn(x: number, y: number, size: number): void {
    this.enableBody(true, x, y, true, true);
    // The body is a circle filling the unscaled placeholder disc; `resize`
    // scales the sprite, and Arcade scales the body with it, so the hitbox
    // stays the disc whatever size this pooled boulder was last time.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLACEHOLDERS.boulder.width / 2, 0, 0);
    this.radius = 0;
    this.resize(size);
  }

  /** Return to the pool: inactive, invisible, body disabled. */
  despawn(): void {
    this.disableBody(true, true);
  }

  /**
   * Match the drawn disc — and with it the body — to `size` px radius (spec
   * §5: the Boulder Growth perk grows both). A no-op when nothing changed, so
   * it is cheap to call per frame.
   */
  resize(size: number): void {
    if (size === this.radius) return;
    this.radius = size;
    this.setScale((size * 2) / PLACEHOLDERS.boulder.width);
  }
}
