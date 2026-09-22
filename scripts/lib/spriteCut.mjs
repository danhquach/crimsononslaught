/**
 * Pure helpers for cutting an authored sprite sheet into game frames (CO-080).
 *
 * Every function here is side-effect free and works on plain RGBA byte buffers,
 * so `spriteCut.test.mjs` exercises them on synthetic pixel buffers with no
 * image files involved. All the file and atlas I/O lives in `cut-sheets.mjs`.
 *
 * An "image" below is always `{ width, height, data }` where `data` is a
 * Uint8ClampedArray (or Buffer) of `width * height * 4` bytes in RGBA order.
 */

/** Read the RGBA pixel at (x, y) as a 4-number array. */
export function pixelAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

/**
 * Split an image into `cols * rows` cell rectangles.
 *
 * The boundaries are computed from the true image size rather than from a
 * nominal cell size, because the art agent returned every sheet at a slightly
 * different size than the prompt asked for. Rounding each boundary once means
 * the cells tile the image exactly: no gap, no overlap, and at most a 1 px
 * difference in width between neighbouring columns.
 */
export function gridSplit(width, height, cols, rows) {
  if (!Number.isInteger(cols) || cols < 1) throw new Error(`cols must be >= 1, got ${cols}`);
  if (!Number.isInteger(rows) || rows < 1) throw new Error(`rows must be >= 1, got ${rows}`);

  const edge = (i, n, total) => Math.round((i * total) / n);
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    const y0 = edge(r, rows, height);
    const y1 = edge(r + 1, rows, height);
    for (let c = 0; c < cols; c += 1) {
      const x0 = edge(c, cols, width);
      const x1 = edge(c + 1, cols, width);
      cells.push({ col: c, row: r, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return cells;
}

/**
 * Inset a rectangle by `fraction` of its size on every edge.
 *
 * Used to sample the background key clear of any drawn grid line: the prompts
 * keep the art inside the middle three quarters of the cell, so a few per cent
 * in from the corner is still background on every sheet.
 */
export function insetRect(rect, fraction) {
  const dx = Math.round(rect.w * fraction);
  const dy = Math.round(rect.h * fraction);
  const w = rect.w - dx * 2;
  const h = rect.h - dy * 2;
  if (w < 1 || h < 1) throw new Error(`inset ${fraction} leaves nothing of a rect`);
  return { ...rect, x: rect.x + dx, y: rect.y + dy, w, h };
}

/**
 * Shrink a cell past the grid lines drawn on its border.
 *
 * Seven of the eighteen sheets came back with a line ruled along every cell
 * boundary and the rest came back with none, so a fixed inset is wrong either
 * way: 3 % leaves the line on a thick-ruled sheet and eats into the boss, whose
 * wings reach to within a pixel of the cell. Measuring instead of assuming
 * works because the two cases are nothing alike — a ruled line covers its whole
 * edge, while the fullest art on any sheet covers 15 % of one.
 *
 * Each side is scanned inwards over a band `maxFraction` deep and cut back to
 * just past the deepest line found there. Scanning a band rather than peeling
 * flush rows matters because the rule does not land exactly on the boundary the
 * grid maths computes: on the swarm sheet it sits a pixel inside the cell, so
 * peeling only while the very edge is covered would step over it and leave the
 * line in the frame. A sheet with no lines has no covered row in the band and
 * is returned untouched.
 */
export function trimBorderLines(
  img,
  cell,
  key,
  tol0,
  tol1,
  { coverage = 0.85, maxFraction = 0.06, halo = 2 } = {},
) {
  const covered = (fixed, from, length, horizontal) => {
    let on = 0;
    for (let i = 0; i < length; i += 1) {
      const [x, y] = horizontal ? [from + i, fixed] : [fixed, from + i];
      if (softAlpha(pixelAt(img, x, y), key, tol0, tol1) > 40) on += 1;
    }
    return on / length >= coverage;
  };

  const maxX = Math.floor(cell.w * maxFraction);
  const maxY = Math.floor(cell.h * maxFraction);

  // A rule drawn on a JPEG leaves a compression halo a pixel or two either
  // side of it, too faint to be "covered" but solid enough to set a bounding
  // box, so a side that has a line is cut back a little past it. Sides with no
  // line are left alone, which is what keeps the boss's wings intact.
  const deepest = (probe, max) => {
    let last = -1;
    for (let i = 0; i < max; i += 1) if (probe(i)) last = i;
    return last < 0 ? 0 : Math.min(max, last + 1 + halo);
  };

  const top = deepest((i) => covered(cell.y + i, cell.x, cell.w, true), maxY);
  const bottom = deepest((i) => covered(cell.y + cell.h - 1 - i, cell.x, cell.w, true), maxY);
  const left = deepest((i) => covered(cell.x + i, cell.y, cell.h, false), maxX);
  const right = deepest((i) => covered(cell.x + cell.w - 1 - i, cell.y, cell.h, false), maxX);

  return {
    ...cell,
    x: cell.x + left,
    y: cell.y + top,
    w: Math.max(1, cell.w - left - right),
    h: Math.max(1, cell.h - top - bottom),
  };
}

/** Squared RGB distance, so callers can compare against a squared tolerance. */
function dist2(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** Median of a list of numbers (lower median for even counts, so it is exact). */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

/**
 * The background colour to key out of this cell, sampled at its corners.
 *
 * Not a fixed magenta: `hero_states` uses a different mauve per row, so the key
 * has to be read per cell. Sampling a small patch in all four corners and
 * taking the per-channel median survives JPEG ringing, a stray grid line, and
 * one corner being covered by art (as on the clipped bolt and spawn rows).
 */
export function cornerKey(img, rect, patch = 4) {
  const p = Math.max(1, Math.min(patch, Math.floor(Math.min(rect.w, rect.h) / 2)));
  const rs = [];
  const gs = [];
  const bs = [];
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.w - p, rect.y],
    [rect.x, rect.y + rect.h - p],
    [rect.x + rect.w - p, rect.y + rect.h - p],
  ];
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + p; y += 1) {
      for (let x = cx; x < cx + p; x += 1) {
        const [r, g, b] = pixelAt(img, x, y);
        rs.push(r);
        gs.push(g);
        bs.push(b);
      }
    }
  }
  return [median(rs), median(gs), median(bs)];
}

