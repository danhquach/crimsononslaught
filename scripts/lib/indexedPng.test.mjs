import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { encodeIndexedPng } from './indexedPng.mjs';

// Decoded with pngjs rather than with this module's own logic: a hand-rolled
// encoder that is only ever checked against itself proves nothing about whether
// the file is a valid PNG.
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

/** Encode, then read back through pngjs as RGBA. */
function roundTrip(width, height, palette, indices) {
  const png = PNG.sync.read(encodeIndexedPng(width, height, palette, indices));
  const pixels = [];
  for (let i = 0; i < png.data.length; i += 4) {
    pixels.push([png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]]);
  }
  return { width: png.width, height: png.height, pixels };
}

describe('encodeIndexedPng', () => {
  it('writes a file an independent decoder reads back pixel for pixel', () => {
    const palette = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ];
    const indices = new Uint8Array([0, 1, 2, 1]);
    const out = roundTrip(2, 2, palette, indices);

    expect([out.width, out.height]).toEqual([2, 2]);
    expect(out.pixels).toEqual([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
    ]);
  });

  it('starts with the PNG signature and ends with IEND', () => {
    const buf = encodeIndexedPng(1, 1, [[1, 2, 3, 255]], new Uint8Array([0]));
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(buf.subarray(-8, -4).toString('ascii')).toBe('IEND');
  });

  it('declares an 8-bit indexed image in IHDR', () => {
    const buf = encodeIndexedPng(3, 2, [[0, 0, 0, 255]], new Uint8Array(6));
    const ihdr = buf.subarray(8 + 8, 8 + 8 + 13);
    expect(ihdr.readUInt32BE(0)).toBe(3);
    expect(ihdr.readUInt32BE(4)).toBe(2);
    expect([ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]]).toEqual([8, 3, 0, 0, 0]);
  });

  it('carries alpha through tRNS, so keyed-out pixels stay transparent', () => {
    const palette = [
      [0, 0, 0, 0],
      [200, 100, 50, 128],
      [10, 20, 30, 255],
    ];
    const out = roundTrip(3, 1, palette, new Uint8Array([0, 1, 2]));
    expect(out.pixels[0][3]).toBe(0);
    expect(out.pixels[1]).toEqual([200, 100, 50, 128]);
    expect(out.pixels[2][3]).toBe(255);
  });

  it('omits tRNS entirely when every colour is opaque', () => {
    const buf = encodeIndexedPng(1, 1, [[9, 9, 9, 255]], new Uint8Array([0]));
    expect(buf.includes(Buffer.from('tRNS', 'ascii'))).toBe(false);
  });

  it('writes tRNS only as far as the last see-through entry', () => {
    // Entry 1 is the last non-opaque one, so tRNS is 2 bytes and the opaque
    // tail is left implicit.
    const palette = [
      [0, 0, 0, 0],
      [5, 5, 5, 64],
      [7, 7, 7, 255],
      [8, 8, 8, 255],
    ];
    const buf = encodeIndexedPng(1, 1, palette, new Uint8Array([0]));
    const at = buf.indexOf(Buffer.from('tRNS', 'ascii'));
    expect(at).toBeGreaterThan(0);
    expect(buf.readUInt32BE(at - 4)).toBe(2);
  });

  it('handles a full 256-colour palette, the most quantize can produce', () => {
    const palette = Array.from({ length: 256 }, (_, i) => [i, 255 - i, (i * 7) % 256, 255]);
    const indices = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    const out = roundTrip(16, 16, palette, indices);
    expect(out.pixels).toHaveLength(256);
    expect(out.pixels[0]).toEqual([0, 255, 0, 255]);
    expect(out.pixels[255]).toEqual([255, 0, (255 * 7) % 256, 255]);
  });

  it('is a pure function of its input, so the atlas stays byte-identical', () => {
    const palette = [
      [1, 2, 3, 255],
      [4, 5, 6, 0],
    ];
    const indices = new Uint8Array([0, 1, 1, 0]);
    expect(encodeIndexedPng(2, 2, palette, indices)).toEqual(
      encodeIndexedPng(2, 2, palette, indices),
    );
  });

  it('refuses input it cannot encode', () => {
    const tooMany = Array.from({ length: 257 }, () => [0, 0, 0, 255]);
    expect(() => encodeIndexedPng(1, 1, tooMany, new Uint8Array([0]))).toThrow(/256/);
    expect(() => encodeIndexedPng(4, 4, [[0, 0, 0, 255]], new Uint8Array(3))).toThrow(/indices/);
  });

  it('survives a non-square image, where a wrong scanline stride would show', () => {
    const palette = [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ];
    // A diagonal: any off-by-one in the filter byte or row stride shears it.
    const w = 5;
    const h = 3;
    const indices = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) indices[y * w + y] = 1;

    const out = roundTrip(w, h, palette, indices);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        expect(out.pixels[y * w + x], `${x},${y}`).toEqual(
          x === y ? [0, 0, 0, 255] : [255, 255, 255, 255],
        );
      }
    }
  });
});
