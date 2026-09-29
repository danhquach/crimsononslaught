/**
 * Prepare the main-menu art (CO-191) from the AI-generated sources in
 * `docs/art/sheets/CO-191/` into `public/assets/menu/`. Run with `npm run art:menu`.
 *
 * These pieces are painted, not pixel art, and are not cut into the atlas: its
 * 4x nearest-neighbour shrink would make them chunky and quantising a page to
 * 256 colours would move every other frame on it. Each ships as its own image.
 *
 *  - menu_bg.jpg     the background painting, area-averaged to the canvas size
 *  - menu_plate.png  the menu plate at rest (top) and lit (bottom), keyed to alpha
 *  - menu_ember.png  four ember flicker frames in a strip, on pure black for an additive blend
 *  - menu_title.png  the two-line painted title keyed off its green, with a shadow and a glow baked in
 *
 * The layout numbers the game needs (frame rects, cap widths) are printed at
 * the end; they live in `src/config/menuArt.ts`, and `menuArt.test.mjs` checks
 * them against the shipped files.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alphaBounds,
  areaAverage,
  crushDark,
  glowTitle,
  keyGreen,
  keyMagenta,
  openAlpha,
  scanData,
  stripMetadata,
} from './lib/menuArt.mjs';
import { blit, capMagenta, crop, opaqueBounds } from './lib/spriteCut.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'docs/art/sheets/CO-191');
const OUT = join(ROOT, 'public/assets/menu');

const SOURCES = [
  'concept_A',
  'menu_bg_source',
  'menu_plates_source',
  'menu_embers_source',
  'menu_title_source',
];
const CANVAS = { width: 960, height: 540 };
const BG_QUALITY = 85;
/** A plate is shrunk by about this much: 950 source px come out near 317. */
const PLATE_SHRINK = 3;
/** Pink tint the JPEG left on the plate's dark rim, capped as the atlas cut does. */
const PLATE_MAGENTA_CAP = 6;
/** A column beyond this multiple of the middle's usual change still belongs to a cap. */
const CAP_CHANGE = 1.6;
/** The plate's outermost source rows are all JPEG fringe; the box comes in this far top and bottom. */
const PLATE_INSET = 2;
/** Ember frames: the square cut round each one, and the size it ships at. */
const EMBER_CROP = 160;
const EMBER_SIZE = 16;
/** JPEG noise on the black: anything this dark becomes pure 0. */
const EMBER_BLACK = 24;
/** The title: keyed, cleaned, shrunk to this tall, then padded for the glow and shadow. */
const TITLE_HEIGHT = 205;
const TITLE_SPECK = 5;
const TITLE_PAD = 27;
const TITLE_SHADOW = { dx: 2, dy: 4, blur: 4, opacity: 0.9 };
const TITLE_GLOW = { blur: 9, color: [190, 15, 30], opacity: 0.55 };

function loadJpeg(name) {
  const raw = jpeg.decode(readFileSync(join(SRC, name)), { useTArray: true, formatAsRGBA: true });
  return { width: raw.width, height: raw.height, data: raw.data };
}

function writePng(name, img) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  writeFileSync(join(OUT, name), PNG.sync.write(png));
}

/**
 * The sources are delivered with metadata: Exif that holds the generation
 * prompt and, in principle, C2PA content credentials. Drop those header segments
 * and keep every other byte, and refuse to write unless the scan data still
 * hashes the same.
 */
function stripMetadataFromSources() {
  for (const name of SOURCES) {
    const file = join(SRC, `${name}.jpg`);
    const bytes = readFileSync(file);
    const clean = stripMetadata(bytes);
    if (clean === bytes) continue;
    const hash = (data) => createHash('sha256').update(scanData(data)).digest('hex');
    if (hash(bytes) !== hash(clean))
      throw new Error(`${name}.jpg: stripping changed the image data`);
    writeFileSync(file, clean);
    console.log(
      `${name}.jpg: dropped ${bytes.length - clean.length} bytes of metadata; scan data sha256 ${hash(clean)} before and after`,
    );
  }
}

function prepBackground() {
  const bg = areaAverage(loadJpeg('menu_bg_source.jpg'), CANVAS.width, CANVAS.height);
  for (let i = 3; i < bg.data.length; i += 4) bg.data[i] = 255;
  const bytes = jpeg.encode(bg, BG_QUALITY).data;
  writeFileSync(join(OUT, 'menu_bg.jpg'), bytes);
  console.log(`menu_bg.jpg ${bg.width}x${bg.height}, ${(bytes.length / 1024).toFixed(0)} KB`);
}

/**
 * The columns each pointed end of a frame takes, measured off the art. How much
 * a column differs from the next is the iron's own texture in the plain middle
 * and far more in a cap, so a cap ends where the change falls back to the
 * middle's. The 3-slice stretches what lies between the caps.
 */
