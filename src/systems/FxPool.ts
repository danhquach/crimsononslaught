import Phaser from 'phaser';
import { FX_DEPTH, MAX_LIVE_FX } from '../config/fx';
import { ATLAS_KEY } from '../config/frames';
import { showEffect } from '../render/animate';

/** How a burst is placed: drawn at `scale`, turned by `rotation`, mirrored on `flipX`. */
export interface BurstOptions {
  readonly scale?: number;
  readonly rotation?: number;
  readonly flipX?: boolean;
}

/**
 * One-shot spell effects (CO-082): an explosion, an impact, a nova, a puff of
 * dust. A pool of plain sprites, mirroring the entity pools: `burst` takes one,
 * plays the clip once where asked, and the sprite frees itself when the clip
 * ends. Past `MAX_LIVE_FX` a burst is dropped, never queued.
 *
 * The clips run on Phaser's clock, like every entity clip (CO-081): a paused
 * scene holds them, a scaled run does not speed them up. With no atlas there
 * is nothing to play and `burst` is a no-op.
 */
export class FxPool {
  private readonly group: Phaser.GameObjects.Group;

  constructor(scene: Phaser.Scene) {
    this.group = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_FX,
      createCallback: (child) => {
        const sprite = child as Phaser.GameObjects.Sprite;
        sprite.setDepth(FX_DEPTH);
        sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
          this.group.killAndHide(sprite),
        );
      },
    });
  }

  /** Bursts playing right now. */
  get count(): number {
    return this.group.countActive(true);
  }

  /** Play `clip` once at (x, y). Returns whether anything was shown. */
  burst(clip: string, x: number, y: number, options: BurstOptions = {}): boolean {
    if (!this.group.scene.anims.exists(clip)) return false;
    const sprite = this.group.get(x, y, ATLAS_KEY) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return false;
    sprite
      .setActive(true)
      .setVisible(true)
      .setPosition(x, y)
      .setScale(options.scale ?? 1)
      .setRotation(options.rotation ?? 0)
      .setFlipX(options.flipX ?? false);
    // A recycled sprite may still hold its last clip; `showEffect` restarts it.
    sprite.anims.stop();
    return showEffect(sprite, clip);
  }
}
