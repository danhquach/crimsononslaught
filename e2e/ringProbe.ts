import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';
import type { FocusRingReport } from '../src/scenes/focusRing';
import { focusRing } from './game';

const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read(bytes: Buffer): { width: number; data: Buffer } } };
};

/** The focus ring's white core: how bright it reads, and how far it stands out from what is just outside it (CO-196). */
const MIN_RING_LUMINANCE = 0.8;
const MIN_RING_CONTRAST = 3;

function luminance(png: { width: number; data: Buffer }, x: number, y: number): number {
  const i = (y * png.width + x) * 4;
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(png.data[i] ?? 0) +
    0.7152 * channel(png.data[i + 1] ?? 0) +
    0.0722 * channel(png.data[i + 2] ?? 0)
  );
}

/**
 * The scene's focus ring, judged on the screenshot the player would see: the
 * middle of its 3 px white core along the top edge (clear of the corners) must be
 * bright, and stand out from the pixel row 8 px above the box (the halo ends 6 px
 * above it, so that row is 1 px clear of the ring). The ring is read before and
 * after the shot and must not have moved between them; the halo's pulse is never
 * looked at here (`focusStyle.spec` checks it moves). Returns the ring report.
 */
export async function expectRingReadable(
  page: Page,
  sceneKey: string,
  what: string,
): Promise<FocusRingReport> {
  const ring = await focusRing(page, sceneKey);
  const png = PNG.sync.read(await page.screenshot());
  const after = await focusRing(page, sceneKey);
  expect(ring.visible, `${what}: the ring shows`).toBe(true);
  expect(after.box, `${what}: the ring held still for the shot`).toEqual(ring.box);
  const box = ring.box!;
  const row = (y: number): number => {
    const from = Math.ceil(box.x) + 8;
    const to = Math.floor(box.x + box.width) - 8;
    let sum = 0;
    for (let x = from; x < to; x++) sum += luminance(png, x, y);
    return sum / (to - from);
  };
  // The core spans 1-4 px above the box: its middle pixel row is 3 up; the halo ends 6 up.
  const core = row(Math.ceil(box.y) - 3);
  const beyond = row(Math.ceil(box.y) - 8);
  expect(core, `${what}: the ring core is bright`).toBeGreaterThanOrEqual(MIN_RING_LUMINANCE);
  expect(
    (core + 0.05) / (beyond + 0.05),
    `${what}: the ring against what is beyond it`,
  ).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
  return ring;
}
