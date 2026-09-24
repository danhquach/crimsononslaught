/**
 * Check that every sheet the manifest names is on disk in the format its
 * extension claims (#113). The cutter picks its decoder by extension, so a
 * missing file crashes `art:cut` with ENOENT and a JPEG renamed to `.png` dies
 * inside pngjs (CO-124 hit exactly that). This finds both up front, plus a
 * same-named sibling in another format, which is how a re-delivery that was
 * never wired into the manifest sits unnoticed beside the file it replaces.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8];
const FORMAT_OF_EXT = { '.png': 'PNG', '.jpg': 'JPEG', '.jpeg': 'JPEG' };

function formatOf(bytes) {
  const starts = (magic) => magic.every((b, i) => bytes[i] === b);
  if (starts(PNG_MAGIC)) return 'PNG';
  if (starts(JPEG_MAGIC)) return 'JPEG';
  return 'unknown';
}

/**
 * @param {{ file: string }[]} sheets  the manifest's `sheets`
 * @param {string} dir  the directory `file` paths are relative to
 * @returns {string[]} one message per problem; empty when every file is sound
 */
export function checkSheetFiles(sheets, dir) {
  const problems = [];
  for (const { file } of sheets) {
    const path = join(dir, file);
    const ext = extname(file).toLowerCase();
    const expected = FORMAT_OF_EXT[ext];
    if (!expected) {
      problems.push(`${file}: extension ${ext || '(none)'} is not .png, .jpg or .jpeg`);
      continue;
    }
    if (!existsSync(path)) {
      problems.push(`${file}: named in the manifest but not on disk`);
      continue;
    }
    const actual = formatOf(readFileSync(path));
    if (actual !== expected) {
      problems.push(`${file}: extension says ${expected} but the file is ${actual}`);
    }
    const stem = basename(file, extname(file));
    for (const other of readdirSync(dirname(path))) {
      if (other !== basename(file) && basename(other, extname(other)) === stem) {
        problems.push(`${file}: sibling ${other} has the same name in another format`);
      }
    }
  }
  return problems;
}