/**
 * Alpha for one pixel: 0 at or under `tol0` from the key, 255 at or over
 * `tol1`, a linear ramp between. The ramp is what makes the ice mist and the
 * fading death frames translucent instead of punching a hard hole in them.
 */
export function softAlpha(pixel, key, tol0, tol1) {
  const d = Math.sqrt(dist2(pixel, key));
  if (d <= tol0) return 0;
  if (d >= tol1) return 255;
  return Math.round(((d - tol0) / (tol1 - tol0)) * 255);
}

/**
 * Recover the un-keyed colour of a partly transparent pixel.
 *
 * A pixel the artist drew as `fg` with coverage `a` over the background `key`
 * was flattened to `obs = a * fg + (1 - a) * key`, so the original is
 * `(obs - (1 - a) * key) / a`. Undoing the mix is what removes the magenta
 * fringe (the despill): a white mist pixel at 40 % coverage reads as pink in
 * the sheet and comes back out as translucent white.
 */
export function despill(pixel, key, alpha) {
  if (alpha <= 0) return [0, 0, 0];
  const a = alpha / 255;
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    out.push(Math.max(0, Math.min(255, Math.round((pixel[i] - (1 - a) * key[i]) / a))));
  }
  return out;
}

/**
 * Key one cell out of `img` into a standalone RGBA image of the cell's size.
 */
export function keyCell(img, rect, key, tol0, tol1) {
  const data = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const px = pixelAt(img, rect.x + x, rect.y + y);
      const a = softAlpha(px, key, tol0, tol1);
      const [r, g, b] = despill(px, key, a);
      const o = (y * rect.w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }
  return { width: rect.w, height: rect.h, data };
}

/**
 * True when a sheet arrived already keyed: it carries a real alpha channel
 * whose background is transparent, rather than art flattened onto a flat
 * colour to key out.
 *
 * A property of the file, not of the sheet, so the manifest says nothing about
 * it: three of the CO-123 sheets came back as RGBA PNGs with the background
 * already cut away. Keying those by colour would be actively wrong — the key
 * sampled from a transparent corner is black, and black is the outline every
 * sprite in this style is drawn with, so the outlines would be erased.
 *
 * `minFraction` guards against an opaque sheet with a few stray soft pixels;
 * a real cut-out background is most of the image.
 */
