import { describe, expect, it } from 'vitest';

import {
  centreBounds,
  alphaCell,
  clearOutside,
  cornerKey,
  crop,
  despill,
  downscaleNearest,
  edgesTouched,
  expandRow,
  gridSplit,
  insetRect,
  isPreKeyed,
  keyCell,
  nextPowerOfTwo,
  opaqueBounds,
  packFrames,
  quantize,
  softAlpha,
  trimBorderLines,
  unionBounds,
} from './spriteCut.mjs';

const MAGENTA = [255, 0, 255];

/** Build an RGBA test image from a `fill(x, y) => [r, g, b, a]` function. */
function image(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a ?? 255;
    }
  }
  return { width, height, data };
}

/** A magenta canvas with an opaque white rectangle painted on it. */
function sheetWithBox(width, height, box, colour = [255, 255, 255]) {
  return image(width, height, (x, y) => {
    const inside =
      x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h ? colour : MAGENTA;
    return [...inside, 255];
  });
}

describe('gridSplit', () => {
  it('tiles the image exactly, with no gap or overlap', () => {
    const cells = gridSplit(100, 60, 6, 4);
    expect(cells).toHaveLength(24);

    const row0 = cells.filter((c) => c.row === 0);
    expect(row0[0].x).toBe(0);
    expect(row0.at(-1).x + row0.at(-1).w).toBe(100);
    for (let i = 1; i < row0.length; i += 1) {
      expect(row0[i].x).toBe(row0[i - 1].x + row0[i - 1].w);
    }

    const col0 = cells.filter((c) => c.col === 0);
    expect(col0[0].y).toBe(0);
    expect(col0.at(-1).y + col0.at(-1).h).toBe(60);
  });

  it('keeps cells within a pixel of each other when the size does not divide', () => {
    // 1264 x 848 is the real hero sheet: 6 columns of 210.67 px.
    const widths = new Set(gridSplit(1264, 848, 6, 4).map((c) => c.w));
    expect([...widths].sort()).toEqual([210, 211]);
  });

  it('rejects a grid it cannot split', () => {
    expect(() => gridSplit(10, 10, 0, 1)).toThrow(/cols/);
    expect(() => gridSplit(10, 10, 1, 1.5)).toThrow(/rows/);
  });
});

describe('cornerKey', () => {
  it('reads the background even when art covers one corner', () => {
    const img = sheetWithBox(40, 40, { x: 0, y: 0, w: 12, h: 12 });
    expect(cornerKey(img, { x: 0, y: 0, w: 40, h: 40 })).toEqual(MAGENTA);
  });

  it('reads a different background per cell, as the mauve hero sheet needs', () => {
    const img = image(40, 40, (_x, y) => (y < 20 ? [160, 80, 150, 255] : [120, 96, 120, 255]));
    expect(cornerKey(img, { x: 0, y: 0, w: 40, h: 20 })).toEqual([160, 80, 150]);
    expect(cornerKey(img, { x: 0, y: 20, w: 40, h: 20 })).toEqual([120, 96, 120]);
  });

  it('shrugs off single-pixel noise in a corner patch', () => {
    const img = image(40, 40, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 255] : [...MAGENTA, 255]));
    expect(cornerKey(img, { x: 0, y: 0, w: 40, h: 40 })).toEqual(MAGENTA);
  });
});

describe('softAlpha', () => {
  it('is clear at the key, solid far from it, and ramps between', () => {
    expect(softAlpha(MAGENTA, MAGENTA, 60, 130)).toBe(0);
    expect(softAlpha([250, 5, 250], MAGENTA, 60, 130)).toBe(0);
    expect(softAlpha([255, 255, 255], MAGENTA, 60, 130)).toBe(255);

    const mid = softAlpha([255, 95, 255], MAGENTA, 60, 130);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
  });
});

describe('despill', () => {
  it('turns mist read as pink back into translucent white', () => {
    // White at 50 % coverage over magenta flattens to (255, 128, 255).
    expect(despill([255, 128, 255], MAGENTA, 128)).toEqual([255, 255, 255]);
  });

  it('leaves a fully opaque pixel alone', () => {
    expect(despill([20, 140, 90], MAGENTA, 255)).toEqual([20, 140, 90]);
  });

  it('reports nothing for a fully keyed-out pixel', () => {
    expect(despill(MAGENTA, MAGENTA, 0)).toEqual([0, 0, 0]);
  });
});

