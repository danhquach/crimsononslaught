import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { crop, edgesTouched, opaqueBounds } from './spriteCut.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');
const PAGES = readdirSync(ATLAS_DIR)
  .filter((file) => /^props\d*\.json$/.test(file))
  .map((file) => file.replace(/\.json$/, ''));

/**
 * The shipped atlas, not the cutter's intent: every frame keeps clear space on
 * all four sides, so no art is ever shaved flat against its own boundary
 * (CO-127). Measured the way the cutter measures a cell, with `opaqueBounds`,
 * so a soft glow's faint tail or a quantise-lifted stray is not art.
 */
describe('atlas frame margin (CO-127)', () => {
  it('finds the atlas pages', () => {
    expect(PAGES.length).toBeGreaterThan(0);
  });

  for (const page of PAGES) {
    it(`keeps every frame on ${page} clear of its edge`, () => {
      const png = PNG.sync.read(readFileSync(join(ATLAS_DIR, `${page}.png`)));
      const img = { width: png.width, height: png.height, data: png.data };
      const { frames } = JSON.parse(readFileSync(join(ATLAS_DIR, `${page}.json`), 'utf8'));
      const flush = [];
      for (const [name, { frame }] of Object.entries(frames)) {
        const bounds = opaqueBounds(crop(img, frame));
        if (!bounds) continue;
        const sides = edgesTouched(bounds, { x: 0, y: 0, w: frame.w, h: frame.h });
        if (sides.length > 0) flush.push(`${name} (${sides.join(', ')})`);
      }
      expect(flush).toEqual([]);
    });
  }
});