export function isPreKeyed(img, minFraction = 0.02) {
  let clear = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] === 0) clear += 1;
  }
  return clear >= img.width * img.height * minFraction;
}

/**
 * Take one cell out of an already-keyed image, keeping the alpha it arrived
 * with. The counterpart of `keyCell` for a sheet `isPreKeyed` accepts: no key
 * to sample, no despill to undo, and no ruled grid lines to trim, because a
 * sheet delivered with a transparent background has none.
 */
export function alphaCell(img, rect) {
  const data = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const px = pixelAt(img, rect.x + x, rect.y + y);
      const o = (y * rect.w + x) * 4;
      data[o] = px[0];
      data[o + 1] = px[1];
      data[o + 2] = px[2];
      data[o + 3] = px[3];
    }
  }
  return { width: rect.w, height: rect.h, data };
}

/**
 * Bounding box of the art, or null if the cell holds none.
 *
 * A pixel only counts if at least two of its four neighbours are also above
 * `minAlpha`. Every sheet that came back as a JPEG carries ringing around the
 * keyed background, which leaves a handful of isolated specks per cell; without
 * the neighbour test eight stray pixels stretch a blank cell's box to its full
 * size. Real art is contiguous, so a low `minAlpha` can be kept and the faint
 * tail of a death or mist frame still lands inside the box.
 */
export function opaqueBounds(img, minAlpha = 24) {
  const on = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < img.width &&
    y < img.height &&
    img.data[(y * img.width + x) * 4 + 3] >= minAlpha;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (!on(x, y)) continue;
      const neighbours =
        Number(on(x - 1, y)) + Number(on(x + 1, y)) + Number(on(x, y - 1)) + Number(on(x, y + 1));
      if (neighbours < 2) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Which sides of `rect` a bounding box is flush against. Both share an origin. */
export function edgesTouched(bounds, rect) {
  const sides = [];
  if (bounds.y <= rect.y) sides.push('top');
  if (bounds.x <= rect.x) sides.push('left');
  if (bounds.x + bounds.w >= rect.x + rect.w) sides.push('right');
  if (bounds.y + bounds.h >= rect.y + rect.h) sides.push('bottom');
  return sides;
}

/**
 * Make everything outside `rect` fully transparent, in place.
 *
 * Lets a cell be keyed whole — so every frame's bounds share the cell's origin
 * and stay comparable across rows — while the pixels the grid-line trim
 * rejected still play no part in the bounding box.
 */
export function clearOutside(img, rect) {
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      if (!inside) img.data[(y * img.width + x) * 4 + 3] = 0;
    }
  }
  return img;
}

/**
 * The smallest box containing every frame's bounds.
 *
 * Cutting a whole row to this one box is what keeps an animation still: the
 * prompts put the feet (or the object's centre) at the same spot in every cell
 * of a row, so leaving each frame where it sits in the cell and giving them all
 * the same crop preserves that spot exactly. Re-centring each frame on its own
 * bounds is what would make it jitter.
 */
