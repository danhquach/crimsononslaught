import { createRequire } from 'node:module';
import type { Frame, Page } from '@playwright/test';

const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read(png: Buffer): { width: number; height: number; data: Uint8Array } } };
};

/**
 * Helpers shared by the CSP suite's specs: the screen positions they click, the
 * listeners that count violations and errors, and the screenshot-pixel checks
 * (a production bundle exports nothing, so the game can only be read by eye).
 */

/** Positions in the 960x540 game: `e2e/help.spec.ts` and the menu rows, see `prod.spec.ts`. */
export const HELP_ENTRY = { x: 480, y: 262 + 3 * 54 };
/** The fifth of five tabs (Pickups | Spells | Passives | Controls | About, CO-238): 352 px right of centre. */
export const ABOUT_TAB = { x: 832, y: 92 };
export const SEND_FEEDBACK = { x: 480, y: 410 };
export const SEND = { x: 370, y: 446 };
export const CANCEL = { x: 590, y: 446 };
export const HELP_BACK = { x: 480, y: 478 };
/** Inside the Play again bar's left end, clear of its label. */
export const PLAY_AGAIN_BAR = { x: 258, y: 468 };

/**
 * Whether the row-label face is in use, not just fetched (the title is a
 * painted image now; the plates' labels are set in this face): the face is loaded,
 * and a canvas measures text in it differently from the same text in its
 * fallback (a missing face would draw both in the fallback, width for width).
 */
export async function labelFontRenders(
  page: Page | Frame,
): Promise<{ loaded: boolean; differs: boolean }> {
  return page.evaluate(() => {
    const loaded = [...document.fonts].some(
      (face) => face.family.replaceAll('"', '') === 'GrenzeGotisch' && face.status === 'loaded',
    );
    const context = document.createElement('canvas').getContext('2d');
    if (!context) throw new Error('no 2d context');
    const width = (family: string): number => {
      context.font = `26px ${family}`;
      return context.measureText('Start Game').width;
    };
    return { loaded, differs: width('GrenzeGotisch, Georgia, serif') !== width('Georgia, serif') };
  });
}

/** What a page reported against its policy, and everything that went wrong on it. */
export interface Watch {
  violations: string[];
  problems: string[];
  logs: string[];
}

/**
 * Listen from before the page's own scripts run, so nothing is missed: the
 * `securitypolicyviolation` event through a function exposed to the page (it
 * survives navigations), and the console and page errors from this side.
 */
export async function watch(page: Page): Promise<Watch> {
  const seen: Watch = { violations: [], problems: [], logs: [] };
  await page.exposeFunction('reportViolation', (line: string) => seen.violations.push(line));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { reportViolation(line: string): void }).reportViolation;
      report(
        `${event.violatedDirective} blocked ${event.blockedURI} at ${event.sourceFile}: ${event.sample}`,
      );
    });
  });
  page.on('console', (message) => {
    seen.logs.push(message.text());
    if (message.type() === 'error' || /Content.Security.Policy|Refused/i.test(message.text())) {
      seen.problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => seen.problems.push(`pageerror: ${error.message}`));
  return seen;
}

/**
 * Wait for Boot to finish (it logs the seed last but for the hand-off to Intro)
 * and Intro to draw. `load` is a URL to open, or what to run to (re)load the page.
 */
export async function boot(page: Page, load: string | (() => Promise<unknown>)): Promise<void> {
  const booted = page.waitForEvent('console', (m) => m.text().startsWith('[rng] seed='));
  await (typeof load === 'string' ? page.goto(load) : load());
  await booted;
  await page.waitForTimeout(1500);
}

/** A page screenshot decoded to RGBA, in Node: a scratch browser page would take the game page's focus (Firefox). */
async function screenshotPixels(
  page: Page,
): Promise<{ width: number; height: number; data: Uint8Array }> {
  return PNG.sync.read(await page.screenshot());
}

/** A pixel's colour from a page screenshot. */
export async function pixelAt(
  page: Page,
  at: { x: number; y: number },
): Promise<{ r: number; g: number; b: number }> {
  const { width, data } = await screenshotPixels(page);
  const i = (at.y * width + at.x) * 4;
  return { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 };
}

/** How many of the 960x540 screenshot's sampled pixels are not black: a blank canvas has none. */
export async function litPixels(page: Page): Promise<number> {
  const { data } = await screenshotPixels(page);
  let lit = 0;
  for (let i = 0; i < data.length; i += 4 * 16) {
    if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 60) lit += 1;
  }
  return lit;
}
