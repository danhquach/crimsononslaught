import Phaser from 'phaser';
import { gemAnimation } from '../core/animation';
import { gemDrift, type Vec2 } from '../core/gems';
import { clearClip, clipDurationMs, showClip } from '../render/animate';

/** Half the 12 px placeholder diamond's width; the atlas frames are placed around it (CO-081). */
const BODY_RADIUS = 6;

/**
 * One XP gem (spec §5): dropped where an enemy died, motionless until the
 * player comes within the pickup radius, then drifting into them.
 *
 * Pooled — never constructed per drop. `systems/GemPool.ts` owns the pool and
 * calls `spawn` / `despawn`; an inactive gem has its body disabled, so it costs
 * nothing until reused.
 *
 * It shows the atlas clip for what it is doing (CO-081): `idle` lying there,
 * `drift` once in range, and `pickup` bursting where the player took it —
 * body off, still `active` so the pool cannot hand it out — before it is
 * released. With no atlas the burst has no length and the gem leaves at once.
 *
 * All the decisions live in `core/gems.ts`; this class only moves the sprite.
 */
export class XpGem extends Phaser.Physics.Arcade.Sprite {
  /** Run-clock ms of pickup clip left; the gem is released when it runs out. */
  private burstMs = 0;
  private collected = false;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, 'gem');
  }

  /** Taken by the player and bursting: worth nothing more, not yet back in the pool. */
  get isCollected(): boolean {
    return this.collected;
  }

  /** Take this pooled object out of the pool, lying still at (x, y). */
  spawn(x: number, y: number): void {
    this.collected = false;
    this.burstMs = 0;
    clearClip(this);
    this.setTexture('gem');
    this.setOrigin(0.5, 0.5);
    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BODY_RADIUS, this.width / 2 - BODY_RADIUS, this.height / 2 - BODY_RADIUS);
    this.show(false);
  }

  /** Return to the pool: inactive, invisible, body disabled. */
  despawn(): void {
    this.setVelocity(0, 0);
    this.disableBody(true, true);
  }

  /** Driven by `GemPool`, not Phaser, so a paused Game freezes the gems with it. */
  drift(deltaMs: number, target: Readonly<Vec2>, radius: number): void {
    if (this.collected) {
      this.burstMs -= deltaMs;
      if (this.burstMs <= 0) this.despawn();
      return;
    }
    const { x, y } = gemDrift(this, target, radius);
    this.setVelocity(x, y);
    this.show(x !== 0 || y !== 0);
  }

  /**
   * The player touched it: the XP is theirs (the pool counts it), the body is
   * gone so it cannot pay twice, and the burst plays where they stood.
   */
  collect(at: Readonly<Vec2>): void {
    this.collected = true;
    this.setPosition(at.x, at.y);
    this.setVelocity(0, 0);
    this.disableBody(false, false);
    this.burstMs = this.show(false);
    if (this.burstMs <= 0) this.despawn();
  }

  /** The clip for this step; returns its run-clock length for the burst to wait on. */
  private show(drifting: boolean): number {
    const name = gemAnimation({ drifting, collected: this.collected });
    showClip(this, name, BODY_RADIUS);
    return clipDurationMs(this.scene, name);
  }
}