export function unionBounds(boundsList) {
  const present = boundsList.filter(Boolean);
  if (present.length === 0) return null;
  const x0 = Math.min(...present.map((b) => b.x));
  const y0 = Math.min(...present.map((b) => b.y));
  const x1 = Math.max(...present.map((b) => b.x + b.w));
  const y1 = Math.max(...present.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Grow a crop box until it is symmetric about `centre` and clear of the art by
 * `margin` on every side.
 *
 * Only radial art wants this. `unionBounds` deliberately leaves a box where the
 * art sits, which is what keeps a feet-anchored walk cycle from jittering, but
 * it is also tight: on every animation some frame is flush against a box edge,
 * and for a ring that pulses out from the caster that reads as a flat-shaved
 * edge rather than a circle (CO-097). Mirroring the box about the cell centre
 * the ring was drawn around, and then holding it off the edges, frames the ring
 * the way it was authored — the same box for every frame, so nothing jitters.
 *
 * The result can reach past the cell; `crop` fills that with transparent, which
 * is the point: the margin is clear space, never invented art.
 */
export function centreBounds(box, centre, margin) {
  // Whole pixels out: `centre` is half a cell and `margin` a fraction of one,
  // and neither divides evenly on every sheet (`gridSplit` rounds each cell
  // boundary). A fractional rectangle would reach `crop` as a fractional index,
  // which a typed array reads as undefined and stores as a transparent 0.
  const cx = Math.round(centre.x);
  const cy = Math.round(centre.y);
  const hx = Math.ceil(Math.max(cx - box.x, box.x + box.w - cx) + margin);
  const hy = Math.ceil(Math.max(cy - box.y, box.y + box.h - cy) + margin);
  return { x: cx - hx, y: cy - hy, w: hx * 2, h: hy * 2 };
}

/**
 * Copy a sub-rectangle out of an image, filling anything outside it with
 * transparent pixels.
 *
 * The rectangle really can reach past the source, and legitimately so: an
 * animation's crop is the union of its frames' bounds, and when it spans two
 * sheet rows those rows can differ in height by a pixel, because the grid is
 * split by rounding the true image size. The boss's death does exactly that —
 * `boss_states` is 896 px over three rows, so its rows are 299, 298 and 299 px
 * tall. Reading past the buffer would otherwise return `undefined`, which
 * `Uint8ClampedArray` quietly stores as 0; the area beyond a cell holds no art,
 * so writing transparent says that deliberately instead of by accident.
 */
export function crop(img, rect) {
  const data = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    const sy = rect.y + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < rect.w; x += 1) {
      const sx = rect.x + x;
      if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4;
      const d = (y * rect.w + x) * 4;
      data[d] = img.data[s];
      data[d + 1] = img.data[s + 1];
      data[d + 2] = img.data[s + 2];
      data[d + 3] = img.data[s + 3];
    }
  }
  return { width: rect.w, height: rect.h, data };
}

/**
 * Nearest-neighbour downscale to exactly `width` x `height`.
 *
 * Nearest neighbour and not an average: these sheets are pixel art drawn at 4x,
 * so every 4x4 block is one intended pixel and sampling its centre reproduces
 * the artist's pixel. Averaging would soften the hard edges the style depends
 * on and bleed the keyed-out background back in around the silhouette.
 */
export function downscaleNearest(img, width, height) {
  if (width < 1 || height < 1) throw new Error(`downscale target must be >= 1x1`);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width));
      const s = (sy * img.width + sx) * 4;
      const d = (y * width + x) * 4;
      data[d] = img.data[s];
      data[d + 1] = img.data[s + 1];
      data[d + 2] = img.data[s + 2];
      data[d + 3] = img.data[s + 3];
    }
  }
  return { width, height, data };
}

/**
 * Shelf-pack frames into a square-ish atlas.
 *
 * Frames are placed tallest first and, at equal height, in name order, so the
 * same input always produces byte-identical output. `padding` keeps a
 * transparent gutter between frames so Phaser's bilinear filtering cannot pull
 * a neighbour's pixels into a sprite's edge.
 *
 * `usedWidth` already includes the gutter past the last frame on a shelf, so
 * the width rounds up from it directly — adding another would round a run that
 * exactly fills the maximum width up to the next power of two and fail the
 * atlas size check over a gutter that is already there.
 */
export function packFrames(frames, { maxWidth = 2048, padding = 1 } = {}) {
  const sorted = [...frames].sort((a, b) => b.height - a.height || (a.name < b.name ? -1 : 1));
  const placements = [];
  let x = padding;
  let y = padding;
  let shelfHeight = 0;
  let usedWidth = 0;

  for (const f of sorted) {
    if (x + f.width + padding > maxWidth) {
      x = padding;
      y += shelfHeight + padding;
      shelfHeight = 0;
    }
    placements.push({ ...f, x, y });
    x += f.width + padding;
    shelfHeight = Math.max(shelfHeight, f.height);
    usedWidth = Math.max(usedWidth, x);
  }

  return {
    placements,
    width: nextPowerOfTwo(usedWidth),
    height: nextPowerOfTwo(y + shelfHeight + padding),
  };
}

export function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Blit `src` into `dst` at (dx, dy). Both are RGBA images. */
export function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const s = (y * src.width + x) * 4;
      const d = ((dy + y) * dst.width + dx + x) * 4;
      dst.data[d] = src.data[s];
      dst.data[d + 1] = src.data[s + 1];
      dst.data[d + 2] = src.data[s + 2];
      dst.data[d + 3] = src.data[s + 3];
    }
  }
}

/**
 * Expand a manifest row into one entry per declared frame, and report which
 * columns the row declares blank. `frameName` is the atlas key.
 */
