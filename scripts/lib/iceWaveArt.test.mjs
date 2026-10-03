import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ICE_WAVE_ART } from '../../src/config/iceLevels';
import { FRAMES } from '../../src/config/frames';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

/**
 * CO-227: `ICE_WAVE_ART` is how big the `ice.wave` ring is in the cut frames.
 * Re-measured here from the shipped atlas, so a re-cut that resizes or moves
 * the ring fails instead of drawing the frost off the rim that hits.
 */
describe('ice wave art (CO-227)', () => {
  for (let i = 0; i < 4; i += 1) {
    const name = `ice.wave.${i}`;
    it(`${name} holds its ring where ICE_WAVE_ART says`, () => {
      const info = FRAMES[name];
      const page = PNG.sync.read(readFileSync(join(ATLAS_DIR, `${info.page}.png`)));
      const atlas = JSON.parse(readFileSync(join(ATLAS_DIR, `${info.page}.json`), 'utf8'));
      const f = atlas.frames[name].frame;
      const dist = [];
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (let y = 0; y < f.h; y += 1) {
        for (let x = 0; x < f.w; x += 1) {
          if (page.data[((f.y + y) * page.width + f.x + x) * 4 + 3] <= 128) continue;
          dist.push(Math.hypot(x - info.anchorX, y - info.anchorY));
          box.x0 = Math.min(box.x0, x);
          box.x1 = Math.max(box.x1, x);
          box.y0 = Math.min(box.y0, y);
          box.y1 = Math.max(box.y1, y);
        }
      }
      dist.sort((a, b) => a - b);
      // The ring is drawn about the anchor: its box is centred on it (a broken
      // ring's centroid is not, so the box is what is held).
      expect(Math.abs((box.x0 + box.x1) / 2 - info.anchorX), 'box centre x').toBeLessThan(3);
      expect(Math.abs((box.y0 + box.y1) / 2 - info.anchorY), 'box centre y').toBeLessThan(3);
      const outer = dist[Math.floor(0.95 * (dist.length - 1))];
      expect(Math.abs(outer - ICE_WAVE_ART.outerRadius[i]), 'outer radius').toBeLessThan(3);
    });
  }

  it('the ring grows over its frames', () => {
    const r = ICE_WAVE_ART.outerRadius;
    for (let i = 1; i < r.length; i += 1) expect(r[i]).toBeGreaterThan(r[i - 1]);
  });
});
