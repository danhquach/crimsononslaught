#!/usr/bin/env node
/**
 * Zip the production build for itch.io (#422). `npm run package:itch`.
 *
 *   out  dist-itch/crimson-onslaught-<version>-web.zip   the contents of dist/, index.html at the root
 *
 * Builds first (`npm run build`), so the zip always matches the checkout. The
 * Help form's access key is baked in at build time from `.env`
 * (`VITE_FEEDBACK_ACCESS_KEY`); without it the zip works but has no feedback
 * form, which this script warns about and never prints the key. Then checks the
 * limits itch.io puts on an HTML upload (fewer than 1000 files, under 500 MB
 * zipped and unpacked) and that `index.html` is at the top, not under `dist/`.
 * Exits 1 if `zip` is missing, the build fails or a check fails.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import pkg from '../package.json' with { type: 'json' };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'dist-itch');
const OUT = join(OUT_DIR, `crimson-onslaught-${pkg.version}-web.zip`);

const MAX_ENTRIES = 1000;
const MAX_BYTES = 500 * 1024 * 1024;

function fail(message) {
  console.error(`package:itch: ${message}`);
  process.exit(1);
}

if (!loadEnv('production', ROOT, 'VITE_').VITE_FEEDBACK_ACCESS_KEY) {
  console.warn(
    [
      '',
      '!!! VITE_FEEDBACK_ACCESS_KEY is empty: this zip will have NO feedback form on its Help screen.',
      '!!! Copy .env.example to .env and set the key to build the one you upload.',
      '',
    ].join('\n'),
  );
}

const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
if (build.status !== 0) fail('the build failed');

// Recreated, so an older version's zip is never mistaken for this one.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR);
try {
  // -X drops file times and owners, so the same build zips the same way.
  execFileSync('zip', ['-r', '-X', '-q', OUT, '.'], { cwd: DIST, stdio: 'inherit' });
} catch (error) {
  if (error.code === 'ENOENT') fail('the `zip` command is not installed; install zip and retry');
  throw error;
}

function unzip(args) {
  try {
    return execFileSync('unzip', [...args, OUT], { encoding: 'utf8' });
  } catch (error) {
    if (error.code === 'ENOENT')
      fail('the `unzip` command is not installed; install unzip and retry');
    throw error;
  }
}

const names = unzip(['-Z1']).split('\n').filter(Boolean);
const files = names.filter((name) => !name.endsWith('/'));
const unpacked = Number(unzip(['-Zt']).match(/(\d+) bytes uncompressed/)?.[1]);
const zipped = statSync(OUT).size;

if (!names.includes('index.html')) fail('index.html is not at the zip root');
if (names.some((name) => name.startsWith('dist/'))) fail('entries sit under dist/');
if (files.length >= MAX_ENTRIES)
  fail(`${files.length} files; itch.io allows fewer than ${MAX_ENTRIES}`);
if (zipped >= MAX_BYTES) fail('the zip is 500 MB or more');
if (!(unpacked < MAX_BYTES)) fail('the unpacked size is 500 MB or more (or could not be read)');

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(
  `package:itch: dist-itch/${basename(OUT)}: ${files.length} files, ${mb(zipped)} MB zipped, ${mb(unpacked)} MB unpacked`,
);