function capWidths(frame) {
  const { width, height } = frame;
  const change = [];
  for (let x = 0; x < width - 1; x += 1) {
    let sum = 0;
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * 4;
      sum += Math.max(...[0, 1, 2].map((k) => Math.abs(frame.data[i + k] - frame.data[i + 4 + k])));
    }
    change.push(sum / height);
  }
  const middle = change.slice(width / 2 - 40, width / 2 + 40);
  const limit = (middle.reduce((a, b) => a + b) / middle.length) * CAP_CHANGE;
  const left = 1 + change.findLastIndex((c, x) => x < width / 4 && c > limit);
  const right = width - 1 - change.findIndex((c, x) => x >= (width * 3) / 4 && c > limit) - 1;
  return { left, right };
}

function prepPlates() {
  const sheet = loadJpeg('menu_plates_source.jpg');
  keyMagenta(sheet);
  const halves = [0, 1].map((i) => {
    const half = crop(sheet, {
      x: 0,
      y: (i * sheet.height) / 2,
      w: sheet.width,
      h: sheet.height / 2,
    });
    return { half, box: opaqueBounds(half, 128) };
  });
  // Both plates share one box size, so the lit one lands on the rest one's rectangle.
  const x0 = Math.min(...halves.map(({ box }) => box.x));
  const w = Math.max(...halves.map(({ box }) => box.x + box.w)) - x0;
  const h = Math.max(...halves.map(({ box }) => box.h));
  const width = Math.round(w / PLATE_SHRINK);
  const height = Math.round((h - 2 * PLATE_INSET) / PLATE_SHRINK);
  const frames = halves.map(({ half, box }) =>
    capMagenta(
      areaAverage(
        crop(half, { x: x0, y: box.y + PLATE_INSET, w, h: h - 2 * PLATE_INSET }),
        width,
        height,
      ),
      PLATE_MAGENTA_CAP,
    ),
  );
  const strip = { width, height: height * 2, data: new Uint8ClampedArray(width * height * 2 * 4) };
  frames.forEach((frame, i) => blit(strip, frame, 0, i * height));
  writePng('menu_plate.png', strip);
  const caps = frames.map(capWidths);
  console.log(
    `menu_plate.png ${strip.width}x${strip.height}: two ${width}x${height} frames (rest y=0, lit y=${height}); caps ${JSON.stringify(caps)}`,
  );
}

function prepEmbers() {
  const sheet = loadJpeg('menu_embers_source.jpg');
  const cell = sheet.width / 4;
  const out = {
    width: EMBER_SIZE * 4,
    height: EMBER_SIZE,
    data: new Uint8ClampedArray(EMBER_SIZE * 4 * EMBER_SIZE * 4),
  };
  for (let i = 0; i < 4; i += 1) {
    // Find the glow on the noise-free black, then cut a square round its centre.
    const lit = crushDark(
      crop(sheet, { x: Math.round(i * cell), y: 0, w: Math.round(cell), h: sheet.height }),
      EMBER_BLACK,
    );
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < lit.height; y += 1) {
      for (let x = 0; x < lit.width; x += 1) {
        if (lit.data[(y * lit.width + x) * 4] + lit.data[(y * lit.width + x) * 4 + 1] === 0)
          continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    const cx = Math.round((x0 + x1) / 2);
    const cy = Math.round((y0 + y1) / 2);
    const square = crop(lit, {
      x: cx - EMBER_CROP / 2,
      y: cy - EMBER_CROP / 2,
      w: EMBER_CROP,
      h: EMBER_CROP,
    });
    for (let p = 3; p < square.data.length; p += 4) square.data[p] = 255;
    blit(
      out,
      crushDark(areaAverage(square, EMBER_SIZE, EMBER_SIZE), EMBER_BLACK / 4),
      i * EMBER_SIZE,
      0,
    );
  }
  writePng('menu_ember.png', out);
  console.log(`menu_ember.png ${out.width}x${out.height}: four ${EMBER_SIZE}x${EMBER_SIZE} frames`);
}

function prepTitle() {
  const keyed = openAlpha(keyGreen(loadJpeg('menu_title_source.jpg')), TITLE_SPECK);
  const box = alphaBounds(keyed, 40);
  const letters = crop(keyed, box);
  const shrunk = areaAverage(
    letters,
    Math.round((letters.width * TITLE_HEIGHT) / letters.height),
    TITLE_HEIGHT,
  );
  const title = glowTitle(shrunk, { pad: TITLE_PAD, shadow: TITLE_SHADOW, glow: TITLE_GLOW });
  writePng('menu_title.png', title);
  console.log(
    `menu_title.png ${title.width}x${title.height}: letters ${shrunk.width}x${shrunk.height} plus ${TITLE_PAD} px all round`,
  );
}

mkdirSync(OUT, { recursive: true });
stripMetadataFromSources();
prepBackground();
prepPlates();
prepEmbers();
prepTitle();
