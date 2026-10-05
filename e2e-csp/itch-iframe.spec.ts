import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { E2E_FEEDBACK_KEY } from '../playwright.config';
import { PORT } from '../playwright.csp.config';
import { FEEDBACK_URL } from '../src/core/feedback';
import { PAUSE_ACTIONS } from '../src/core/pauseModel';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import { cardCenter } from '../e2e/game';
import {
  ABOUT_TAB,
  boot,
  CANCEL,
  HELP_BACK,
  HELP_ENTRY,
  litPixels,
  pixelAt,
  PLAY_AGAIN_BAR,
  SEND,
  SEND_FEEDBACK,
  watch,
} from './helpers';

/**
 * #422: the build as itch.io serves it, in a cross-origin iframe. The host page
 * is `127.0.0.1`, the game `localhost`, so the game's `localStorage` is a
 * third-party frame's, as on `html-classic.itch.zone`. A walk of the game from
 * Intro to Result must log no CSP violation and no error, the run must be saved,
 * and the save must survive a reload of the host page.
 *
 * The iframe sits at the host page's top-left corner and is 960x540, so a page
 * coordinate is still a game coordinate and `helpers.ts`'s positions apply.
 * Run in all three engines by `npm run test:itch`.
 *
 * The feedback POST is fulfilled by a route with `Access-Control-Allow-Origin: *`, so
 * this proves it leaves the third-party frame with the right payload, not that the
 * real endpoint accepts itch.io's origin: that is the manual smoke check in
 * `docs/publishing-itch.md`.
 *
 * The host is a real local server, not a `page.route`: a response Playwright
 * fulfils has no address, which Chromium treats as a public site, and it then
 * blocks the frame from loading `localhost` (local network access checks).
 */

const HOST_PAGE = `<!doctype html><title>host</title><body style="margin:0"><iframe src="http://localhost:${PORT}/?seed=7" width="960" height="540" style="border:0;display:block" allow="autoplay; fullscreen"></iframe></body>`;

let host: Server;
let hostUrl = '';

test.beforeAll(async () => {
  host = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(HOST_PAGE);
  });
  await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve));
  const address = host.address();
  if (address === null || typeof address === 'string') throw new Error('no host port');
  hostUrl = `http://127.0.0.1:${address.port}/`;
});

test.afterAll(async () => {
  await new Promise((resolve) => host.close(resolve));
});

test('a run plays inside a cross-origin iframe, and its save persists across a reload', async ({
  page,
}) => {
  const seen = await watch(page);
  const feedback: unknown[] = [];
  await page.route(FEEDBACK_URL, async (route) => {
    feedback.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });

  const gameFrame = () => {
    const frame = page.frame({ url: new RegExp(`localhost:${PORT}`) });
    if (!frame) throw new Error('the game iframe is not attached');
    return frame;
  };
  const readSave = async () =>
    JSON.parse(
      (await gameFrame().evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY)) ?? 'null',
    ) as { profile: { name: string; runs: number } } | null;

  await boot(page, hostUrl);
  // Keys go to the focused frame: click empty ground (clear of every Intro plate) first.
  await page.mouse.click(30, 30);
  expect(await litPixels(page), 'Intro is drawn in the iframe').toBeGreaterThan(50);

  // Help -> About -> the feedback form, filled and sent.
  await page.mouse.click(HELP_ENTRY.x, HELP_ENTRY.y);
  await page.waitForTimeout(800);
  await page.mouse.click(ABOUT_TAB.x, ABOUT_TAB.y);
  await page.waitForTimeout(800);
  await page.mouse.click(SEND_FEEDBACK.x, SEND_FEEDBACK.y);
  const subject = gameFrame().locator('input[name="subject"]');
  await expect(subject).toBeFocused();
  await subject.fill('itch iframe');
  await gameFrame().locator('textarea[name="message"]').fill('sent from an iframe');
  await page.mouse.click(SEND.x, SEND.y);
  await expect.poll(() => feedback.length, { message: 'the feedback POST went out' }).toBe(1);
  expect(feedback[0]).toMatchObject({
    access_key: E2E_FEEDBACK_KEY,
    subject: '[CrimsonOnslaught] Feedback: itch iframe',
  });
  await page.mouse.click(CANCEL.x, CANCEL.y);
  await expect(subject).toHaveCount(0);
  await page.mouse.click(HELP_BACK.x, HELP_BACK.y);
  await page.waitForTimeout(800);

  // Start Game -> a card -> a run, the hero walking.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const card = cardCenter(0);
  await page.mouse.click(card.x, card.y);
  await page.waitForTimeout(1500);
  for (const key of ['d', 's']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(2000);
    await page.keyboard.up(key);
  }
  await page.waitForTimeout(2000);
  expect(await litPixels(page), 'the arena is drawn').toBeGreaterThan(200);
  expect((await readSave())?.profile.runs, 'a run in progress is not counted yet').toBe(0);

  // Esc -> End run -> Yes -> Result.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const endRunPresses = PAUSE_ACTIONS.indexOf('end') + 1;
  for (let i = 0; i < endRunPresses; i += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowLeft'); // wakes the highlight on Yes
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath('itch-result.png') });
  const bar = await pixelAt(page, PLAY_AGAIN_BAR);
  expect(bar.r, 'the Result screen shows its Play again bar').toBeGreaterThan(40);
  expect(bar.r).toBeLessThan(110);
  expect(bar.g).toBeLessThan(40);

  // The run was counted and stored under the iframe's origin.
  const saved = await readSave();
  expect(saved?.profile.runs, 'the run is saved').toBe(1);
  const name = saved?.profile.name;
  expect(name).toBeTruthy();

  // Reload the host page: the game is a fresh frame and must read the same save back.
  await boot(page, () => page.reload());
  expect(await litPixels(page), 'Intro is drawn again').toBeGreaterThan(50);
  const reloaded = await readSave();
  expect(reloaded?.profile.runs, 'the save survived the reload').toBe(1);
  expect(reloaded?.profile.name).toBe(name);

  // WebKit reports Playwright's own screenshot `<style>` as a style-src-elem
  // violation with no source, and the matching console error (it appears after
  // each screenshot and at no other time, and never in Chromium or Firefox);
  // nothing the game does. Only those two exact lines are dropped.
  const screenshotStyle = new Set([
    'style-src-elem blocked inline at : ',
    "error: Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.",
  ]);
  const webkit = test.info().project.name === 'webkit';
  const kept = (lines: string[]) => (webkit ? lines.filter((l) => !screenshotStyle.has(l)) : lines);
  expect(kept(seen.violations)).toEqual([]);
  expect(kept(seen.problems)).toEqual([]);

  // Positive control: the listener does fire inside the frame. A fetch to a host the
  // policy does not list is blocked before any request goes out, so no network is needed.
  await gameFrame().evaluate(() => fetch('https://example.invalid/').catch(() => undefined));
  await expect.poll(() => kept(seen.violations)).toHaveLength(1);
  expect(kept(seen.violations)[0]).toContain('connect-src');
});