describe('opaqueBounds', () => {
  it('finds the box around the art', () => {
    const img = sheetWithBox(40, 40, { x: 8, y: 6, w: 10, h: 12 });
    const keyed = keyCell(img, { x: 0, y: 0, w: 40, h: 40 }, MAGENTA, 60, 130);
    expect(opaqueBounds(keyed)).toEqual({ x: 8, y: 6, w: 10, h: 12 });
  });

  it('returns null for a blank cell', () => {
    const img = sheetWithBox(40, 40, { x: 0, y: 0, w: 0, h: 0 });
    expect(opaqueBounds(keyCell(img, { x: 0, y: 0, w: 40, h: 40 }, MAGENTA, 60, 130))).toBeNull();
  });

  it('ignores isolated JPEG specks that would otherwise stretch the box', () => {
    // Two lone pixels in opposite corners, as the JPEG sheets really contain.
    const img = image(40, 40, (x, y) =>
      (x === 0 && y === 0) || (x === 39 && y === 39)
        ? [255, 255, 255, 255]
        : x >= 16 && x < 24 && y >= 16 && y < 24
          ? [255, 255, 255, 255]
          : [...MAGENTA, 255],
    );
    const keyed = keyCell(img, { x: 0, y: 0, w: 40, h: 40 }, MAGENTA, 60, 130);
    expect(opaqueBounds(keyed)).toEqual({ x: 16, y: 16, w: 8, h: 8 });
  });
});

describe('trimBorderLines', () => {
  const cell = { x: 0, y: 0, w: 60, h: 60 };

  it('removes a ruled line on the cell border', () => {
    const img = image(60, 60, (x, y) =>
      x < 2 || y < 2 || x > 57 || y > 57 ? [0, 0, 0, 255] : [...MAGENTA, 255],
    );
    const t = trimBorderLines(img, cell, MAGENTA, 60, 130, { halo: 0 });
    expect(t).toMatchObject({ x: 2, y: 2, w: 56, h: 56 });
  });

  it('removes a line drawn a pixel inside the boundary, as the swarm sheet has', () => {
    const img = image(60, 60, (x) => (x === 1 ? [0, 0, 0, 255] : [...MAGENTA, 255]));
    const t = trimBorderLines(img, cell, MAGENTA, 60, 130, { halo: 0 });
    expect(t.x).toBe(2);
    expect(t.w).toBe(58);
  });

  it('leaves a cell with no lines untouched, so full-bleed art survives', () => {
    // A wing tip touching the border over a few rows, as the boss sheet does.
    // It reaches the edge but covers nothing like all of it, which is exactly
    // what separates art from a rule.
    const img = image(60, 60, (x, y) =>
      x < 30 && y >= 28 && y < 32 ? [200, 60, 200, 255] : [...MAGENTA, 255],
    );
    expect(trimBorderLines(img, cell, MAGENTA, 60, 130)).toMatchObject({
      x: 0,
      y: 0,
      w: 60,
      h: 60,
    });
  });

  it('cannot tell art from a rule when the art covers a whole edge', () => {
    // A documented limit of measuring rather than assuming: a frame whose art
    // fills an entire border column is trimmed as though it were ruled. The
    // manifest's allowEdge is how a sheet like that is declared instead.
    const img = sheetWithBox(60, 60, { x: 0, y: 0, w: 2, h: 60 });
    expect(trimBorderLines(img, cell, MAGENTA, 60, 130, { halo: 0 }).x).toBe(2);
  });

  it('never eats more than maxFraction of the cell', () => {
    const img = image(60, 60, () => [0, 0, 0, 255]);
    const t = trimBorderLines(img, cell, MAGENTA, 60, 130, { maxFraction: 0.1, halo: 0 });
    expect(t.w).toBeGreaterThanOrEqual(60 - 2 * 6);
  });
});

describe('clearOutside', () => {
  it('drops the grid-line band while leaving the art untouched', () => {
    const img = keyCell(
      sheetWithBox(20, 20, { x: 0, y: 0, w: 20, h: 20 }),
      { x: 0, y: 0, w: 20, h: 20 },
      MAGENTA,
      60,
      130,
    );
    clearOutside(img, { x: 2, y: 3, w: 10, h: 10 });
    expect(opaqueBounds(img)).toEqual({ x: 2, y: 3, w: 10, h: 10 });
  });

  it('keeps every frame of a sheet in the same coordinate space', () => {
    // Two cells trimmed by different amounts still report bounds against the
    // cell origin, which is what lets one animation span two rows.
    const img = keyCell(
      sheetWithBox(20, 20, { x: 0, y: 0, w: 20, h: 20 }),
      { x: 0, y: 0, w: 20, h: 20 },
      MAGENTA,
      60,
      130,
    );
    clearOutside(img, { x: 5, y: 5, w: 4, h: 4 });
    const bounds = opaqueBounds(img);
    expect(bounds).toEqual({ x: 5, y: 5, w: 4, h: 4 });
  });
});

