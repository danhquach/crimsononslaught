import { expect, test, type Page } from '@playwright/test';
import { E2E_FEEDBACK_KEY } from '../playwright.config';
import { FEEDBACK_URL } from '../src/core/feedback';
import { cardCenter } from '../e2e/game';

/**
 * #316 on the built site, served by `vite preview` (`playwright.csp.config.ts`):
 * the page carries a Content-Security-Policy meta tag, a full walk of the game
 * under it logs no violation, and only `?seed=` still does anything.
 *
 * A production bundle exports nothing and Phaser keeps no game list, so unlike
 * `e2e/` these tests cannot reach into the running game. They drive it by mouse
 * and keys, prove each step through the DOM (the feedback form and the name
 * field are real elements) or through a screenshot's pixels, and count
 * violations, console errors and page errors, which is what they exist for.
 * The policy is never bypassed (`bypassCSP` stays off).
 *
 * Positions mirror `e2e/help.spec.ts` (Intro entries 58 px apart from y = 240;
 * Help's tabs at y = 96; Send feedback at y = 406; Send and Cancel at y = 446;
 * Back at y = 494) and `ResultScene` (the Play again bar).
 */

const HELP_ENTRY = { x: 480, y: 240 + 3 * 58 };
const ABOUT_TAB = { x: 558, y: 96 };
const SEND_FEEDBACK = { x: 480, y: 406 };
const SEND = { x: 390, y: 446 };
const CANCEL = { x: 570, y: 446 };
const HELP_BACK = { x: 480, y: 494 };
/** Inside the Play again bar's left end, clear of its label. */
const PLAY_AGAIN_BAR = { x: 380, y: 468 };

/** What a page reported against its policy, and everything that went wrong on it. */
interface Watch {
  violations: string[];
  problems: string[];
  logs: string[];
}

/**
 * Listen from before the page's own scripts run, so nothing is missed: the
 * `securitypolicyviolation` event through a function exposed to the page (it
 * survives navigations), and the console and page errors from this side.
 */
async function watch(page: Page): Promise<Watch> {
  const seen: Watch = { violations: [], problems: [], logs: [] };
  await page.exposeFunction('reportViolation', (line: string) => seen.violations.push(line));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { reportViolation(line: string): void }).reportViolation;
      report(`${event.violatedDirective} blocked ${event.blockedURI} at ${event.sourceFile}`);
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

/** Wait for Boot to finish (it logs the seed last but for the hand-off to Intro) and Intro to draw. */
async function boot(page: Page, query: string): Promise<void> {
  const booted = page.waitForEvent('console', (m) => m.text().startsWith('[rng] seed='));
  await page.goto(`/${query}`);
  await booted;
  await page.waitForTimeout(1500);
}

/** A pixel's colour from a page screenshot, decoded in a scratch page that has no policy. */
async function pixelAt(
  page: Page,
  at: { x: number; y: number },
): Promise<{ r: number; g: number; b: number }> {
  const shot = (await page.screenshot()).toString('base64');
  const scratch = await page.context().newPage();
  try {
    return await scratch.evaluate(
      async ([data, x, y]) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('no 2d context');
        context.drawImage(image, 0, 0);
        const [r = 0, g = 0, b = 0] = context.getImageData(Number(x), Number(y), 1, 1).data;
        return { r, g, b };
      },
      [shot, at.x, at.y] as const,
    );
  } finally {
    await scratch.close();
  }
}

/** How many of the 960x540 screenshot's sampled pixels are not black: a blank canvas has none. */
async function litPixels(page: Page): Promise<number> {
  const shot = (await page.screenshot()).toString('base64');
  const scratch = await page.context().newPage();
  try {
    return await scratch.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4 * 16) {
        if ((pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0) > 60) lit += 1;
      }
      return lit;
    }, shot);
  } finally {
    await scratch.close();
  }
}

