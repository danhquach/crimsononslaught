#!/usr/bin/env node
/**
 * Cut the sourced sound effects to game length (CO-177).
 * `npm run audio:cut -- <dir>`.
 *
 *   in   <dir>/<slug>.wav                 the originals, from `DOWNLOAD_URL`
 *   out  public/assets/audio/<key>.wav    one clip per `SOURCED` entry
 *
 * Each original must match its pinned `sha256`. ffmpeg (on the PATH) only
 * decodes it to mono at the game's sample rate; the trim, fades and peak are
 * `cutClip`, `normalize` and `wavBytes`, so a sourced clip ships in exactly the
 * format and at the same peak as a generated one.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOWNLOAD_URL, SOURCED, cutClip } from './lib/sourcedAudio.mjs';
import { SAMPLE_RATE, normalize, wavBytes } from './lib/synth.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'audio');

const dir = process.argv[2];
if (!dir) {
  console.error('usage: npm run audio:cut -- <dir holding the downloaded originals>');
  process.exit(1);
}

for (const [key, source] of Object.entries(SOURCED)) {
  const file = join(dir, `${source.slug}.wav`);
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (hash !== source.sha256) {
    console.error(
      `${file}: sha256 ${hash}, expected ${source.sha256} (${DOWNLOAD_URL(source.slug)})`,
    );
    process.exit(1);
  }
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const decoded = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const wav = wavBytes(normalize(cutClip(Array.from(decoded), source)));
  writeFileSync(join(OUT_DIR, `${key}.wav`), wav);
  console.log(`${key}.wav  ${((wav.length - 44) / 2 / SAMPLE_RATE).toFixed(2)} s  ${source.slug}`);
}
