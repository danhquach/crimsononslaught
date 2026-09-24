import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkSheetFiles } from './sheetFiles.mjs';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe('checkSheetFiles', () => {
  let dir;
  const put = (file, bytes) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), bytes);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sheet-files-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes files whose signature matches their extension', () => {
    put('A/one.png', PNG_BYTES);
    put('A/two.jpg', JPEG_BYTES);
    put('A/three.jpeg', JPEG_BYTES);
    const sheets = [{ file: 'A/one.png' }, { file: 'A/two.jpg' }, { file: 'A/three.jpeg' }];

    expect(checkSheetFiles(sheets, dir)).toEqual([]);
  });

  it('reports a file the manifest names that is not on disk', () => {
    expect(checkSheetFiles([{ file: 'A/gone.png' }], dir)).toEqual([
      'A/gone.png: named in the manifest but not on disk',
    ]);
  });

  it('reports a JPEG renamed to .png, and a PNG renamed to .jpg', () => {
    put('A/renamed.png', JPEG_BYTES);
    put('A/other.jpg', PNG_BYTES);

    expect(checkSheetFiles([{ file: 'A/renamed.png' }, { file: 'A/other.jpg' }], dir)).toEqual([
      'A/renamed.png: extension says PNG but the file is JPEG',
      'A/other.jpg: extension says JPEG but the file is PNG',
    ]);
  });

  it('reports a file that is neither format', () => {
    put('A/text.png', Buffer.from('not an image'));

    expect(checkSheetFiles([{ file: 'A/text.png' }], dir)).toEqual([
      'A/text.png: extension says PNG but the file is unknown',
    ]);
  });

  it('reports an extension the cutter cannot decode', () => {
    put('A/sheet.webp', PNG_BYTES);

    expect(checkSheetFiles([{ file: 'A/sheet.webp' }], dir)).toEqual([
      'A/sheet.webp: extension .webp is not .png, .jpg or .jpeg',
    ]);
  });

  it('reports a same-named sibling in another format', () => {
    put('A/hero.jpg', JPEG_BYTES);
    put('A/hero.png', PNG_BYTES);
    put('A/hero_states.png', PNG_BYTES);

    expect(checkSheetFiles([{ file: 'A/hero.jpg' }], dir)).toEqual([
      'A/hero.jpg: sibling hero.png has the same name in another format',
    ]);
  });

  it('finds nothing wrong with the committed sheets', () => {
    const sheetDir = join(dirname(fileURLToPath(import.meta.url)), '../../docs/art/sheets');
    const manifest = JSON.parse(readFileSync(join(sheetDir, 'manifest.json'), 'utf8'));

    expect(checkSheetFiles(manifest.sheets, sheetDir)).toEqual([]);
  });
});
