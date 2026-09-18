import Phaser from 'phaser';
import { ANIMATIONS, STATIC_FRAMES } from '../config/animations';
import { TEXTURE_KEYS } from '../config/colors';
import { ATLAS_DATA, ATLAS_KEY, ATLAS_TEXTURE, FRAMES } from '../config/frames';

/**
 * Load and install the sprite atlas cut by `npm run art:cut` (CO-080).
 *
 * Two steps, because Phaser needs the file loaded before anything can be built
 * from it: `queueAtlas` in `preload`, `installAtlas` in `create`.
 */
export function queueAtlas(scene: Phaser.Scene): void {
  scene.load.atlas(ATLAS_KEY, ATLAS_TEXTURE, ATLAS_DATA);
}

/**
 * A missing or broken atlas is one console warning, not a crash (CO-081).
 * Checked after `preload` rather than on the loader's error event: a file that
 * downloads but will not parse (a dev server answering a 404 with its page)
 * fails in processing and never raises that event, but either way the key
 * never reaches the texture manager, `installAtlas` finds nothing to install,
 * and every entity boots on its placeholder shape. Phaser logs its own errors
 * for the failed files on top of this.
 */
export function warnIfAtlasMissing(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_KEY)) return;
  console.warn(`[atlas] ${ATLAS_TEXTURE} did not load; using placeholder shapes`);
}

/**
 * Register every animation and point the existing texture keys at the art.
 *
 * Entities still ask for a `TextureKey` and still get a still image, so nothing
 * that draws one changes (spec §6): each key becomes its own texture backed by
 * the matching atlas frame. `generatePlaceholderTextures` skips any key that
 * already exists, so calling this first is what swaps art in for placeholders.
 *
 * Safe to call twice; returns the keys it aliased.
 */
export function installAtlas(scene: Phaser.Scene): string[] {
  if (!scene.textures.exists(ATLAS_KEY)) return [];

  // The sheets are pixel art downscaled to native size, so the atlas must be
  // sampled nearest-neighbour or every sprite renders soft. Set on the atlas
  // alone rather than globally, to leave the placeholder shapes as they were.
  scene.textures.get(ATLAS_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);

  const aliased: string[] = [];
  for (const key of TEXTURE_KEYS) {
    if (scene.textures.exists(key)) continue;
    const frameName = STATIC_FRAMES[key];
    // No sheet for this key yet (Phase 2 §10): it keeps its generated
    // placeholder, which `generatePlaceholderTextures` makes for every key.
    if (!frameName) continue;
    const info = FRAMES[frameName];
    const canvas = scene.textures.createCanvas(key, info.w, info.h);
    if (!canvas) continue;
    canvas.drawFrame(ATLAS_KEY, frameName, 0, 0);
    canvas.refresh();
    canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
    aliased.push(key);
  }

  for (const anim of ANIMATIONS) {
    if (scene.anims.exists(anim.name)) continue;
    scene.anims.create({
      key: anim.name,
      frames: anim.frames.map((frame) => ({ key: ATLAS_KEY, frame })),
      frameRate: anim.frameRate,
      repeat: anim.repeat,
    });
  }

  return aliased;
}
