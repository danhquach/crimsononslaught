import type Phaser from 'phaser';
import { FRAMES } from '../config/frames';
import type { BarArt } from '../config/hud';
import { artFrame } from '../core/animation';

/** Texture key and frame names of a bar frame cut into its three pieces. */
export interface BarSlices {
  readonly page: string;
  readonly left: string;
  readonly middle: string;
  readonly right: string;
}

/**
 * Cut a HUD bar's frame into left cap, middle and right cap (CO-156): three
 * frames on its own atlas page, over the frame's art box, the way
 * `installAtlas` adds the `.art` frame. Registered once per game, so a
 * restarted HUD reuses them. Needs the atlas installed (`hasFrameArt`).
 *
 * A three-piece frame rather than Phaser's `NineSlice`, which in 3.88 draws on
 * WebGL only; the game is `Phaser.AUTO` and may fall back to Canvas.
 */
export function barSlices(scene: Phaser.Scene, art: BarArt): BarSlices {
  const { page } = FRAMES[art.frame];
  const whole = artFrame(art.frame);
  const slices = { page, left: `${whole}.l`, middle: `${whole}.m`, right: `${whole}.r` };
  const texture = scene.textures.get(page);
  if (texture.has(slices.left)) return slices;

  const { sourceIndex, cutX, cutY, cutWidth, cutHeight } = texture.get(whole);
  const middle = cutWidth - art.capLeft - art.capRight;
  texture.add(slices.left, sourceIndex, cutX, cutY, art.capLeft, cutHeight);
  texture.add(slices.middle, sourceIndex, cutX + art.capLeft, cutY, middle, cutHeight);
  texture.add(
    slices.right,
    sourceIndex,
    cutX + cutWidth - art.capRight,
    cutY,
    art.capRight,
    cutHeight,
  );
  return slices;
}
