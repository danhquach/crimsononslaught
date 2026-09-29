/**
 * Pure helpers for preparing the main-menu art (CO-191). All of them work on
 * `{ width, height, data }` RGBA images or raw file bytes, so `menuArt.test.mjs`
 * runs them on synthetic buffers; the file I/O lives in `prep-menu-art.mjs`.
 */

/**
 * Shrink `img` to exactly `width` x `height` by area average: every output
 * pixel is the coverage-weighted mean of the source pixels under it, at
 * fractional edges too. Colour is averaged over the opaque part alone (weighted
 * by alpha), so a keyed-out background never bleeds into the art, and the alpha
 * that comes out is the share of the pixel the art covers.
 */
export function areaAverage(img, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (
        let py = Math.floor(y * sy);
        py < Math.min(img.height, Math.ceil((y + 1) * sy));
        py += 1
      ) {
        const wy = Math.min(py + 1, (y + 1) * sy) - Math.max(py, y * sy);
        for (
          let px = Math.floor(x * sx);
          px < Math.min(img.width, Math.ceil((x + 1) * sx));
          px += 1
        ) {
          const w = wy * (Math.min(px + 1, (x + 1) * sx) - Math.max(px, x * sx));
          const i = (py * img.width + px) * 4;
          const wa = (w * img.data[i + 3]) / 255;
          r += img.data[i] * wa;
          g += img.data[i + 1] * wa;
          b += img.data[i + 2] * wa;
          a += wa;
          area += w;
        }
      }
      const d = (y * width + x) * 4;
      if (a > 0) {
        out[d] = r / a;
        out[d + 1] = g / a;
        out[d + 2] = b / a;
      }
      out[d + 3] = (a / area) * 255;
    }
  }
  return { width, height, data: out };
}

/** How far into the art the hot-pink JPEG fringe is followed, in source px. */
const FRINGE_REACH = 3;

/**
 * Clear the alpha of the magenta key: the house rule (`b > 0.8r && g < 0.6r &&
 * r > 140`), plus the hot-pink JPEG fringe (`b > g + 20` on a bright pixel) for
 * up to `FRINGE_REACH` px out from that key. A dull crimson trim line passes
 * the fringe test too, so the fringe goes only where it hugs the key; followed
 * further it would run along the trim from a pointed tip. In place.
 */
export function keyMagenta(img) {
  const { width, height, data } = img;
  const strict = (i) => data[i + 2] > 0.8 * data[i] && data[i + 1] < 0.6 * data[i] && data[i] > 140;
  const fringe = (i) => data[i] > 140 && data[i + 2] > data[i + 1] + 20;
  const reach = new Int8Array(width * height).fill(-1);
  let ring = [];
  for (let p = 0; p < width * height; p += 1) {
    if (!strict(p * 4)) continue;
    reach[p] = 0;
    ring.push(p);
  }
  for (let step = 1; step <= FRINGE_REACH; step += 1) {
    const next = [];
    for (const p of ring) {
      const x = p % width;
      const y = (p - x) / width;
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (reach[n] >= 0 || !fringe(n * 4)) continue;
        reach[n] = step;
        next.push(n);
      }
    }
    ring = next;
  }
  for (let p = 0; p < width * height; p += 1) if (reach[p] >= 0) data[p * 4 + 3] = 0;
  return img;
}

/**
 * Set every pixel whose brightest channel is at most `floor` to pure black,
 * so an additive blend of the sprite leaves the backdrop alone. In place.
 */
export function crushDark(img, floor) {
  for (let i = 0; i < img.data.length; i += 4) {
    if (Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) > floor) continue;
    img.data[i] = 0;
    img.data[i + 1] = 0;
    img.data[i + 2] = 0;
  }
  return img;
}

/**
 * Key a title painted on flat #00FF00 to alpha, in place: the more a pixel's
 * green leads its red and blue, the more it is background (fully so past a lead
 * of 120), and green never stays above the other two, so no green rim is left
 * on a soft edge.
 */
export function keyGreen(img) {
  for (let i = 0; i < img.data.length; i += 4) {
    const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
    const lead = g - Math.max(r, b);
    const alpha = Math.min(1, Math.max(0, 1 - (lead - 40) / 80));
    img.data[i + 1] = Math.min(g, Math.max(r, b));
    img.data[i + 3] = Math.round(alpha * 255);
  }
  return img;
}

