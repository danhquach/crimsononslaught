/**
 * Minimal 8-bit indexed PNG encoder (CO-080).
 *
 * pngjs only writes truecolour, which costs 4 bytes a pixel; the atlas is
 * palette art, so writing it as an indexed PNG is what brings it inside the
 * 400 KB budget. The format needed here is small enough to write directly:
 * IHDR, PLTE, tRNS, one zlib stream of unfiltered scanlines, IEND.
 *
 * Output is a pure function of its input — no timestamps, no text chunks — so
 * `npm run art:cut` regenerates the atlas byte-identically.
 */

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  const forCrc = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  out.writeUInt32BE(crc32(forCrc), body.length + 8);
  return out;
}

/**
 * @param palette up to 256 entries of [r, g, b, a]
 * @param indices width * height palette indices
 */
export function encodeIndexedPng(width, height, palette, indices) {
  if (palette.length > 256) throw new Error(`palette has ${palette.length} entries, max 256`);
  if (indices.length !== width * height) {
    throw new Error(`expected ${width * height} indices, got ${indices.length}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // colour type: indexed
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((c, i) => {
    plte[i * 3] = c[0];
    plte[i * 3 + 1] = c[1];
    plte[i * 3 + 2] = c[2];
  });

  // tRNS only has to cover the leading entries that are not fully opaque.
  const alphas = palette.map((c) => c[3]);
  let lastTransparent = -1;
  alphas.forEach((a, i) => {
    if (a < 255) lastTransparent = i;
  });
  const trns = Buffer.from(alphas.slice(0, lastTransparent + 1));

  // Filter type 0 on every scanline: the data is palette indices, where the
  // difference filters PNG offers predict nothing useful.
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    Buffer.from(indices.buffer, indices.byteOffset + y * width, width).copy(
      raw,
      y * (width + 1) + 1,
    );
  }

  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
  ];
  if (trns.length > 0) parts.push(chunk('tRNS', trns));
  parts.push(chunk('IDAT', deflateSync(raw, { level: 9 })));
  parts.push(chunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(parts);
}
