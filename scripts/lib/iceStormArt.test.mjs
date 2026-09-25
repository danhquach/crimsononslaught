import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ART_BOXES, FRAMES } from '../../src/config/frames';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

/**
 * The art pixels of one cut frame, as distances from its anchor, and where
 * their centroid and box sit relative to the anchor.
 */
function measure(name) {
  const info = FRAMES[name];
  const page = PNG.sync.read(readFileSync(join(ATLAS_DIR, `${info.page}.png`)));
  const atlas = JSON.parse(readFileSync(join(ATLAS_DIR, `${info.page}.json`), 'utf8'));
  const f = atlas.frames[name].frame;
  const dist = [];
  let sx = 0;
  let sy = 0;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = 0; y < f.h; y += 1) {
    for (let x = 0; x < f.w; x += 1) {
      if (page.data[((f.y + y) * page.width + f.x + x) * 4 + 3] <= 128) continue;
      const dx = x + 0.5 - info.anchorX;
      const dy = y + 0.5 - info.anchorY;
      dist.push(Math.hypot(dx, dy));
      sx += dx;
      sy += dy;
      box.x0 = Math.min(box.x0, dx);
      box.y0 = Math.min(box.y0, dy);
      box.x1 = Math.max(box.x1, dx);
      box.y1 = Math.max(box.y1, dy);
    }
  }
  dist.sort((a, b) => a - b);
  const at = (share) => dist[Math.floor(share * (dist.length - 1))];
  return {
    dist,
    at,
    centroid: { x: sx / dist.length, y: sy / dist.length },
    box,
  };
}

/**
 * CO-144: the Ice Storm art is drawn the way `systems/AreaPool.ts` places it.
 * Re-measured here from the shipped atlas, so a re-cut that tilts or moves the
 * art fails instead of drawing the sleet across its fall or a splash off the
 * spot where the ice lands.
 */
describe('ice storm art (CO-144)', () => {
  for (let i = 0; i < 4; i += 1) {
    it(`ice.stormSleet.${i} lies flat along its anchor row, so turning it lays it along its fall`, () => {
      const { dist, centroid, box } = measure(`ice.stormSleet.${i}`);
      expect(dist.length, 'art').toBeGreaterThan(0);
      expect(Math.abs(centroid.y), 'on the anchor row').toBeLessThan(1);
      // Its head is at the right: no art reaches further left of the anchor
      // than right of it. A pellet's and a flake's faint tails are lost to the
      // downscale, which leaves their heads right of the anchor.
      expect(box.x1, 'head to the right').toBeGreaterThanOrEqual(-box.x0 - 1);
    });
  }

  it('ice.stormSleet pieces are long and thin streaks', () => {
    const box = ART_BOXES['ice.stormSleet'];
    expect(box.w / box.h, 'streak shape').toBeGreaterThan(4);
  });

  it('ice.stormShard bursts at its anchor in its last two frames', () => {
    for (const i of [2, 3]) {
      const { centroid } = measure(`ice.stormShard.${i}`);
      expect(Math.hypot(centroid.x, centroid.y), `frame ${i}`).toBeLessThan(2.5);
    }
  });
});
