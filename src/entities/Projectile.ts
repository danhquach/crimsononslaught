import Phaser from 'phaser';
import { PLACEHOLDERS, type TextureKey } from '../config/colors';
import { flightRotation } from '../core/fx';
import type { Vec2 } from '../core/input';
import { clearClip, showClip } from '../render/animate';

/** How a shot is drawn: which texture it wears, and the flight clip it plays. */
export interface ProjectileLook {
  readonly texture: TextureKey;
  /** The clip it plays in the air (CO-082), drawn flying right; none = a still disc. */
  readonly clip?: string;
}

/** Fire's fireball, on its own flight clip since CO-153: `fire.fly` stays the dragon's and the companion's shot. */
const FIREBALL: ProjectileLook = { texture: 'proj_fire', clip: 'fire.ball' };

/**
 * One shot in flight (spec §5 "Fire — Fireball"): launched straight at where
 * its target stood, at the spell's `speed`, until it hits an enemy or has flown
 * the spell's `range`.
 *
 * Pooled — never constructed per cast. The spell owns the pool and calls
 * `fire` / `despawn`; an inactive projectile has its body disabled, so it costs
 * nothing until reused. It does not steer: an enemy that dies or sidesteps is
 * missed, and the shot expires at its range.
 *
 * `fire` takes the look to wear, because more than one spell shoots now (#133):
 * a companion's bolt is its own element's, not Fire's. The body is the drawn
 * disc's circle whichever that is, and a look with no clip — an element whose
 * flight art is still #145's — simply flies as its placeholder disc.
 */
export class Projectile extends Phaser.Physics.Arcade.Sprite {
  private firedFromX = 0;
  private firedFromY = 0;
  private range = 0;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, FIREBALL.texture);
  }

  /** Take this pooled object out of the pool at (x, y), flying at `target`. */
  fire(
    x: number,
    y: number,
    target: Readonly<Vec2>,
    speed: number,
    range: number,
    look: ProjectileLook = FIREBALL,
  ): void {
    this.firedFromX = x;
    this.firedFromY = y;
    this.range = range;
    // Half the placeholder's width, so the body matches what is drawn whichever
    // look this pooled shot wore last time.
    const radius = PLACEHOLDERS[look.texture].width / 2;
    clearClip(this);
    this.setTexture(look.texture);
    this.setOrigin(0.5, 0.5);
    this.enableBody(true, x, y, true, true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
    this.scene.physics.moveTo(this, target.x, target.y, speed);
    // Straight flight: the heading is fixed at launch, so it is set once here.
    this.setRotation(flightRotation(body.velocity, 0));
    if (look.clip) showClip(this, look.clip, radius);
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