export function expandRow(sheetKey, rowSpecs, cols, startIndex = {}) {
  const frames = [];
  const declared = new Set();
  const counters = { ...startIndex };

  for (const seg of rowSpecs) {
    const [from, to] = seg.cols;
    if (from < 1 || to > cols || to < from) {
      throw new Error(`${sheetKey}: segment cols [${from}, ${to}] outside 1..${cols}`);
    }
    const anim = seg.facing ? `${seg.anim}.${seg.facing}` : seg.anim;
    for (let c = from; c <= to; c += 1) {
      if (declared.has(c)) throw new Error(`${sheetKey}: column ${c} declared twice in one row`);
      declared.add(c);
      const index = counters[anim] ?? 0;
      counters[anim] = index + 1;
      frames.push({
        col: c - 1,
        anim,
        index,
        name: `${sheetKey}.${anim}.${index}`,
        allowEdge: seg.allowEdge ?? [],
        centred: seg.centred ?? false,
      });
    }
  }

  const blanks = [];
  for (let c = 1; c <= cols; c += 1) if (!declared.has(c)) blanks.push(c - 1);
  return { frames, blanks, counters };
}

/**
 * Reduce an image to at most `maxColors` colours by median cut.
 *
 * The sheets arrived as JPEGs, so what should be a few dozen flat pixel-art
 * colours is really 130 000 slightly different ones: every flat area carries
 * compression noise. Left alone that noise defeats PNG's filters and the atlas
 * lands near 930 KB, over twice its budget. Collapsing to a palette both puts
 * the flat areas back and lets the atlas ship as an 8-bit indexed PNG.
 *
 * Fully transparent pixels are folded into a single entry so they cost one
 * palette slot rather than one per stray RGB left behind by the key.
 */
export function quantize(img, maxColors = 256) {
  const histogram = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    const key = a < 8 ? '0,0,0,0' : `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]},${a}`;
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }

  const entries = [...histogram].map(([key, count]) => ({ c: key.split(',').map(Number), count }));
  // Sorted up front so the split order, and therefore the palette, depends only
  // on the pixels and not on the order the histogram happened to see them in.
  entries.sort(byColour);

  let boxes = [entries];
  while (boxes.length < maxColors) {
    let target = -1;
    let widest = -1;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const [, range] = widestChannel(box);
      if (range > widest) {
        widest = range;
        target = i;
      }
    });
    if (target < 0) break;

    const box = boxes[target];
    const [channel] = widestChannel(box);
    box.sort((p, q) => p.c[channel] - q.c[channel] || byColour(p, q));
    const half = Math.floor(box.length / 2);
    boxes.splice(target, 1, box.slice(0, half), box.slice(half));
  }

  const palette = boxes.map((box) => {
    const weight = box.reduce((s, e) => s + e.count, 0);
    return [0, 1, 2, 3].map((ch) =>
      Math.round(box.reduce((s, e) => s + e.c[ch] * e.count, 0) / weight),
    );
  });

  const nearest = new Map();
  const indices = new Uint8Array(img.width * img.height);
  for (let p = 0, i = 0; i < img.data.length; i += 4, p += 1) {
    const a = img.data[i + 3];
    const key = a < 8 ? '0,0,0,0' : `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]},${a}`;
    let match = nearest.get(key);
    if (match === undefined) {
      const c = key.split(',').map(Number);
      let best = 0;
      let bestDist = Infinity;
      palette.forEach((q, j) => {
        // Alpha weighted heavily: turning a transparent pixel opaque, or the
        // reverse, shows far more than a small hue shift.
        const d =
          (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2 + ((q[3] - c[3]) * 3) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = j;
        }
      });
      match = best;
      nearest.set(key, match);
    }
    indices[p] = match;
  }

  return { palette, indices };
}

function byColour(p, q) {
  return p.c[0] - q.c[0] || p.c[1] - q.c[1] || p.c[2] - q.c[2] || p.c[3] - q.c[3];
}

function widestChannel(box) {
  let channel = 0;
  let widest = -1;
  for (let ch = 0; ch < 4; ch += 1) {
    let min = 255;
    let max = 0;
    for (const e of box) {
      const v = e.c[ch];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min > widest) {
      widest = max - min;
      channel = ch;
    }
  }
  return [channel, widest];
}