describe('isPreKeyed / alphaCell', () => {
  // A sheet delivered as an RGBA cut-out rather than art flattened onto a key.
  const cutOut = image(20, 20, (x, y) =>
    x >= 8 && x < 12 && y >= 8 && y < 12 ? [0, 0, 0, 255] : [0, 0, 0, 0],
  );
  const flattened = image(20, 20, (x, y) =>
    x >= 8 && x < 12 && y >= 8 && y < 12 ? [0, 0, 0, 255] : [...MAGENTA, 255],
  );

  it('tells a cut-out sheet from one flattened onto a key', () => {
    expect(isPreKeyed(cutOut)).toBe(true);
    expect(isPreKeyed(flattened)).toBe(false);
  });

  it('does not call a sheet pre-keyed for a handful of soft pixels', () => {
    const almostOpaque = image(20, 20, (x, y) =>
      x === 0 && y === 0 ? [0, 0, 0, 0] : [1, 2, 3, 255],
    );
    expect(isPreKeyed(almostOpaque)).toBe(false);
  });

  it('keeps black art that colour-keying a transparent corner would erase', () => {
    const rect = { x: 0, y: 0, w: 20, h: 20 };
    // The corner of a cut-out sheet reads as black, and so does the outline
    // every sprite in this style is drawn with; keying by colour loses it.
    expect(opaqueBounds(keyCell(cutOut, rect, cornerKey(cutOut, rect), 60, 130))).toBeNull();
    expect(opaqueBounds(alphaCell(cutOut, rect))).toEqual({ x: 8, y: 8, w: 4, h: 4 });
  });

  it('takes one cell out of the sheet, alpha and all', () => {
    const cell = alphaCell(cutOut, { x: 8, y: 8, w: 4, h: 4 });
    expect(cell.width).toBe(4);
    expect(cell.height).toBe(4);
    expect([...cell.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
  });
});

describe('edgesTouched', () => {
  it('names each side the box is flush against', () => {
    expect(edgesTouched({ x: 0, y: 0, w: 5, h: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toEqual([
      'top',
      'left',
    ]);
    expect(edgesTouched({ x: 5, y: 5, w: 5, h: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toEqual([
      'right',
      'bottom',
    ]);
    expect(edgesTouched({ x: 1, y: 1, w: 8, h: 8 }, { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });
});

describe('unionBounds', () => {
  it('covers every frame in the row, so the anchor cannot drift', () => {
    expect(
      unionBounds([
        { x: 4, y: 8, w: 10, h: 10 },
        { x: 2, y: 9, w: 6, h: 14 },
      ]),
    ).toEqual({ x: 2, y: 8, w: 12, h: 15 });
  });

  it('is null when there is nothing to bound', () => {
    expect(unionBounds([null, null])).toBeNull();
  });
});

describe('centreBounds', () => {
  const centre = { x: 50, y: 50 };

  it('mirrors the box about the centre and adds the margin on every side', () => {
    // 10 left of centre, 20 right: the far side wins and both sides get it.
    expect(centreBounds({ x: 40, y: 30, w: 30, h: 30 }, centre, 4)).toEqual({
      x: 26,
      y: 26,
      w: 48,
      h: 48,
    });
  });

  it('leaves the margin clear even when the art already straddles the centre evenly', () => {
    const box = centreBounds({ x: 40, y: 40, w: 20, h: 20 }, centre, 1);
    expect(box).toEqual({ x: 39, y: 39, w: 22, h: 22 });
  });

  it('gives a box the centre sits exactly halfway across, so the anchor is the frame centre', () => {
    for (const art of [
      { x: 10, y: 44, w: 5, h: 3 },
      { x: 61, y: 12, w: 40, h: 90 },
      { x: 49, y: 49, w: 1, h: 1 },
    ]) {
      const box = centreBounds(art, centre, 2);
      expect(centre.x - box.x).toBe(box.x + box.w - centre.x);
      expect(centre.y - box.y).toBe(box.y + box.h - centre.y);
    }
  });

  it('comes out on whole pixels even when the centre and margin do not', () => {
    // A 101 px cell downscaled by 4.04: both the centre and the margin land
    // between pixels, and a fractional box would read as transparent in `crop`.
    const box = centreBounds({ x: 30, y: 30, w: 21, h: 21 }, { x: 50.5, y: 50.5 }, 4.04);
    for (const v of [box.x, box.y, box.w, box.h]) expect(Number.isInteger(v)).toBe(true);
    expect(box.w).toBe(box.h);
  });

  it('never cuts into the art it was given', () => {
    const art = { x: 12, y: 80, w: 9, h: 30 };
    const box = centreBounds(art, centre, 3);
    expect(box.x).toBeLessThanOrEqual(art.x - 3);
    expect(box.y).toBeLessThanOrEqual(art.y - 3);
    expect(box.x + box.w).toBeGreaterThanOrEqual(art.x + art.w + 3);
    expect(box.y + box.h).toBeGreaterThanOrEqual(art.y + art.h + 3);
  });
});

describe('downscaleNearest', () => {
  it('picks the source pixel at each block centre, keeping edges hard', () => {
    // 4x4 of four solid 2x2 quadrants, down to 2x2.
    const img = image(4, 4, (x, y) => {
      if (x < 2 && y < 2) return [255, 0, 0, 255];
      if (x >= 2 && y < 2) return [0, 255, 0, 255];
      if (x < 2) return [0, 0, 255, 255];
      return [255, 255, 0, 255];
    });
    const small = downscaleNearest(img, 2, 2);
    expect([...small.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...small.data.slice(4, 8)]).toEqual([0, 255, 0, 255]);
    expect([...small.data.slice(8, 12)]).toEqual([0, 0, 255, 255]);
    expect([...small.data.slice(12, 16)]).toEqual([255, 255, 0, 255]);
  });

  it('never invents a colour between two neighbours', () => {
    const img = image(8, 1, (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const small = downscaleNearest(img, 2, 1);
    for (const v of small.data) expect([0, 255]).toContain(v);
  });
});

describe('crop', () => {
  it('copies the requested rectangle', () => {
    const img = image(4, 4, (x, y) => [x * 10, y * 10, 0, 255]);
    const out = crop(img, { x: 1, y: 2, w: 2, h: 1 });
    expect(out.width).toBe(2);
    expect([...out.data]).toEqual([10, 20, 0, 255, 20, 20, 0, 255]);
  });

  it('fills with transparent where the rectangle reaches past the source', () => {
    // The real case: an animation spanning two sheet rows of unequal height.
    // `boss_states` is 896 px over three rows, so its rows are 299, 298 and 299
    // px tall and the union crop is a pixel taller than the shorter row's cell.
    const shortRow = image(4, 3, () => [10, 20, 30, 255]);
    const out = crop(shortRow, { x: 0, y: 0, w: 4, h: 4 });

    expect(out.height).toBe(4);
    // The rows that exist are copied intact...
    expect([...out.data.slice(0, 4)]).toEqual([10, 20, 30, 255]);
    // ...and the row past the end is transparent, not garbage.
    const lastRow = [...out.data.slice(3 * 4 * 4)];
    expect(lastRow).toEqual(new Array(16).fill(0));
  });

  it('stays in bounds when the rectangle starts outside the source', () => {
    const img = image(2, 2, () => [1, 2, 3, 255]);
    const out = crop(img, { x: -1, y: -1, w: 2, h: 2 });
    expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...out.data.slice(12, 16)]).toEqual([1, 2, 3, 255]);
  });
});

describe('packFrames', () => {
  const frames = [
    { name: 'b', width: 10, height: 20 },
    { name: 'a', width: 10, height: 20 },
    { name: 'c', width: 10, height: 5 },
  ];

  it('places every frame without overlapping', () => {
    const { placements } = packFrames(frames, { maxWidth: 64 });
    expect(placements).toHaveLength(3);
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const p = placements[i];
        const q = placements[j];
        const apart =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y;
        expect(apart, `${p.name} overlaps ${q.name}`).toBe(true);
      }
    }
  });

  it('is deterministic whatever order the frames arrive in', () => {
    const one = packFrames(frames, { maxWidth: 64 });
    const two = packFrames([...frames].reverse(), { maxWidth: 64 });
    expect(two.placements).toEqual(one.placements);
    expect([two.width, two.height]).toEqual([one.width, one.height]);
  });

  it('wraps to a new shelf rather than exceeding the maximum width', () => {
    const { width } = packFrames(frames, { maxWidth: 24 });
    expect(width).toBeLessThanOrEqual(32);
  });

  it('does not round a shelf that exactly fills the width up to the next power', () => {
    // Two 31 px frames plus the gutters fill 64 px exactly. Counting the
    // trailing gutter twice would report 128 and fail the atlas size check
    // over space that is already accounted for.
    const exact = [
      { name: 'a', width: 31, height: 10 },
      { name: 'b', width: 31, height: 10 },
    ];
    expect(packFrames(exact, { maxWidth: 64 }).width).toBe(64);
  });
});

describe('nextPowerOfTwo', () => {
  it('rounds up, and leaves an exact power alone', () => {
    expect([1, 2, 3, 5, 129].map(nextPowerOfTwo)).toEqual([1, 2, 4, 8, 256]);
  });
});

describe('quantize', () => {
  it('keeps an image that already fits the palette exact', () => {
    const img = image(4, 4, (x) => (x < 2 ? [10, 20, 30, 255] : [200, 100, 50, 255]));
    const { palette, indices } = quantize(img, 256);
    expect(palette.length).toBeLessThanOrEqual(2);
    const at = (x, y) => palette[indices[y * 4 + x]];
    expect(at(0, 0)).toEqual([10, 20, 30, 255]);
    expect(at(3, 0)).toEqual([200, 100, 50, 255]);
  });

  it('folds every fully transparent pixel onto one entry', () => {
    const img = image(4, 1, (x) => (x < 2 ? [255, 0, 255, 0] : [7, 9, 11, 0]));
    const { indices } = quantize(img, 256);
    expect(new Set(indices).size).toBe(1);
  });

  it('never returns more colours than asked for', () => {
    const img = image(16, 16, (x, y) => [x * 16, y * 16, (x * y) % 256, 255]);
    expect(quantize(img, 8).palette.length).toBeLessThanOrEqual(8);
  });

  it('produces the same palette every run, so the atlas stays byte-identical', () => {
    const img = image(16, 16, (x, y) => [x * 16, y * 16, (x * y) % 256, 255]);
    expect(quantize(img, 8)).toEqual(quantize(img, 8));
  });
});

describe('expandRow', () => {
  it('names each declared cell and reports the rest as blank', () => {
    const { frames, blanks } = expandRow('swarm', [{ anim: 'move', cols: [1, 4] }], 6);
    expect(frames.map((f) => f.name)).toEqual([
      'swarm.move.0',
      'swarm.move.1',
      'swarm.move.2',
      'swarm.move.3',
    ]);
    expect(blanks).toEqual([4, 5]);
  });

  it('adds the facing to the name', () => {
    const { frames } = expandRow('hero', [{ anim: 'walk', facing: 'left', cols: [3, 4] }], 6);
    expect(frames.map((f) => f.name)).toEqual(['hero.walk.left.0', 'hero.walk.left.1']);
  });

  it('continues numbering across rows, as the boss death does', () => {
    const first = expandRow('boss', [{ anim: 'death', cols: [1, 4] }], 4);
    const second = expandRow('boss', [{ anim: 'death', cols: [1, 4] }], 4, first.counters);
    expect(second.frames.map((f) => f.name)).toEqual([
      'boss.death.4',
      'boss.death.5',
      'boss.death.6',
      'boss.death.7',
    ]);
  });

  it('carries allowEdge onto every frame of the segment', () => {
    const { frames } = expandRow(
      'fast',
      [{ anim: 'spawn', cols: [1, 2], allowEdge: ['bottom'] }],
      6,
    );
    expect(frames.every((f) => f.allowEdge.includes('bottom'))).toBe(true);
  });

  it('carries centred onto every frame of the segment, and defaults it off', () => {
    const on = expandRow('ice', [{ anim: 'nova', cols: [1, 2], centred: true }], 6);
    expect(on.frames.every((f) => f.centred)).toBe(true);
    const off = expandRow('ice', [{ anim: 'slow', cols: [1, 2] }], 6);
    expect(off.frames.every((f) => f.centred === false)).toBe(true);
  });

  it('rejects a segment outside the grid or one that overlaps another', () => {
    expect(() => expandRow('x', [{ anim: 'a', cols: [1, 7] }], 6)).toThrow(/outside/);
    expect(() =>
      expandRow(
        'x',
        [
          { anim: 'a', cols: [1, 3] },
          { anim: 'b', cols: [3, 4] },
        ],
        6,
      ),
    ).toThrow(/twice/);
  });
});

describe('insetRect', () => {
  it('pulls in from every edge', () => {
    expect(insetRect({ x: 10, y: 20, w: 100, h: 50 }, 0.1)).toMatchObject({
      x: 20,
      y: 25,
      w: 80,
      h: 40,
    });
  });

  it('refuses an inset that would leave nothing', () => {
    expect(() => insetRect({ x: 0, y: 0, w: 4, h: 4 }, 0.5)).toThrow();
  });
});
