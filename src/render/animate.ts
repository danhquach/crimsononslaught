import Phaser from 'phaser';
import { ANIMATIONS } from '../config/animations';
import { FRAMES } from '../config/frames';
import { animationDurationMs, bodyOffset, frameOrigin } from '../core/animation';

const FIRST_FRAME = new Map(ANIMATIONS.map((anim) => [anim.name, anim.frames[0]]));

/**
 * Show clip `name` on a pooled Arcade sprite (CO-081).
 *
 * The clip's frames may be any size, so the origin is moved onto the frame's
 * anchor and the circle body re-centred on it: the drawn character and the
 * hitbox both stay on the sprite's position, and the radius stays the config's
 * (`core/animation.ts`). A clip already showing is left alone, so a loop is
 * not restarted every step and a finished one-shot holds its last frame.
 *
 * Returns false, touching nothing, when the atlas did not supply the clip —
 * the sprite keeps its placeholder shape and centred body, so a missing atlas
 * only costs the animation.
 */
export function showClip(
  sprite: Phaser.Physics.Arcade.Sprite,
  name: string,
  bodyRadius: number,
  flipX = false,
): boolean {
  const first = FIRST_FRAME.get(name);
  if (!first || !sprite.scene.anims.exists(name)) return false;
  sprite.setFlipX(flipX);
  if (sprite.anims.currentAnim?.key === name) return true;

  sprite.play(name);
  const info = FRAMES[first];
  const origin = frameOrigin(info);
  const offset = bodyOffset(info, bodyRadius);
  sprite.setOrigin(origin.x, origin.y);
  (sprite.body as Phaser.Physics.Arcade.Body).setCircle(bodyRadius, offset.x, offset.y);
  return true;
}

/** Run-clock length of `name`, or 0 when the atlas did not supply it and there is nothing to wait for. */
export function clipDurationMs(scene: Phaser.Scene, name: string): number {
  return scene.anims.exists(name) ? animationDurationMs(name) : 0;
}

/**
 * Back to a still placeholder: stop whatever clip was showing and forget it,
 * so the next `showClip` of the same name starts it from its first frame.
 */
export function clearClip(sprite: Phaser.Physics.Arcade.Sprite): void {
  sprite.anims.stop();
  sprite.anims.currentAnim = null;
  sprite.setFlipX(false);
  sprite.setFlipY(false);
  sprite.setRotation(0);
}

/**
 * Play one-shot or looping effect `name` on a plain (non-Arcade) sprite
 * (CO-082): origin moved onto the frame's anchor so the effect lands on the
 * sprite's position whatever the frame was trimmed to. Returns false, touching
 * nothing, when the atlas did not supply the clip.
 */
export function showEffect(sprite: Phaser.GameObjects.Sprite, name: string): boolean {
  const first = FIRST_FRAME.get(name);
  if (!first || !sprite.scene.anims.exists(name)) return false;
  const origin = frameOrigin(FRAMES[first]);
  sprite.setOrigin(origin.x, origin.y);
  sprite.play(name);
  return true;
}

/**
 * `showClip` for a plain sprite with no body (#184, the companion): origin moved
 * onto the clip's first-frame anchor, and a clip already showing left alone so
 * a loop is not restarted every step — unless `restart`, which replays a
 * one-shot that has already finished on its last frame. Returns false, touching
 * nothing, when the atlas did not supply the clip, so the placeholder stays.
 */
export function showSpriteClip(
  sprite: Phaser.GameObjects.Sprite,
  name: string,
  restart = false,
): boolean {
  const first = FIRST_FRAME.get(name);
  if (!first || !sprite.scene.anims.exists(name)) return false;
  if (!restart && sprite.anims.currentAnim?.key === name) return true;
  sprite.play(name);
  const origin = frameOrigin(FRAMES[first]);
  sprite.setOrigin(origin.x, origin.y);
  return true;
}