test('the built page carries one policy meta first in the head, and no inline code', async ({
  request,
}) => {
  const html = await (await request.get('/')).text();
  expect(html.match(/<meta[^>]+http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
  expect(html).toMatch(/<head>\s*<meta http-equiv="Content-Security-Policy"/);
  const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const decoded = policy.replaceAll('&#39;', "'");
  expect(decoded).toContain("default-src 'none'");
  expect(decoded).toContain("script-src 'self'");
  expect(decoded).toContain(`connect-src 'self' ${FEEDBACK_URL}`);
  expect(decoded).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  // Nothing the policy would have to allow inline: no script body, style block or style attribute.
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
  expect(html).not.toMatch(/<style/);
  expect(html).not.toMatch(/\sstyle=/);
});

test('a full walk of the game under the policy logs no violation and no error', async ({
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

  await boot(page, '?seed=7');
  expect(await litPixels(page), 'Intro is drawn').toBeGreaterThan(50);

  // Help -> About -> the feedback form, filled and sent to the routed endpoint.
  await page.mouse.click(HELP_ENTRY.x, HELP_ENTRY.y);
  await page.waitForTimeout(800);
  await page.mouse.click(ABOUT_TAB.x, ABOUT_TAB.y);
  await page.waitForTimeout(800);
  await page.mouse.click(SEND_FEEDBACK.x, SEND_FEEDBACK.y);
  await expect(page.locator('input[name="subject"]')).toBeFocused();
  await page.locator('input[name="subject"]').fill('csp walk');
  await page.locator('textarea[name="message"]').fill('sent under the policy');
  await page.mouse.click(SEND.x, SEND.y);
  await expect.poll(() => feedback.length, { message: 'the feedback POST went out' }).toBe(1);
  expect(feedback[0]).toMatchObject({
    access_key: E2E_FEEDBACK_KEY,
    subject: '[CrimsonOnslaught] Feedback: csp walk',
  });
  await page.mouse.click(CANCEL.x, CANCEL.y);
  await expect(page.locator('input[name="subject"]')).toHaveCount(0);
  await page.mouse.click(HELP_BACK.x, HELP_BACK.y);
  await page.waitForTimeout(800);

  // Settings and back.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // Profile: the name field is a real input over the canvas.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.keyboard.press('ArrowDown'); // wakes the highlight on Rename
  await page.keyboard.press('Enter');
  const nameField = page.locator('input[aria-label="Player name"]');
  await expect(nameField).toBeFocused();
  await nameField.fill('Test_Player');
  await page.keyboard.press('Enter');
  await expect(nameField).toBeHidden();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // Start Game -> a card -> a run. Audio unlocks on the click; the hero walks so it is not idle.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const card = cardCenter(0);
  await page.mouse.click(card.x, card.y);
  await page.waitForTimeout(1500);
  await page.keyboard.down('d');
  await page.waitForTimeout(3000);
  await page.keyboard.up('d');
  await page.keyboard.down('s');
  await page.waitForTimeout(3000);
  await page.keyboard.up('s');
  await page.waitForTimeout(4000);
  expect(await litPixels(page), 'the arena is drawn').toBeGreaterThan(200);
  await page.screenshot({ path: test.info().outputPath('prod-run.png') });

  // Esc -> End run -> Yes -> Result.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  // The first press wakes the highlight on Resume; then Settings, Restart, End run.
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowLeft'); // wakes the highlight on Yes
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath('prod-result.png') });
  const bar = await pixelAt(page, PLAY_AGAIN_BAR);
  // The bar is wine (0x5a1620) at 60% to 100% opacity over black.
  expect(bar.r, 'the Result screen shows its Play again bar').toBeGreaterThan(40);
  expect(bar.r).toBeLessThan(110);
  expect(bar.g).toBeLessThan(40);

  expect(seen.violations).toEqual([]);
  expect(seen.problems).toEqual([]);
});

test('on the built page only ?seed= has any effect', async ({ page }) => {
  const seen = await watch(page);
  await boot(
    page,
    '?seed=7&timeScale=30&invulnerable=1&startAt=1170&loadout=fire_meteor&enemies=swarm&debug=textures',
  );

  expect(seen.logs).toContain('[rng] seed=7');
  expect(seen.logs.filter((line) => line.startsWith('[run] '))).toEqual([]);
  // The texture debug scene, had `debug` been honoured, would have replaced the menu.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const card = cardCenter(0);
  expect(await litPixels(page), 'SpellSelect is drawn, not the debug grid').toBeGreaterThan(50);
  await page.mouse.click(card.x, card.y);
  await page.waitForTimeout(1500);
  expect(seen.logs.filter((line) => line.startsWith('[run] '))).toEqual([]);
  expect(seen.violations).toEqual([]);
  expect(seen.problems).toEqual([]);
});
