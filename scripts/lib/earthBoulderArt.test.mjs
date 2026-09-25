import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FRAMES } from '../../src/config/frames';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

/** Visible pixels of one cut frame whose red and blue both stand 30 over green. */
function purplePixels(name) {
  const info = FRAMES[name];
  const page = PNG.sync.read(readFileSync(join(ATLAS_DIR, `${info.page}.png`)));
  const atlas = JSON.parse(readFileSync(join(ATLAS_DIR, `${info.page}.json`), 'utf8'));
  const f = atlas.frames[name].frame;
  const found = [];
  for (let y = 0; y < f.h; y += 1) {
    for (let x = 0; x < f.w; x += 1) {
      const i = ((f.y + y) * page.width + f.x + x) * 4;
      const [r, g, b, a] = page.data.subarray(i, i + 4);
      if (a >= 8 && r > g + 30 && b > g + 30) found.push(`${x},${y}`);
    }
  }
  return found;
}

/**
 * CO-146: the boulder's frames ship with no magenta left on their rims — the
 * spin and impact from the CO-146 sheets, the dust from CO-079. Measured on the
 * shipped atlas, so a re-cut that drops `maxMagenta` from either sheet, or a
 * palette that snaps a rim pixel back to purple, fails here.
 */
describe('earth boulder art (CO-146)', () => {
  const names = Object.keys(FRAMES).filter((n) => /^earth\.(spin|impact|dust)\./.test(n));

  it('covers every frame: six spin, four impact, five dust', () => {
    expect(names).toHaveLength(15);
  });

  for (const name of names) {
    it(`${name} has no magenta pixel`, () => {
      expect(purplePixels(name)).toEqual([]);
    });
  }
});
