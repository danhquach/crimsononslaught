import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { MENU_ART } from '../../src/config/menuArt';
import {
  alphaBounds,
  areaAverage,
  crushDark,
  glowTitle,
  keyGreen,
  keyMagenta,
  openAlpha,
  pngChunks,
  scanData,
  stripMetadata,
} from './menuArt.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MENU_DIR = join(ROOT, 'public/assets/menu');
const SHEET_DIR = join(ROOT, 'docs/art/sheets/CO-191');

const image = (width, height, pixels) => ({
  width,
  height,
  data: Uint8ClampedArray.from(pixels.flat()),
});

describe('areaAverage', () => {
  it('averages the pixels under each output pixel', () => {
    const out = areaAverage(
      image(2, 1, [
        [200, 0, 0, 255],
        [0, 100, 0, 255],
      ]),
      1,
      1,
    );
    expect([...out.data]).toEqual([100, 50, 0, 255]);
  });

  it('weights a fractional edge by how much of the pixel it covers', () => {
    // Three source pixels into two: the middle one is shared half and half.
    const out = areaAverage(
      image(3, 1, [
        [0, 0, 0, 255],
        [90, 90, 90, 255],
        [180, 180, 180, 255],
      ]),
      2,
      1,
    );
    expect(out.data[0]).toBeCloseTo(30, 0);
    expect(out.data[4]).toBeCloseTo(150, 0);
  });

  it('keeps the keyed-out background out of the colour and reports the coverage as alpha', () => {
    const out = areaAverage(
      image(2, 1, [
        [255, 0, 255, 0],
        [40, 20, 10, 255],
      ]),
      1,
      1,
    );
    expect([...out.data]).toEqual([40, 20, 10, 128]);
  });
});

describe('keyMagenta', () => {
  const keyed = (pixels) =>
    [...keyMagenta(image(pixels.length, 1, pixels)).data].filter((_, i) => i % 4 === 3);

  it('keys the magenta and the hot-pink fringe beside it', () => {
    expect(
      keyed([
        [255, 0, 255, 255],
        [220, 60, 200, 255],
        [30, 30, 30, 255],
      ]),
    ).toEqual([0, 0, 255]);
  });

  it('keeps a crimson trim line even though it passes the fringe test', () => {
    expect(
      keyed([
        [30, 30, 30, 255],
        [200, 36, 71, 255],
        [30, 30, 30, 255],
      ]),
    ).toEqual([255, 255, 255]);
  });

  it('follows the fringe only a few pixels into the art', () => {
    const fringe = [200, 36, 71, 255];
    expect(keyed([[255, 0, 255, 255], ...Array(8).fill(fringe)])).toEqual([
      0, 0, 0, 0, 255, 255, 255, 255, 255,
    ]);
  });
});

describe('keyGreen', () => {
  const keyed = (pixels) => keyGreen(image(pixels.length, 1, pixels));

  it('clears pure green, keeps red, and eases the lead in between', () => {
    const out = keyed([
      [0, 255, 0, 255],
      [200, 20, 30, 255],
      [60, 130, 60, 255],
    ]);
    expect(out.data[3]).toBe(0);
    expect(out.data[7]).toBe(255);
    // A lead of 70 is a third of the way through the 40 to 120 ramp.
    expect(out.data[11]).toBe(Math.round((1 - (70 - 40) / 80) * 255));
  });

  it('never leaves green above the other two', () => {
    const out = keyed([[100, 190, 20, 255]]);
    expect(out.data[1]).toBe(100);
  });
});

describe('openAlpha', () => {
  const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];
  const plane = (size, on) => {
    const img = { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
    for (const [x, y] of on) img.data[(y * size + x) * 4 + 3] = 255;
    return img;
  };

  it('removes a speck and keeps a solid block whole', () => {
    const block = [];
    for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) block.push([x, y]);
    const out = openAlpha(plane(24, [[2, 2], ...block]), 5);
    expect(alphaAt(out, 2, 2)).toBe(0);
    expect(alphaBounds(out, 0)).toEqual({ x: 8, y: 8, w: 8, h: 8 });
    expect(alphaAt(out, 11, 11)).toBe(255);
  });
});

