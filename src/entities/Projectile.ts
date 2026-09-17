import Phaser from 'phaser';
import type { Vec2 } from '../core/input';

/** Half the 12 px `proj_fire` placeholder's width, so the body matches what is drawn. */
const BODY_RADIUS = 6;

/**
 * One fireball in flight (spec §5 "Fire — Fireball"): launched from the player
 * straight at where its target stood, at the spell's `speed`, until it hits an
 * enemy or has flown the spell's `range`.
 *
 * Pooled — never constructed per cast. `spells/FireballSpell.ts` owns the pool
 * and calls `fire` / `despawn`; an inactive projectile has its body disabled,
 * so it costs nothing until reused. It does not steer: an enemy that dies or
 * sidesteps is missed, and the shot expires at its range.
 */
export class Projectile extends Phaser.Physics.Arcade.Sprite {
  private firedFromX = 0;
  private firedFromY = 0;
  private range = 0;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, 'proj_fire');
  }

  /** Take this pooled object out of the pool at (x, y), flying at `target`. */
  fire(x: number, y: number, target: Readonly<Vec2>, speed: number, range: number): void {
    this.firedFromX = x;
    this.firedFromY = y;
    this.range = range;
    this.enableBody(true, x, y, true, true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BODY_RADIUS, this.width / 2 - BODY_RADIUS, this.height / 2 - BODY_RADIUS);
    this.scene.physics.moveTo(this, target.x, target.y, speed);
  }

  /** Return to the pool: inactive, invisible, body disabled. */
  despawn(): void {
    this.setVelocity(0, 0);
    this.disableBody(true, true);
  }

  /**
   * Whether the shot has flown its range without hitting anything. Measured
   * from where it was fired rather than timed, so a scaled run (`?timeScale=`)
   * expires it at the same spot.
   */
  get spent(): boolean {
    return (
      Phaser.Math.Distance.Between(this.firedFromX, this.firedFromY, this.x, this.y) >= this.range
    );
  }
}
