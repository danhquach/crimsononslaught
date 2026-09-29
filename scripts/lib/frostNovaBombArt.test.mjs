import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SPIKE_RING_SCALE_RADIUS } from '../../src/config/fx';
import { FRAMES } from '../../src/config/frames';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

/** The box and centroid of one cut frame's art pixels, as offsets from its anchor. */
function measure(name) {
  const info = FRAMES[name];
  const page = PNG.sync.read(readFileSync(join(ATLAS_DIR, `${info.page}.png`)));
  const atlas = JSON.parse(readFileSync(join(ATLAS_DIR, `${info.page}.json`), 'utf8'));
  const f = atlas.frames[name].frame;
  let n = 0;
  let sx = 0;
  let sy = 0;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = 0; y < f.h; y += 1) {
    for (let x = 0; x < f.w; x += 1) {
      if (page.data[((f.y + y) * page.width + f.x + x) * 4 + 3] <= 128) continue;
      const dx = x + 0.5 - info.anchorX;
      const dy = y + 0.5 - info.anchorY;
      n += 1;
      sx += dx;
      sy += dy;
      box.x0 = Math.min(box.x0, dx);
      box.y0 = Math.min(box.y0, dy);
      box.x1 = Math.max(box.x1, dx);
      box.y1 = Math.max(box.y1, dy);
    }
  }
  return { n, centroid: { x: sx / n, y: sy / n }, box };
}

/**
 * CO-182: the Frost Nova Bomb art is drawn the way `spells/NovaBombSpell.ts`
 * uses it. Re-measured from the shipped atlas, so a re-cut that moves the art
 * off its anchor, tilts the icicle or resizes the ring fails here instead of
 * spinning the urchin off-centre or drawing the burst off its radius.
 */
describe('frost nova bomb art (CO-182)', () => {
  it('centres the urchin on its anchor, so spinning it does not wobble', () => {
    const { centroid, box } = measure('ice.urchin.0');
    expect(Math.abs(centroid.x)).toBeLessThan(1.5);
    expect(Math.abs(centroid.y)).toBeLessThan(1.5);
    expect(box.x1 - box.x0).toBeGreaterThan(20);
    expect(box.y1 - box.y0).toBeGreaterThan(20);
  });

  it('lays the icicle flat along its anchor row, so turning it lays it along its flight', () => {
    const { box } = measure('ice.icicle.0');
    expect(box.x1 - box.x0).toBeGreaterThan(3 * (box.y1 - box.y0));
    expect(Math.abs(box.y0 + box.y1) / 2).toBeLessThan(1.5);
  });

  it('draws the frost ring with its rim on SPIKE_RING_SCALE_RADIUS, round the anchor', () => {
    const { box } = measure('ice.spikeRing.1');
    // Pixel centres: the outer edge is half a pixel further out each side.
    expect(Math.abs((box.x1 - box.x0 + 1) / 2 - SPIKE_RING_SCALE_RADIUS)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.x0 + box.x1) / 2).toBeLessThan(1.5);
    expect(Math.abs(box.y0 + box.y1) / 2).toBeLessThan(1.5);
    // Nearly round, like the other ground rings, so the drawn ring covers the
    // circle the burst reaches rather than a flat ellipse inside it.
    expect((box.y1 - box.y0) / (box.x1 - box.x0)).toBeGreaterThan(0.8);
  });

  it('keeps every burst frame visible, the last one included', () => {
    for (let i = 0; i < 6; i += 1)
      expect(measure(`ice.spikeRing.${i}`).n, `frame ${i}`).toBeGreaterThan(50);
  });
});
