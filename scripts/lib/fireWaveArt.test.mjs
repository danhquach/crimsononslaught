import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FIRE_WAVE_ART } from '../../src/config/fireRoster';
import { FRAMES } from '../../src/config/frames';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

/**
 * CO-143: `FIRE_WAVE_ART` is where the arc sits in the cut `fire.wave` frames.
 * Re-measured here from the shipped atlas, so a re-cut that moves or resizes
 * the arc fails instead of drawing the flame off the rim that hits.
 */
describe('fire wave art (CO-143)', () => {
  for (let i = 0; i < 4; i += 1) {
    const name = `fire.wave.${i}`;
    it(`${name} holds its arc where FIRE_WAVE_ART says`, () => {
      const info = FRAMES[name];
      const page = PNG.sync.read(readFileSync(join(ATLAS_DIR, `${info.page}.png`)));
      const atlas = JSON.parse(readFileSync(join(ATLAS_DIR, `${info.page}.json`), 'utf8'));
      const f = atlas.frames[name].frame;
      const opaque = [];
      const mid = [];
      for (let y = 0; y < f.h; y += 1) {
        const xs = [];
        for (let x = 0; x < f.w; x += 1) {
          if (page.data[((f.y + y) * page.width + f.x + x) * 4 + 3] > 128) xs.push(x);
        }
        for (const x of xs) opaque.push([x, y]);
        if (xs.length > 0) mid.push([xs.reduce((a, b) => a + b, 0) / xs.length, y]);
      }

      // The tip: the centre of the circle the band is drawn on.
      const centre = fitCircle(mid);
      expect(Math.abs(centre.x - FIRE_WAVE_ART.tipX), 'tipX').toBeLessThan(1.5);
      expect(Math.abs(centre.y - FIRE_WAVE_ART.tipY), 'tipY').toBeLessThan(1.5);

      // The front's leading edge: 90% of the flame lies inside it.
      const dist = opaque
        .map(([x, y]) => Math.hypot(x - FIRE_WAVE_ART.tipX, y - FIRE_WAVE_ART.tipY))
        .sort((a, b) => a - b);
      const front = dist[Math.floor(0.9 * (dist.length - 1))];
      expect(Math.abs(front - FIRE_WAVE_ART.radius), 'radius').toBeLessThan(3);
    });
  }
});

/** Least-squares circle through `points` (Kåsa fit); only its centre is used. */
function fitCircle(points) {
  let [sx, sy, sxx, syy, sxy, sxz, syz, sz] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const [x, y] of points) {
    const z = x * x + y * y;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxz += x * z;
    syz += y * z;
    sz += z;
  }
  const m = [
    [sxx, sxy, sx, sxz],
    [sxy, syy, sy, syz],
    [sx, sy, points.length, sz],
  ];
  for (let c = 0; c < 3; c += 1) {
    for (let r = c + 1; r < 3; r += 1) {
      const k = m[r][c] / m[c][c];
      for (let j = c; j < 4; j += 1) m[r][j] -= k * m[c][j];
    }
  }
  const s = [0, 0, 0];
  for (let r = 2; r >= 0; r -= 1) {
    let v = m[r][3];
    for (let j = r + 1; j < 3; j += 1) v -= m[r][j] * s[j];
    s[r] = v / m[r][r];
  }
  return { x: s[0] / 2, y: s[1] / 2 };
}
