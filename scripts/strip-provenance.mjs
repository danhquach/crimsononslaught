#!/usr/bin/env node
/**
 * Strip generator provenance from delivered art (#317). `npm run art:strip`.
 *
 *   npm run art:strip                 every PNG and JPEG under docs/ and public/
 *   npm run art:strip -- <path> ...   these files, or the images under these directories
 *
 * Keeps the image data and the colour, density and animation chunks and drops
 * everything else `lib/provenance.mjs` finds (C2PA, Exif / XMP, comments, PNG
 * text chunks, trailing bytes). A file is only rewritten once two checks pass:
 * its image data (`scanData`) is byte-identical after the strip, which only
 * proves the re-parse is stable, and it decodes to the same width, height and
 * RGBA pixels, which is the real gate. Exits 1 if either check fails, a path is
 * missing or a file cannot be read as PNG or JPEG.
 */

import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findProvenance, scanData, stripProvenance } from './lib/provenance.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg'];

function imagesUnder(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return imagesUnder(child);
    return IMAGE_EXTS.includes(extname(entry.name).toLowerCase()) ? [child] : [];
  });
}

function decode(file, bytes) {
  if (extname(file).toLowerCase() === '.png') {
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, data: png.data };
  }
  const raw = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { width: raw.width, height: raw.height, data: raw.data };
}

function samePixels(a, b) {
  return (
    a.width === b.width && a.height === b.height && Buffer.from(a.data).equals(Buffer.from(b.data))
  );
}

let changed = 0;
let saved = 0;
let failed = 0;
let checked = 0;

function reject(file, err) {
  failed++;
  console.error(`${relative(ROOT, file)}: not written, ${err.message}`);
}

function strip(file) {
  checked++;
  try {
    const bytes = readFileSync(file);
    const found = findProvenance(bytes);
    if (found.length === 0) return;
    const clean = stripProvenance(bytes);
    if (!scanData(clean).equals(scanData(bytes))) throw new Error('the image data changed');
    if (!samePixels(decode(file, bytes), decode(file, clean)))
      throw new Error('the pixels changed');
    writeFileSync(file, clean);
    changed++;
    saved += bytes.length - clean.length;
    console.log(
      `${relative(ROOT, file)}: dropped ${found.join(', ')} (${bytes.length - clean.length} bytes)`,
    );
  } catch (err) {
    reject(file, err);
  }
}

const args = process.argv.slice(2).map((p) => resolve(p));
for (const target of args.length > 0 ? args : [join(ROOT, 'docs'), join(ROOT, 'public')]) {
  let files = [];
  try {
    files = imagesUnder(target);
  } catch (err) {
    reject(target, err);
  }
  files.forEach(strip);
}
console.log(`art:strip checked ${checked} images, stripped ${changed}, saved ${saved} bytes`);
if (failed > 0) {
  console.error(`art:strip failed on ${failed} file(s)`);
  process.exit(1);
}
