#!/usr/bin/env node
/**
 * Cut the authored sprite sheets into a Phaser atlas (CO-080). `npm run art:cut`.
 *
 *   in   docs/art/sheets/manifest.json + the 18 sheets it names (not shipped)
 *   out  public/assets/atlas/props.png    page 1, the packed atlas
 *        public/assets/atlas/props.json   page 1 Phaser JSON-hash frame data
 *        public/assets/atlas/propsN.png   one more pair per further page
 *        src/config/frames.ts             generated, checked in
 *
 * The manifest is the only place that knows what any sheet contains; nothing
 * about a particular sheet is hardcoded here. The cut itself is in
 * `lib/spriteCut.mjs`, which is unit-tested on synthetic buffers.
 *
 * Run is idempotent: same inputs produce byte-identical outputs.
 */

import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alphaCell,
  blit,
  centreBounds,
  clearOutside,
  cornerKey,
  crop,
  downscaleNearest,
  edgesTouched,
  expandRow,
  gridSplit,
  insetRect,
  isPreKeyed,
  keyCell,
  opaqueBounds,
  packFrames,
  quantize,
  trimBorderLines,
  unionBounds,
} from './lib/spriteCut.mjs';
import { encodeIndexedPng } from './lib/indexedPng.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET_DIR = join(ROOT, 'docs/art/sheets');
const ATLAS_DIR = join(ROOT, 'public/assets/atlas');
const FRAMES_TS = join(ROOT, 'src/config/frames.ts');

/** How far in from a cell corner the background key is sampled, past any line. */
const KEY_INSET = 0.06;
/** Colour distance at which a pixel is fully background / fully foreground. */
const TOL_KEYED = 60;
const TOL_SOLID = 130;
/** Art is downscaled by this factor: the sheets are drawn at 4x native size. */
const SCALE = 4;
/** Clear space a `centred` animation keeps between its art and its frame edge, in native px. */
const FRAME_MARGIN = 1;
/** Byte budget each page carries on its own (CO-130). */
const PAGE_BUDGET = 400 * 1024;

const failures = [];
function fail(message) {
  failures.push(message);
}

function loadImage(file) {
  const bytes = readFileSync(file);
  if (extname(file).toLowerCase() === '.png') {
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, data: png.data };
  }
  const raw = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { width: raw.width, height: raw.height, data: raw.data };
}

/**
 * Cut one sheet. Returns the frames it produced, each already downscaled to
 * native size, plus the anchor that keeps its row steady.
 */
