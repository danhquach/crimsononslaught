import type Phaser from 'phaser';
import { FRAMES, type FrameName } from '../config/frames';
import { artFrame } from '../core/animation';

/**
 * Whether `frame` can be drawn as art (CO-154): true only once `installAtlas`
 * has run, which it does for every page or none. A page that loaded while
 * another did not still exists, so checking the page alone would draw an icon
 * in a run where every other entity is a placeholder (CO-130).
 */
export function hasIconArt(scene: Phaser.Scene, frame: FrameName): boolean {
  const { page } = FRAMES[frame];
  return scene.textures.exists(page) && scene.textures.get(page).has(artFrame(frame));
}
