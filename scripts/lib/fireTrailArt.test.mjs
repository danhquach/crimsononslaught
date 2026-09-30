import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

/** name -> { png, frame }, read from the pages themselves so no page assignment is assumed. */
const frames = new Map();
for (const file of readdirSync(ATLAS_DIR).filter((f) => /^props\d*\.json$/.test(f))) {
  const png = PNG.sync.read(readFileSync(join(ATLAS_DIR, file.replace('.json', '.png'))));
  const data = JSON.parse(readFileSync(join(ATLAS_DIR, file), 'utf8'));
  for (const [name, { frame }] of Object.entries(data.frames)) frames.set(name, { png, frame });
}

/** Every visible pixel (alpha 128 or more) of one frame as [r, g, b]. */
function visiblePixels(name) {
  const { png, frame: f } = frames.get(name);
  const out = [];
  for (let y = 0; y < f.h; y += 1) {
    for (let x = 0; x < f.w; x += 1) {
      const i = ((f.y + y) * png.width + f.x + x) * 4;
      if (png.data[i + 3] >= 128) out.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
  }
  return out;
}

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** The arena floor (`arena.ground.0`): luma p50 and p90 and mean colour, as floorContrastArt reads it. */
const floor = (() => {
  const px = visiblePixels('arena.ground.0');
  const lumas = px.map(luma).sort((a, b) => a - b);
  return {
    p50: lumas[lumas.length >> 1],
    p90: lumas[Math.floor(lumas.length * 0.9)],
    mean: [0, 1, 2].map((c) => px.reduce((sum, p) => sum + p[c], 0) / px.length),
  };
})();

/** CO-194's rule: a pixel stands out from the floor by brightness or by colour. */
const BRIGHTER_BY = 48;
const FAR_BY = 100;
/** Share of a scorch frame's pixels that must stand out: the embers carry the stain. */
const EMBER_MIN = 0.03;
/** How much darker than the floor's median the soot must be, in luma. */
const DARKER_BY = 6;

const scorch = [...frames.keys()].filter((n) => /^fire\.scorch\.\d+$/.test(n));

describe('Fire Wave burnt ground art (CO-200)', () => {
  it('has four frames of one size', () => {
    expect(scorch).toHaveLength(4);
    const sizes = new Set(scorch.map((n) => `${frames.get(n).frame.w}x${frames.get(n).frame.h}`));
    expect(sizes.size).toBe(1);
  });

  for (const name of scorch.sort()) {
    describe(name, () => {
      const px = visiblePixels(name);

      it('has ember specks that stand out from the arena floor', () => {
        const out = px.filter(
          (p) =>
            luma(p) >= floor.p90 + BRIGHTER_BY ||
            Math.hypot(...p.map((v, c) => v - floor.mean[c])) >= FAR_BY,
        );
        expect(out.length / px.length).toBeGreaterThanOrEqual(EMBER_MIN);
      });

      it('has soot darker than the floor', () => {
        const median = px.map(luma).sort((a, b) => a - b)[px.length >> 1];
        expect(median).toBeLessThanOrEqual(floor.p50 - DARKER_BY);
      });

      it('has no magenta or purple pixels', () => {
        expect(px.filter(([r, g, b]) => r > g + 30 && b > g + 30)).toHaveLength(0);
      });

      it('is at most 1% green-dominant', () => {
        const green = px.filter(([r, g, b]) => g > r + 8 && g > b + 8);
        expect(green.length / px.length).toBeLessThanOrEqual(0.01);
      });
    });
  }
});
