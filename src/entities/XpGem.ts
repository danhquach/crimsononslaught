import Phaser from 'phaser';
import { gemDrift, type Vec2 } from '../core/gems';

/** Half the 12 px placeholder diamond's width, so the body matches what is drawn. */
const BODY_RADIUS = 6;

/**
 * One XP gem (spec §5): dropped where an enemy died, motionless until the
 * player comes within the pickup radius, then drifting into them.
 *
 * Pooled — never constructed per drop. `systems/GemPool.ts` owns the pool and
 * calls `spawn` / `despawn`; an inactive gem has its body disabled, so it costs
 * nothing until reused.
 *
 * All the decisions live in `core/gems.ts`; this class only moves the sprite.
 */
export class XpGem extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, 'gem');
  }

  /** Take this pooled object out of the pool, lying still at (x, y). */
  spawn(x: number, y: number): void {
    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BODY_RADIUS, this.width / 2 - BODY_RADIUS, this.height / 2 - BODY_RADIUS);
  }

  /** Return to the pool: inactive, invisible, body disabled. */
  despawn(): void {
    this.setVelocity(0, 0);
    this.disableBody(true, true);
  }

  /** Driven by `GemPool`, not Phaser, so a paused Game freezes the gems with it. */
  drift(target: Readonly<Vec2>, radius: number): void {
    const { x, y } = gemDrift(this, target, radius);
    this.setVelocity(x, y);
  }
}
