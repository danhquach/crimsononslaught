import { expect, test } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import { cardCenter, collectErrors, waitForScene } from './game';

/**
 * Spec §5 "Lightning — Chain Lightning" (CO-046, #99): the bolt a cast draws is
 * on the canvas where a player can see it.
 *
 * The CO-063 walkthrough sampled frames every 220 ms and never caught the line,
 * which says nothing either way — the flash is shorter than that. So this check
 * does not sample: it reads the frame buffer in `postrender`, every frame the
 * renderer draws, and counts pixels of the bolt art's yellow. The run is at
 * real speed, so what it counts is what a player watching the arena would see.
 *
 * Since CO-082 the bolt is the atlas art — `lightning.strike`, `.impact` and
 * the tiled `.chain` strips — whose one colour nothing else in a lightning run
 * shares is `BOLT_YELLOW`. The hero, enemy, boss and gem sheets were checked
 * against it when this was written; a new yellow on any of them would have to
 * come with a narrower match here, or this check would start counting it.
 *
 * The chain's target selection and damage are unit-tested in
 * `src/core/chainLightning.test.ts`; this is only about what reaches the eye.
 */

/** Real seconds of a lightning run to watch. At a 1 s cooldown that is several casts. */
const WATCH_MS = 8_000;

/**
 * The bolt art's own yellow, 0xffee00, matched to the high nibble of each
 * channel so the renderer's rounding cannot miss it. Pixel art drawn nearest-
 * neighbour on whole pixels lands the exact colour, so no tolerance is needed.
 */
const BOLT_YELLOW = { r: 0xf, g: 0xe, b: 0x0 };

/**
 * Frames that must carry the bolt. Each cast shows for one pass of the chain
 * clip plus the strike, so a run this long owes far more than this; the floor
 * is low enough that a slow runner drawing few frames still passes while an
 * invisible bolt cannot.
 */
const MIN_BOLT_FRAMES = 3;

/**
 * Pixels of bolt yellow in the best frame. One strike frame alone carries about
 * 70 of them and each 47 px chain tile about 90, so a cast with its two base
 * chains draws several hundred; this is the shortest bolt that could be called
 * visible, and a stray speck cannot reach it.
 */
const MIN_PEAK_PIXELS = 100;

/** What the frame buffer scan found. */
interface ArcTally {
  /** Frames rendered while watching. */
  frames: number;
  /** Of those, how many carried any bolt pixel. */
  boltFrames: number;
  /** The most bolt pixels any one frame carried. */
  peakPixels: number;
  /** That frame, as a PNG data URL, attached to the report as the evidence. */
  peakPng: string | null;
}

test('a lightning cast draws its bolt where a player can see it', async ({ page }, testInfo) => {
  const errors = collectErrors(page);

  await page.goto('/?seed=1&timeScale=1');
  await waitForScene(page, SCENE.spellSelect);

  const { x, y } = cardCenter(SPELL_IDS.indexOf('lightning'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const tally: ArcTally = await page.evaluate(
    async ({ yellow, watchMs }) => {
      const { game } = await import('/src/main.ts');
      const gl = (game.renderer as { gl?: WebGLRenderingContext | null }).gl;
      if (!gl)
        throw new Error('the game is not on the WebGL renderer; nothing to read pixels from');

      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);

      let frames = 0;
      let boltFrames = 0;
      let peakPixels = 0;
      let peak: Uint8Array | null = null;

      const scan = (): void => {
        frames += 1;
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let found = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if ((pixels[i] ?? 0) >> 4 !== yellow.r) continue;
          if ((pixels[i + 1] ?? 0) >> 4 !== yellow.g) continue;
          if ((pixels[i + 2] ?? 0) >> 4 !== yellow.b) continue;
          found += 1;
        }
        if (found === 0) return;
        boltFrames += 1;
        if (found > peakPixels) {
          peakPixels = found;
          peak = pixels.slice();
        }
      };

      game.events.on('postrender', scan);
      await new Promise((resolve) => setTimeout(resolve, watchMs));
      game.events.off('postrender', scan);

      let peakPng: string | null = null;
      // Read through a fresh binding: the assignment above is inside the
      // `postrender` callback, which the compiler does not follow.
      const peakFrame = peak as Uint8Array | null;
      if (peakFrame) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // `readPixels` hands back the buffer bottom row first; flip it so the
          // attachment is the frame the right way up.
          const image = ctx.createImageData(width, height);
          for (let row = 0; row < height; row += 1) {
            const from = (height - 1 - row) * width * 4;
            image.data.set(peakFrame.subarray(from, from + width * 4), row * width * 4);
          }
          ctx.putImageData(image, 0, 0);
          peakPng = canvas.toDataURL('image/png');
        }
      }
      return { frames, boltFrames, peakPixels, peakPng };
    },
    { yellow: BOLT_YELLOW, watchMs: WATCH_MS },
  );

  if (tally.peakPng) {
    await testInfo.attach('bolt-frame.png', {
      body: Buffer.from(tally.peakPng.split(',')[1] ?? '', 'base64'),
      contentType: 'image/png',
    });
  }

  // The counts go in the messages: a red run should say how much bolt it saw,
  // not just that it saw too little.
  const seen = `${tally.boltFrames} of ${tally.frames} frames, ${tally.peakPixels} px at the peak`;
  expect(tally.frames, 'the renderer drew frames while watching').toBeGreaterThan(0);
  expect(tally.boltFrames, `frames carrying the bolt (${seen})`).toBeGreaterThanOrEqual(
    MIN_BOLT_FRAMES,
  );
  expect(tally.peakPixels, `bolt pixels in the best frame (${seen})`).toBeGreaterThanOrEqual(
    MIN_PEAK_PIXELS,
  );
  expect(errors).toEqual([]);
});
