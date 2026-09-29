import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { findProvenance, pngChunks, scanData, stripProvenance } from './provenance.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// The walker does not check CRCs, so a fixed one stands in.
const chunk = (type, size = 4) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(size, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, Buffer.alloc(size, 7), Buffer.from([1, 2, 3, 4])]);
};
const pngOf = (...chunks) => Buffer.concat([PNG_SIGNATURE, ...chunks]);

const segment = (marker, body = Buffer.alloc(10, 7)) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
};
const app = (n, text = '') => segment(0xe0 + n, Buffer.from(`${text}\0payload`, 'latin1'));
const SOS = Buffer.from([0xff, 0xda, 0, 2, 1, 2, 0xff, 0xd9]);
const jpegOf = (...segments) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...segments, SOS]);

describe('PNG provenance', () => {
  it('drops caBX, text chunks and Exif, and keeps the image and colour chunks', () => {
    const keep = [chunk('IHDR', 13), chunk('sRGB', 1), chunk('PLTE', 6), chunk('IDAT', 20)];
    const dirty = pngOf(
      keep[0],
      chunk('caBX', 40),
      keep[1],
      chunk('tEXt', 12),
      chunk('iTXt', 12),
      chunk('eXIf', 12),
      keep[2],
      keep[3],
      chunk('IEND', 0),
    );

    expect(findProvenance(dirty)).toEqual(['caBX', 'tEXt', 'iTXt', 'eXIf']);
    expect(stripProvenance(dirty)).toEqual(pngOf(...keep, chunk('IEND', 0)));
    expect(pngChunks(stripProvenance(dirty))).toEqual(['IHDR', 'sRGB', 'PLTE', 'IDAT', 'IEND']);
  });

  it('keeps tRNS, iCCP, pHYs and an APNG chunk, and drops tIME', () => {
    const clean = pngOf(
      chunk('IHDR', 13),
      chunk('acTL', 8),
      chunk('iCCP', 30),
      chunk('pHYs', 9),
      chunk('tRNS', 6),
      chunk('IDAT', 20),
      chunk('fdAT', 20),
      chunk('IEND', 0),
    );
    const dirty = pngOf(
      chunk('IHDR', 13),
      chunk('acTL', 8),
      chunk('iCCP', 30),
      chunk('pHYs', 9),
      chunk('tIME', 7),
      chunk('tRNS', 6),
      chunk('IDAT', 20),
      chunk('fdAT', 20),
      chunk('IEND', 0),
    );

    expect(findProvenance(clean)).toEqual([]);
    expect(findProvenance(dirty)).toEqual(['tIME']);
    expect(stripProvenance(dirty)).toEqual(clean);
  });

  it('drops bytes trailing IEND', () => {
    const clean = pngOf(chunk('IHDR', 13), chunk('IDAT', 20), chunk('IEND', 0));
    const dirty = Buffer.concat([clean, Buffer.from('trailing')]);

    expect(findProvenance(dirty)).toEqual(['trailing data']);
    expect(stripProvenance(dirty)).toEqual(clean);
  });

  it('hands back the same object when the file is clean', () => {
    const clean = pngOf(chunk('IHDR', 13), chunk('gAMA', 4), chunk('IDAT', 20), chunk('IEND', 0));

    expect(findProvenance(clean)).toEqual([]);
    expect(stripProvenance(clean)).toBe(clean);
  });

  it('scanData is the header, palette, transparency and pixel chunks in order', () => {
    const [ihdr, plte, idat1, idat2] = [
      chunk('IHDR', 13),
      chunk('PLTE', 6),
      chunk('IDAT', 9),
      chunk('IDAT', 5),
    ];
    const dirty = pngOf(
      ihdr,
      chunk('caBX', 40),
      plte,
      idat1,
      chunk('tEXt', 3),
      idat2,
      chunk('IEND', 0),
    );

    expect(scanData(dirty)).toEqual(Buffer.concat([ihdr, plte, idat1, idat2]));
  });

  it('refuses an unknown critical chunk', () => {
    expect(() =>
      stripProvenance(pngOf(chunk('IHDR', 13), chunk('ZZZZ'), chunk('IEND', 0))),
    ).toThrow(/unknown critical chunk ZZZZ/);
  });

  it('refuses a truncated or unfinished file', () => {
    const whole = pngOf(chunk('IHDR', 13), chunk('IDAT', 20), chunk('IEND', 0));

    expect(() => findProvenance(whole.subarray(0, whole.length - 5))).toThrow(/cut short/);
    expect(() => findProvenance(whole.subarray(0, whole.length - 20))).toThrow(/runs past the end/);
    expect(() => findProvenance(pngOf(chunk('IHDR', 13), chunk('IDAT', 20)))).toThrow(
      /before IEND/,
    );
  });
});