describe('alphaBounds', () => {
  it('boxes the pixels above the threshold, and is null with none', () => {
    const img = image(3, 2, [
      [0, 0, 0, 10],
      [0, 0, 0, 200],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 90],
      [0, 0, 0, 0],
    ]);
    expect(alphaBounds(img, 40)).toEqual({ x: 1, y: 0, w: 1, h: 2 });
    expect(alphaBounds(img, 255)).toBeNull();
  });
});

describe('glowTitle', () => {
  const dot = { width: 3, height: 3, data: new Uint8ClampedArray(3 * 3 * 4) };
  dot.data.set([250, 40, 40, 255], (1 * 3 + 1) * 4);
  const options = {
    pad: 12,
    shadow: { dx: 2, dy: 4, blur: 1, opacity: 0.9 },
    glow: { blur: 4, color: [190, 15, 30], opacity: 0.55 },
  };
  const out = glowTitle(dot, options);
  const at = (x, y) => [...out.data.slice((y * out.width + x) * 4, (y * out.width + x) * 4 + 4)];

  it('grows the canvas by the pad on every side', () => {
    expect([out.width, out.height]).toEqual([27, 27]);
  });

  it('keeps the letters as they were on top', () => {
    expect(at(13, 13)).toEqual([250, 40, 40, 255]);
  });

  it('puts the shadow below and right of the letters, black, and the glow round them in red', () => {
    const [sr, , , sa] = at(13 + 2, 13 + 4);
    expect(sr).toBeLessThan(20);
    expect(sa).toBeGreaterThan(0);
    expect(at(13 - 2, 13 - 4)[3]).toBeLessThan(sa);
    const glow = at(13 - 3, 13);
    expect(glow[3]).toBeGreaterThan(0);
    expect(glow[0]).toBeGreaterThan(glow[1]);
  });

  it('leaves the far corners clear', () => {
    expect(at(0, 0)[3]).toBe(0);
  });
});

describe('crushDark', () => {
  it('sets near-black to pure black and leaves brighter colour alone', () => {
    const out = crushDark(
      image(2, 1, [
        [20, 10, 18, 255],
        [255, 120, 20, 255],
      ]),
      24,
    );
    expect([...out.data]).toEqual([0, 0, 0, 255, 255, 120, 20, 255]);
  });
});

describe('stripMetadata', () => {
  const segment = (marker, length) =>
    Buffer.concat([Buffer.from([0xff, marker, 0, length + 2]), Buffer.alloc(length, 7)]);
  const jpegOf = (...segments) =>
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      ...segments,
      Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3]),
    ]);

  it('drops the APP1 and APP11 segments and nothing else', () => {
    const app0 = segment(0xe0, 14);
    const app1 = segment(0xe1, 10);
    const app11 = segment(0xeb, 30);
    const dqt = segment(0xdb, 5);
    const stripped = stripMetadata(jpegOf(app0, app1, app11, dqt));
    expect(stripped).toEqual(jpegOf(app0, dqt));
    expect(scanData(stripped)).toEqual(scanData(jpegOf(app1)));
  });

  it('hands back the same bytes when there is no metadata', () => {
    const bytes = jpegOf(segment(0xe0, 14), segment(0xdb, 5));
    expect(stripMetadata(bytes)).toBe(bytes);
  });
});