function cutSheet(sheet) {
  const img = loadImage(join(SHEET_DIR, sheet.file));
  const cells = gridSplit(img.width, img.height, sheet.cols, sheet.rows);
  const nativeCell = sheet.sheetCell / SCALE;
  // A sheet that arrived with its background already cut away is taken as it
  // is; only a flattened one is keyed by colour (CO-123).
  const preKeyed = isPreKeyed(img);
  const cut = [];
  // Frame numbering continues across rows, so the boss death can span two.
  let counters = {};

  sheet.rowSpecs.forEach((rowSpec, row) => {
    const { frames, blanks, counters: next } = expandRow(sheet.key, rowSpec, sheet.cols, counters);
    counters = next;

    // The cell is keyed whole and the grid-line band is then cleared, so every
    // frame's bounds are in cell coordinates and stay comparable between cells
    // and between rows — which is what lets an animation spanning two rows
    // share one crop. The key is sampled per cell, not per sheet, because
    // hero_states is a different mauve on each row, and sampled inset so a
    // ruled line cannot poison it.
    const cellOf = (col) => {
      const cell = cells[row * sheet.cols + col];
      if (preKeyed) {
        const local = { x: 0, y: 0, w: cell.w, h: cell.h };
        return { cell, keyed: alphaCell(img, cell, sheet.alphaThreshold ?? 0), local };
      }
      const key = cornerKey(img, insetRect(cell, KEY_INSET));
      const kept = trimBorderLines(img, cell, key, TOL_KEYED, TOL_SOLID);
      const local = { x: kept.x - cell.x, y: kept.y - cell.y, w: kept.w, h: kept.h };
      const keyed = clearOutside(keyCell(img, cell, key, TOL_KEYED, TOL_SOLID), local);
      return { cell, keyed, local };
    };
    const where = (col) => `${sheet.file} row ${row + 1} col ${col + 1}`;

    // Declared-blank columns must really be blank.
    for (const col of blanks) {
      const { keyed, local } = cellOf(col);
      const bounds = opaqueBounds(keyed);
      if (bounds && bounds.w * bounds.h > local.w * local.h * 0.001) {
        fail(`${where(col)}: declared blank but holds art (${bounds.w}x${bounds.h} px)`);
      }
    }

    for (const f of frames) {
      const { cell, keyed, local } = cellOf(f.col);
      const bounds = opaqueBounds(keyed);
      if (!bounds) {
        fail(`${where(f.col)}: declared frame ${f.name} but the cell is empty`);
        continue;
      }
      const touched = edgesTouched(bounds, local).filter((s) => !f.allowEdge.includes(s));
      if (touched.length > 0) {
        fail(`${where(f.col)}: ${f.name} runs off the ${touched.join(' and ')} cell edge`);
      }
      cut.push({ ...f, cell, keyed, bounds });
    }
  });

  // One crop per animation, not per row: every frame of an animation must come
  // out the same size and keep the cell's centre in the same place, or it jumps
  // as it plays. Taking the union of the whole animation's bounds does both,
  // and leaving each frame where it sits inside that box preserves the feet
  // line the sheets were drawn around.
  const out = [];
  for (const anim of new Set(cut.map((c) => c.anim))) {
    const group = cut.filter((c) => c.anim === anim);
    const cell = group[0].cell;
    const scale = cell.h / nativeCell;
    const centred = group[0].centred;
    if (group.some((c) => c.centred !== centred)) {
      fail(`${sheet.file}: ${anim} is declared centred on some rows and not on others`);
    }
    // A `centred` row (the nova) mirrors that tight box about the cell centre
    // and holds it off the art, so radial FX come out whole and centred on
    // their anchor instead of shaved flat against a box they just fill
    // (CO-097). Every other row keeps the box where its art sits.
    const tight = unionBounds(group.map((c) => c.bounds));
    const box = centred
      ? centreBounds(tight, { x: cell.w / 2, y: cell.h / 2 }, FRAME_MARGIN * scale)
      : tight;
    const anchorX = Math.round((cell.w / 2 - box.x) / scale);
    const anchorY = Math.round((cell.h / 2 - box.y) / scale);
    // A centred frame is sized from its own anchor rather than by rounding the
    // box again: the two roundings disagree for half of all half-extents (a
    // 417 px box is a 104 px anchor in a 105 px frame), and the frame would
    // then have no centre column for the anchor to sit in. Half a pixel comes
    // off the box instead, out of the margin, which is what the margin is for.
    const width = centred ? anchorX * 2 : Math.max(1, Math.round(box.w / scale));
    const height = centred ? anchorY * 2 : Math.max(1, Math.round(box.h / scale));
    if (width < 1 || height < 1) {
      fail(`${sheet.file}: ${anim} cuts to an empty ${width}x${height} frame`);
      continue;
    }

    for (const c of group) {
      out.push({
        name: c.name,
        anim: c.anim,
        index: c.index,
        image: downscaleNearest(crop(c.keyed, box), width, height),
        width,
        height,
        // Where the cell's centre sits inside the frame, in native px, so the
        // game can place a sprite without it drifting between frames.
        anchorX,
        anchorY,
      });
    }
  }

  return out;
}

/** Texture key, and so file name, of page `page`. Page 1 keeps the original name. */
function pageKey(page) {
  return page === 1 ? 'props' : `props${page}`;
}

/**
 * Pack, quantise and write one page. Returns its placements, tagged with the
 * texture key that holds them, and the bytes the PNG came to.
 *
 * A page is quantised on its own, so each carries its own 256-colour palette
 * and moving a sheet between pages shifts exact pixel colours on both (CO-130).
 */
function writePage(page, frames) {
  const key = pageKey(page);
  const { placements, width, height } = packFrames(frames);
  if (width > 2048 || height > 2048) {
    console.error(`art:cut failed: page ${key} is ${width}x${height}, over the 2048x2048 limit`);
    process.exit(1);
  }

  const atlas = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  for (const p of placements) blit(atlas, p.image, p.x, p.y);
  const { palette, indices } = quantize(atlas, 256);

  // Frame data in name order, so the JSON is stable whatever the packer did.
  const byName = [...placements].sort((a, b) => (a.name < b.name ? -1 : 1));
  const json = {
    frames: Object.fromEntries(
      byName.map((p) => [
        p.name,
        {
          frame: { x: p.x, y: p.y, w: p.width, h: p.height },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: p.width, h: p.height },
          sourceSize: { w: p.width, h: p.height },
        },
      ]),
    ),
    meta: {
      app: 'scripts/cut-sheets.mjs',
      format: 'RGBA8888',
      size: { w: width, h: height },
      scale: '1',
    },
  };

  writeFileSync(join(ATLAS_DIR, `${key}.png`), encodeIndexedPng(width, height, palette, indices));
  writeFileSync(join(ATLAS_DIR, `${key}.json`), `${JSON.stringify(json, null, 2)}\n`);

  const bytes = readFileSync(join(ATLAS_DIR, `${key}.png`)).length;
  console.log(
    `art:cut wrote ${key}: ${byName.length} frames, ${width}x${height}, ${(bytes / 1024).toFixed(1)} KB`,
  );
  return { key, placements: byName.map((p) => ({ ...p, page: key })), bytes };
}

