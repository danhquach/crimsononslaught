import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FRAMES } from '../../src/config/frames';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

const pages = new Map();
function page(key) {
  if (!pages.has(key)) {
    pages.set(key, {
      png: PNG.sync.read(readFileSync(join(ATLAS_DIR, `${key}.png`))),
      atlas: JSON.parse(readFileSync(join(ATLAS_DIR, `${key}.json`), 'utf8')),
    });
  }
  return pages.get(key);
}

/**
 * Visible pixels of one cut frame whose red and blue both stand 30 over green,
 * split into pink (green at least half the lower of red and blue, as the
 * ghost is drawn) and magenta (the key's fringe, next to no green).
 */
function purplePixels(name) {
  const { png, atlas } = page(FRAMES[name].page);
  const f = atlas.frames[name].frame;
  const found = { magenta: [], pink: [] };
  for (let y = 0; y < f.h; y += 1) {
    for (let x = 0; x < f.w; x += 1) {
      const i = ((f.y + y) * png.width + f.x + x) * 4;
      const [r, g, b, a] = png.data.subarray(i, i + 4);
      if (a < 8 || r <= g + 30 || b <= g + 30) continue;
      found[g * 2 >= Math.min(r, b) ? 'pink' : 'magenta'].push(`${x},${y}`);
    }
  }
  return found;
}

const frames = (re) => Object.keys(FRAMES).filter((n) => re.test(n));

/**
 * CO-171: the hero, Tank, Fast, Swarm, Blizzard and Lightning strike art ship
 * with no magenta left on their outlines. Measured on the shipped atlas, so a
 * re-cut that drops `maxMagenta` from one of their sheets, or a palette that
 * snaps a rim pixel back to purple, fails here.
 */
describe('magenta fringe (CO-171)', () => {
  const GHOST = /^hero\.death\.[45]$/;
  const sets = {
    hero: [/^hero\./, 50],
    tank: [/^tank\./, 30],
    fast: [/^fast\./, 13],
    swarm: [/^swarm\./, 13],
    blizzard: [/^ice\.blizzard\./, 4],
    lightning: [/^lightning\.(strike|impact)\./, 8],
  };

  for (const [set, [re, count]] of Object.entries(sets)) {
    it(`covers every ${set} frame`, () => {
      expect(frames(re)).toHaveLength(count);
    });

    for (const name of frames(re)) {
      it(`${name} has no ${GHOST.test(name) ? 'magenta' : 'purple or pink'} pixel`, () => {
        const { magenta, pink } = purplePixels(name);
        expect(magenta).toEqual([]);
        // Only the ghost and its wisp are drawn pink.
        if (!GHOST.test(name)) expect(pink).toEqual([]);
      });
    }
  }

  it('the ghost keeps its pink', () => {
    // Most of the ghost is its pink body, red and blue both 20 over green.
    const { png, atlas } = page(FRAMES['hero.death.4'].page);
    const f = atlas.frames['hero.death.4'].frame;
    let visible = 0;
    let pink = 0;
    for (let y = 0; y < f.h; y += 1) {
      for (let x = 0; x < f.w; x += 1) {
        const i = ((f.y + y) * png.width + f.x + x) * 4;
        const [r, g, b, a] = png.data.subarray(i, i + 4);
        if (a < 128) continue;
        visible += 1;
        if (r > g + 20 && b > g + 20) pink += 1;
      }
    }
    expect(pink / visible).toBeGreaterThan(0.5);
  });

  // Purple on purpose, and on the same pages the fix re-quantised.
  for (const clip of [
    'boss.walk.down',
    'boss.slamWindup.down',
    'boss.volleyWindup.down',
    'boss.summonWindup.down',
    'pickupBomb.idle',
    'pickupHealth.idle',
    'ice.slow',
    'ice.nova',
  ]) {
    it(`${clip} keeps its purple`, () => {
      const names = frames(new RegExp(`^${clip.replace('.', '\\.')}\\.\\d+$`));
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        const { magenta, pink } = purplePixels(name);
        expect(magenta.length + pink.length, name).toBeGreaterThan(0);
      }
    });
  }
});