describe('JPEG provenance', () => {
  const app0 = app(0, 'JFIF');
  const app14 = app(14, 'Adobe');
  const icc = app(2, 'ICC_PROFILE');
  const dqt = segment(0xdb);

  it('drops APP1 Exif and XMP, APP11 JUMBF and COM, and keeps the rest', () => {
    const dirty = jpegOf(
      app0,
      app(1, 'Exif'),
      icc,
      app(1, 'http://ns.adobe.com/xap/1.0/'),
      segment(0xfe),
      app(11, 'JP'),
      app14,
      dqt,
    );

    expect(findProvenance(dirty)).toEqual(['APP1 Exif', 'APP1 XMP', 'COM', 'APP11 JUMBF']);
    expect(stripProvenance(dirty)).toEqual(jpegOf(app0, icc, app14, dqt));
  });

  it('drops an APP2 that is not an ICC profile', () => {
    expect(findProvenance(jpegOf(app(2, 'MPF')))).toEqual(['APP2']);
  });

  it('leaves the bytes from the first scan on identical', () => {
    const later = Buffer.concat([app(11, 'JP'), Buffer.from([0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9])]);
    const dirty = Buffer.concat([jpegOf(app(11, 'JP'), dqt), later]);

    expect(scanData(stripProvenance(dirty))).toEqual(scanData(dirty));
    expect(scanData(dirty)).toEqual(Buffer.concat([SOS, later]));
    // Only the header is walked: an APP11 after the first scan is image data to it.
    expect(findProvenance(dirty)).toEqual(['APP11 JUMBF']);
  });

  it('drops bytes after the final EOI, and keeps the EOI', () => {
    const clean = jpegOf(app0, dqt);
    const dirty = Buffer.concat([clean, Buffer.from('trailing')]);

    expect(findProvenance(dirty)).toEqual(['trailing data']);
    expect(stripProvenance(dirty)).toEqual(clean);
    expect(scanData(dirty)).toEqual(SOS);
  });

  it('keeps an RSTn marker in the header', () => {
    const rst = Buffer.from([0xff, 0xd3]);

    expect(findProvenance(jpegOf(app0, rst, dqt))).toEqual([]);
    expect(stripProvenance(jpegOf(app0, rst, app(1, 'Exif'), dqt))).toEqual(jpegOf(app0, rst, dqt));
  });

  it('skips fill bytes and standalone markers', () => {
    const filled = Buffer.concat([Buffer.from([0xff, 0xff, 0xff]), app(1, 'Exif').subarray(1)]);
    const dirty = jpegOf(app0, Buffer.from([0xff, 0x01]), filled, dqt);

    expect(findProvenance(dirty)).toEqual(['APP1 Exif']);
    expect(stripProvenance(dirty)).toEqual(jpegOf(app0, Buffer.from([0xff, 0x01]), dqt));
  });

  it('hands back the same object when the file is clean', () => {
    const clean = jpegOf(app0, icc, app14, dqt);

    expect(findProvenance(clean)).toEqual([]);
    expect(stripProvenance(clean)).toBe(clean);
  });

  it('refuses garbage, a truncated header or a file with no scan', () => {
    const noScan = Buffer.concat([Buffer.from([0xff, 0xd8]), app0]);
    const badLength = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 1, 0xff, 0xda]);
    const pastEnd = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 40, 1, 2, 3]);
    const notMarker = Buffer.from([0xff, 0xd8, 0x12, 0x34, 0x56]);

    expect(() => findProvenance(noScan)).toThrow(/before a scan/);
    expect(() => findProvenance(badLength)).toThrow(/length 1/);
    expect(() => findProvenance(pastEnd)).toThrow(/runs past the end/);
    expect(() => findProvenance(notMarker)).toThrow(/expected a marker/);
    expect(() => findProvenance(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0]))).toThrow(/cut short/);
  });
});

describe('any image', () => {
  it('refuses empty and unrecognised input', () => {
    expect(() => findProvenance(Buffer.alloc(0))).toThrow(/not a PNG or a JPEG/);
    expect(() => stripProvenance(Buffer.from('GIF89a'))).toThrow(/not a PNG or a JPEG/);
  });
});

describe('the committed art', () => {
  const imagesUnder = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return imagesUnder(path);
      return ['.png', '.jpg', '.jpeg'].includes(extname(entry.name).toLowerCase()) ? [path] : [];
    });

  it('carries no generator provenance; run npm run art:strip if this lists files', () => {
    const dirty = ['docs', 'public']
      .flatMap((dir) => imagesUnder(join(ROOT, dir)))
      .map((path) => ({ file: relative(ROOT, path), found: findProvenance(readFileSync(path)) }))
      .filter(({ found }) => found.length > 0)
      .map(({ file, found }) => `${file}: ${found.join(', ')}`);

    expect(dirty).toEqual([]);
  });
});
