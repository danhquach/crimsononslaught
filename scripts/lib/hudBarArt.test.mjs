import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ART_BOXES, FRAMES } from '../../src/config/frames';
import { BAR_ART } from '../../src/config/hud';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

/** Whether each pixel of `frame`'s art box is opaque, as the shipped atlas holds it. */
function opacity(frame) {
  const info = FRAMES[frame];
  const page = PNG.sync.read(readFileSync(join(ATLAS_DIR, `${info.page}.png`)));
  const atlas = JSON.parse(readFileSync(join(ATLAS_DIR, `${info.page}.json`), 'utf8'));
  const f = atlas.frames[frame].frame;
  const box = ART_BOXES[frame.slice(0, frame.lastIndexOf('.'))];
  const at = (x, y) => page.data[((f.y + box.y + y) * page.width + f.x + box.x + x) * 4 + 3] > 0;
  return { box, at };
}

/**
 * CO-156: the layout numbers in `config/hud.ts` were read off the cut art. Here
 * they are checked against the atlas as it ships: the trough is the tube's
 * clear inside, walled by opaque rails, and the middle between the caps has one
 * outline in every column, so tiling it leaves no step.
 */
describe('HUD bar art (CO-156)', () => {
  for (const [id, art] of Object.entries(BAR_ART)) {
    describe(id, () => {
      const { box, at } = opacity(art.frame);
      const { left, top, right, bottom } = art.trough;
      const middle = { from: art.capLeft, to: box.w - art.capRight };

      it('has caps and at least one middle column inside the art box', () => {
        expect(art.capLeft + art.capRight + 1).toBeLessThanOrEqual(box.w);
        expect(left + right).toBeLessThan(box.w);
        expect(top + bottom).toBeLessThan(box.h);
      });

      it('has a clear trough across the middle, with a rail above and below it', () => {
        const blocked = [];
        for (let x = middle.from; x < middle.to; x++) {
          for (let y = top; y < box.h - bottom; y++) if (at(x, y)) blocked.push(`${x},${y}`);
          if (!at(x, top - 1)) blocked.push(`no top rail at ${x}`);
          if (!at(x, box.h - bottom)) blocked.push(`no bottom rail at ${x}`);
        }
        expect(blocked).toEqual([]);
      });

      it('clears the trough to its left and right insets, and no further', () => {
        const row = top + Math.floor((box.h - top - bottom) / 2);
        expect(at(left - 1, row)).toBe(true);
        expect(at(left, row)).toBe(false);
        expect(at(box.w - right - 1, row)).toBe(false);
        expect(at(box.w - right, row)).toBe(true);
      });

      it('has the same outline in every middle column', () => {
        const outline = (x) => Array.from({ length: box.h }, (_, y) => (at(x, y) ? 1 : 0)).join('');
        const first = outline(middle.from);
        for (let x = middle.from + 1; x < middle.to; x++)
          expect(outline(x), `column ${x}`).toBe(first);
      });

      it('has a mark in the atlas', () => {
        expect(FRAMES[art.mark]).toBeDefined();
      });
    });
  }
});