function main() {
  const manifest = JSON.parse(readFileSync(join(SHEET_DIR, 'manifest.json'), 'utf8'));

  const frames = [];
  const seen = new Set();
  for (const sheet of manifest.sheets) {
    const page = sheet.page ?? 1;
    if (!Number.isInteger(page) || page < 1) {
      fail(`${sheet.file}: page must be a whole number from 1, not ${JSON.stringify(sheet.page)}`);
      continue;
    }
    for (const frame of cutSheet(sheet)) {
      if (seen.has(frame.name)) fail(`${sheet.file}: duplicate frame name ${frame.name}`);
      seen.add(frame.name);
      frames.push({ ...frame, page });
    }
  }

  if (failures.length > 0) {
    console.error(`art:cut failed with ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  mkdirSync(ATLAS_DIR, { recursive: true });
  const pages = [...new Set(frames.map((f) => f.page))].sort((a, b) => a - b);
  const written = pages.map((page) =>
    writePage(
      page,
      frames.filter((f) => f.page === page),
    ),
  );

  // A page the sheets no longer fill would otherwise sit in public/ for ever,
  // shipped with the game and named by nothing, so the run owns the directory:
  // whatever matches an atlas page's name and is not a page it just wrote goes.
  const kept = new Set(written.flatMap((w) => [`${w.key}.png`, `${w.key}.json`]));
  for (const file of readdirSync(ATLAS_DIR)) {
    if (!/^props\d*\.(png|json)$/.test(file) || kept.has(file)) continue;
    rmSync(join(ATLAS_DIR, file));
    console.log(`art:cut removed ${file}, which no sheet fills any more`);
  }

  // Frame data across every page, in name order: the frames.ts each animation
  // is checked against does not care which page a frame landed on, only which
  // texture key to ask for.
  const byName = written.flatMap((w) => w.placements).sort((a, b) => (a.name < b.name ? -1 : 1));
  writeFileSync(
    FRAMES_TS,
    renderFramesTs(
      byName,
      written.map((w) => w.key),
    ),
  );

  // Every page is written before any budget is enforced, so a run that busts
  // the cap still leaves the art on disk to look at and names every page over.
  const over = written.filter((w) => w.bytes > PAGE_BUDGET);
  if (over.length > 0) {
    for (const w of over) {
      console.error(
        `art:cut failed: page ${w.key} is ${(w.bytes / 1024).toFixed(1)} KB, over the ${PAGE_BUDGET / 1024} KB budget`,
      );
    }
    process.exit(1);
  }
}

function renderFramesTs(placements, pageKeys) {
  const lines = placements.map(
    (p) =>
      `  '${p.name}': { w: ${p.width}, h: ${p.height}, anchorX: ${p.anchorX}, anchorY: ${p.anchorY}, page: '${p.page}' },`,
  );
  const pages = pageKeys.map(
    (key) =>
      `  { key: '${key}', texture: 'assets/atlas/${key}.png', data: 'assets/atlas/${key}.json' },`,
  );
  return `// GENERATED by scripts/cut-sheets.mjs (npm run art:cut). Do not edit by hand.
//
// Every frame in the atlas, with its native size, the anchor point the sheet
// was drawn around, and the page holding it. Checked in so src/config stays a
// pure-data layer that unit tests can read without touching the atlas.

export interface AtlasPage {
  /** Phaser texture key. */
  key: string;
  /** Paths under public/, as the loader asks for them. */
  texture: string;
  data: string;
}

/** The atlas pages, in page order. */
export const ATLAS_PAGES = [
${pages.join('\n')}
] as const satisfies readonly AtlasPage[];

/** Texture key of an atlas page. */
export type AtlasKey = (typeof ATLAS_PAGES)[number]['key'];

export interface FrameInfo {
  /** Native frame size in game px. */
  w: number;
  h: number;
  /** The cell's centre point, in px from the frame's top-left corner. */
  anchorX: number;
  anchorY: number;
  /**
   * The page holding this frame. Each page is its own texture with its own
   * palette, so a frame is only ever drawn from the key named here.
   */
  page: AtlasKey;
}

export const FRAMES = {
${lines.join('\n')}
} as const satisfies Record<string, FrameInfo>;

export type FrameName = keyof typeof FRAMES;

export const FRAME_NAMES = Object.keys(FRAMES) as FrameName[];
`;
}

main();