/** Separable min or max over a square window of `size` px, on the alpha channel. In place. */
function windowAlpha(img, size, pick) {
  const half = (size - 1) / 2;
  const { width, height, data } = img;
  const pass = (along, across, step, lines, length) => {
    for (let line = 0; line < lines; line += 1) {
      const original = Array.from({ length }, (_, k) => data[(line * across + k * along) * 4 + 3]);
      for (let k = 0; k < length; k += 1) {
        let value = original[k];
        for (let d = -half; d <= half; d += step) {
          const n = original[Math.min(length - 1, Math.max(0, k + d))];
          value = pick(value, n);
        }
        data[(line * across + k * along) * 4 + 3] = value;
      }
    }
  };
  pass(1, width, 1, height, width);
  pass(width, 1, 1, width, height);
}

/**
 * Drop JPEG specks from a keyed alpha: a min filter erases anything narrower
 * than `size`, and the max filter that follows grows what is left back to its
 * own size. In place.
 */
export function openAlpha(img, size) {
  windowAlpha(img, size, Math.min);
  windowAlpha(img, size, Math.max);
  return img;
}

/** The box, as {x, y, w, h}, of every pixel whose alpha is above `min`; null with none. */
export function alphaBounds(img, min) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (img.data[(y * img.width + x) * 4 + 3] <= min) continue;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** A Gaussian blur of a 0..1 plane of `width` x `height`, `sigma` px, edges clamped. */
function blurPlane(plane, width, height, sigma) {
  const reach = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: reach * 2 + 1 }, (_, k) =>
    Math.exp(-((k - reach) ** 2) / (2 * sigma ** 2)),
  );
  const total = kernel.reduce((a, b) => a + b);
  const run = (from, sizeAlong, sizeAcross, at) => {
    const out = new Float32Array(from.length);
    for (let a = 0; a < sizeAcross; a += 1) {
      for (let k = 0; k < sizeAlong; k += 1) {
        let sum = 0;
        for (let d = -reach; d <= reach; d += 1) {
          const n = Math.min(sizeAlong - 1, Math.max(0, k + d));
          sum += from[at(a, n)] * kernel[d + reach];
        }
        out[at(a, k)] = sum / total;
      }
    }
    return out;
  };
  const across = run(plane, width, height, (row, x) => row * width + x);
  return run(across, height, width, (col, y) => y * width + col);
}

/**
 * A keyed title on a transparent canvas `pad` px larger on every side, with a
 * dark drop shadow (the letters' alpha moved by `shadow.dx, dy`, blurred, black)
 * and, under that, a glow (the alpha blurred wide, in `glow.color`) baked in, so
 * the game draws one image. Straight alpha, composited back to front.
 */
export function glowTitle(title, { pad, shadow, glow }) {
  const width = title.width + pad * 2;
  const height = title.height + pad * 2;
  const alpha = new Float32Array(width * height);
  for (let y = 0; y < title.height; y += 1) {
    for (let x = 0; x < title.width; x += 1) {
      alpha[(y + pad) * width + x + pad] = title.data[(y * title.width + x) * 4 + 3] / 255;
    }
  }
  const shifted = new Float32Array(alpha.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [sx, sy] = [x - shadow.dx, y - shadow.dy];
      if (sx >= 0 && sy >= 0 && sx < width && sy < height)
        shifted[y * width + x] = alpha[sy * width + sx];
    }
  }
  const layers = [
    { plane: blurPlane(alpha, width, height, glow.blur), color: glow.color, opacity: glow.opacity },
    {
      plane: blurPlane(shifted, width, height, shadow.blur),
      color: [0, 0, 0],
      opacity: shadow.opacity,
    },
  ];
  const out = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  for (let p = 0; p < width * height; p += 1) {
    let [r, g, b, a] = [0, 0, 0, 0];
    const over = (color, top) => {
      const merged = top + a * (1 - top);
      if (merged === 0) return;
      [r, g, b] = [0, 1, 2].map((k) => (color[k] * top + [r, g, b][k] * a * (1 - top)) / merged);
      a = merged;
    };
    for (const layer of layers) over(layer.color, layer.plane[p] * layer.opacity);
    const x = (p % width) - pad;
    const y = Math.floor(p / width) - pad;
    if (x >= 0 && y >= 0 && x < title.width && y < title.height) {
      const i = (y * title.width + x) * 4;
      over([title.data[i], title.data[i + 1], title.data[i + 2]], title.data[i + 3] / 255);
    }
    out.data.set([r, g, b, a * 255], p * 4);
  }
  return out;
}