describe('the menu art as shipped', () => {
  it('has sources with no metadata left, and the image data as it was delivered', () => {
    // SHA-256 of each file's scan data (SOS to the end) taken before the metadata was stripped.
    const delivered = {
      concept_A: 'f0c462a03a79033a14501e8dadfdf600880b395baee9897509d0bd6b86e1c064',
      menu_bg_source: '3e14cf1782bcfd298516646f8f335a80fc4a35dde6e23509adc8ce5dd74bc6e0',
      menu_plates_source: 'c3b5625948e27d8514c65dcec2d8f3c5b67fd76aed7746abd42b684034a710d7',
      menu_embers_source: '5c0207e96284f3ee7396cce3b98ff5ae9a265c3b0acb2dfe6d3737ae907e9ec3',
      menu_title_source: 'ae3984627d5da9932e1027fd57cc8a45c6b87486445fcea867dbecff31489f12',
    };
    for (const [name, hash] of Object.entries(delivered)) {
      const bytes = readFileSync(join(SHEET_DIR, `${name}.jpg`));
      expect(stripMetadata(bytes), name).toBe(bytes);
      expect(createHash('sha256').update(scanData(bytes)).digest('hex'), name).toBe(hash);
      expect(jpeg.decode(bytes).width, name).toBeGreaterThan(0);
    }
  });

  it('has a background the size of the canvas, under its budget', () => {
    const bytes = readFileSync(join(MENU_DIR, 'menu_bg.jpg'));
    const { width, height } = jpeg.decode(bytes);
    expect({ width, height }).toEqual({ width: 960, height: 540 });
    expect(bytes.length).toBeLessThanOrEqual(200 * 1024);
  });

  it('has PNGs with only the image chunks', () => {
    for (const name of ['menu_plate.png', 'menu_ember.png', 'menu_title.png']) {
      expect(pngChunks(readFileSync(join(MENU_DIR, name))), name).toEqual(['IHDR', 'IDAT', 'IEND']);
    }
  });

  describe('plate', () => {
    const { width, height, capLeft, capRight } = MENU_ART.plate;
    const png = PNG.sync.read(readFileSync(join(MENU_DIR, 'menu_plate.png')));
    const at = (x, y, k) => png.data[(y * png.width + x) * 4 + k];

    it('holds the rest frame over the lit one, at the configured size', () => {
      expect({ w: png.width, h: png.height }).toEqual({ w: width, h: height * 2 });
    });

    it('is see-through outside the plate and solid across the middle', () => {
      for (const top of [0, height]) {
        // The pointed tips leave the corners clear; the plain middle has no hole.
        expect(at(0, top, 3)).toBe(0);
        for (let x = capLeft; x < width - capRight; x++) {
          for (let y = top + 2; y < top + height - 2; y++)
            expect(at(x, y, 3), `${x},${y}`).toBe(255);
        }
      }
    });

    it('has the same iron in every column between the caps, so stretching it leaves no step', () => {
      for (const top of [0, height]) {
        for (let x = capLeft; x < width - capRight - 1; x++) {
          let change = 0;
          for (let y = 0; y < height; y++) {
            for (let k = 0; k < 3; k++)
              change += Math.abs(at(x, top + y, k) - at(x + 1, top + y, k));
          }
          expect(change / height / 3, `column ${x}`).toBeLessThan(9);
        }
      }
    });

    it('carries no magenta tint on the art', () => {
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] === 0) continue;
        const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
        expect(Math.min(r, b) - g, `pixel ${i / 4}`).toBeLessThanOrEqual(6);
      }
    });
  });

  describe('title', () => {
    const png = PNG.sync.read(readFileSync(join(MENU_DIR, 'menu_title.png')));
    const at = (x, y, k) => png.data[(y * png.width + x) * 4 + k];

    it('is 434 x 259: letters 205 px tall in a 27 px margin for the shadow and glow', () => {
      expect({ w: png.width, h: png.height }).toEqual({ w: 434, h: 259 });
    });

    it('has solid letters, a see-through corner, and no green left on any visible pixel', () => {
      expect(at(0, 0, 3)).toBe(0);
      let solid = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] === 255) solid++;
        if (png.data[i + 3] > 20) {
          const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
          expect(g - Math.max(r, b), `pixel ${i / 4}`).toBeLessThanOrEqual(8);
        }
      }
      expect(solid).toBeGreaterThan(10000);
    });

    it('keeps its letters clear of the margin, so nothing of them is cut', () => {
      const letters = alphaBounds(
        {
          width: png.width,
          height: png.height,
          data: png.data.map((v, i) => (i % 4 === 3 && v < 255 ? 0 : v)),
        },
        0,
      );
      expect(letters.y).toBeGreaterThanOrEqual(27 - 1);
      expect(letters.y + letters.h).toBeLessThanOrEqual(259 - 27 + 1);
    });
  });

  describe('ember', () => {
    const { size, frames } = MENU_ART.ember;
    const png = PNG.sync.read(readFileSync(join(MENU_DIR, 'menu_ember.png')));

    it('is a strip of square frames', () => {
      expect({ w: png.width, h: png.height }).toEqual({ w: size * frames, h: size });
    });

    it('is pure black round every frame, so an additive blend leaves the backdrop alone', () => {
      for (let f = 0; f < frames; f++) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (x > 0 && x < size - 1 && y > 0 && y < size - 1) continue;
            const i = (y * png.width + f * size + x) * 4;
            expect([png.data[i], png.data[i + 1], png.data[i + 2]], `frame ${f} ${x},${y}`).toEqual(
              [0, 0, 0],
            );
          }
        }
      }
    });
  });
});
