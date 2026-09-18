import Phaser from 'phaser';
import { PLACEHOLDERS, TEXTURE_KEYS, type Placeholder, type TextureKey } from '../config/colors';

/**
 * Generate one texture per `TextureKey` from `config/colors.ts`.
 *
 * Idempotent: a key that already exists in the texture manager is left
 * untouched. `render/atlas.ts` runs first and claims every key the sprite
 * atlas supplies, so this only fills the gaps — which is what lets art replace
 * placeholders key by key, and what keeps the game running if the atlas fails
 * to load (see README "Rendering and the art pipeline").
 *
 * @returns the keys that were generated in this call.
 */
export function generatePlaceholderTextures(scene: Phaser.Scene): TextureKey[] {
  const generated: TextureKey[] = [];
  for (const key of TEXTURE_KEYS) {
    if (scene.textures.exists(key)) continue;
    const spec = PLACEHOLDERS[key];
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g, spec);
    g.generateTexture(key, spec.width, spec.height);
    g.destroy();
    generated.push(key);
  }
  return generated;
}

function draw(g: Phaser.GameObjects.Graphics, spec: Placeholder): void {
  const { width: w, height: h, color } = spec;
  const cx = w / 2;
  const cy = h / 2;
  g.fillStyle(color, 1);
  switch (spec.shape) {
    case 'circle':
      g.fillCircle(cx, cy, Math.min(w, h) / 2);
      break;
    case 'rect':
      g.fillRect(0, 0, w, h);
      break;
    case 'triangle':
      // Points up.
      g.fillTriangle(cx, 0, w, h, 0, h);
      break;
    case 'diamond':
      g.fillPoints(
        [
          { x: cx, y: 0 },
          { x: w, y: cy },
          { x: cx, y: h },
          { x: 0, y: cy },
        ],
        true,
      );
      break;
    case 'ring':
      g.lineStyle(spec.thickness, color, 1);
      g.strokeCircle(cx, cy, Math.min(w, h) / 2 - spec.thickness / 2);
      break;
  }
}
