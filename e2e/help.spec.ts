import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { E2E_FEEDBACK_KEY } from '../playwright.config';
import { CHANGELOG } from '../src/config/changelog';
import { FEEDBACK_URL } from '../src/core/feedback';
import { pickupHelpRows } from '../src/core/helpModel';
import { AUDIO_REGISTRY_KEY, SCENE, type HelpView } from '../src/core/scenePayloads';
import type { Audio } from '../src/render/audio';
import { collectErrors, sceneTexts, waitForScene } from './game';

/**
 * The Help screen (#226): Intro's fourth entry opens it by mouse, keys or pad;
 * the Pickups tab has a row with art for every pickup; About shows the version,
 * what's new and a feedback form, which posts to the service's URL (routed
 * here, never really sent). Positions mirror `IntroScene` (entries 58 px apart
 * from y = 240) and `HelpScene` (tabs at y = 96, 156 px apart; Back at
 * y = 494; Send feedback at y = 406; Send and Cancel at y = 446).
 */

const HELP_ENTRY = { x: 480, y: 240 + 3 * 58 };
const TAB = { pickups: { x: 402, y: 96 }, about: { x: 558, y: 96 } } as const;
const BACK = { x: 480, y: 494 };
const SEND_FEEDBACK = { x: 480, y: 406 };
const SEND = { x: 390, y: 446 };
const CANCEL = { x: 570, y: 446 };

const VERSION = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const NAMES = pickupHelpRows().map((row) => row.name);

async function helpView(page: Page): Promise<HelpView> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as unknown as { view: HelpView }).view;
  }, SCENE.help);
}

/** Wait for Help to be showing `view` (a tab switch restarts the scene). */
async function waitForView(page: Page, view: HelpView): Promise<void> {
  await waitForScene(page, SCENE.help);
  await expect.poll(() => helpView(page), { message: `Help shows ${view}` }).toBe(view);
}

/** Every text and sprite Help draws, as game-pixel bounds, to check nothing is clipped. */
async function drawnBounds(
  page: Page,
): Promise<{ label: string; l: number; t: number; r: number; b: number }[]> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return game.scene
      .getScene(key)
      .children.list.filter((child) => child.type === 'Text' || child.type === 'Sprite')
      .map((child) => {
        const bounds = (child as unknown as { getBounds(): DOMRect }).getBounds();
        const label = (child as unknown as { text?: string }).text ?? child.type;
        return { label, l: bounds.left, t: bounds.top, r: bounds.right, b: bounds.bottom };
      });
  }, SCENE.help);
}

async function expectOnScreen(page: Page): Promise<void> {
  for (const box of await drawnBounds(page)) {
    expect(box.l, box.label).toBeGreaterThanOrEqual(0);
    expect(box.t, box.label).toBeGreaterThanOrEqual(0);
    expect(box.r, box.label).toBeLessThanOrEqual(960);
    expect(box.b, box.label).toBeLessThanOrEqual(540);
  }
}

async function openFeedbackForm(page: Page): Promise<void> {
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await page.mouse.click(HELP_ENTRY.x, HELP_ENTRY.y);
  await waitForView(page, 'pickups');
  await page.mouse.click(TAB.about.x, TAB.about.y);
  await waitForView(page, 'about');
  await page.mouse.click(SEND_FEEDBACK.x, SEND_FEEDBACK.y);
  await waitForView(page, 'feedback');
  await expect(page.locator('input[name="subject"]')).toBeFocused();
}

/** Route the service's URL; every body posted to it is kept, and none leaves the machine. */
async function routeFeedback(page: Page, status: number): Promise<unknown[]> {
  const bodies: unknown[] = [];
  await page.route(FEEDBACK_URL, async (route: Route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ success: status === 200 }),
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  return bodies;
}

test('the mouse opens Help, every pickup has a row with art, and Back returns', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await page.mouse.click(HELP_ENTRY.x, HELP_ENTRY.y);
  await waitForView(page, 'pickups');

  const texts = await sceneTexts(page, SCENE.help);
  expect(texts).toEqual(expect.arrayContaining(['Help', 'Pickups', 'About', ...NAMES]));
  for (const row of pickupHelpRows()) {
    expect(texts).toEqual(expect.arrayContaining([row.source, row.effect]));
  }
  // Each icon plays its own idle clip, scaled into the one icon box.
  const icons = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return game.scene
      .getScene(key)
      .children.list.filter((child) => child.type === 'Sprite')
      .map((child) => {
        const sprite = child as unknown as {
          anims: { isPlaying: boolean; currentAnim: { key: string } | null };
          displayWidth: number;
          displayHeight: number;
        };
        return {
          clip: sprite.anims.currentAnim?.key ?? null,
          playing: sprite.anims.isPlaying,
          size: Math.max(sprite.displayWidth, sprite.displayHeight),
        };
      });
  }, SCENE.help);
  expect(icons.map((icon) => icon.clip)).toEqual(pickupHelpRows().map((row) => row.clip));
  for (const icon of icons) {
    expect(icon.playing).toBe(true);
    expect(icon.size).toBeCloseTo(32, 0);
  }
  await expectOnScreen(page);
  await page.screenshot({ path: test.info().outputPath('help-pickups.png') });

  await page.mouse.click(BACK.x, BACK.y);
  await waitForScene(page, SCENE.intro);
  expect(errors).toEqual([]);
});

test('the keyboard opens Help, switches to About, and Esc returns', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await page.keyboard.press('ArrowUp'); // reveals Start
  await page.keyboard.press('ArrowUp'); // wraps to Help
  await page.keyboard.press('Enter');
  await waitForView(page, 'pickups');

  await page.keyboard.press('ArrowRight'); // reveals the Pickups tab
  await page.keyboard.press('ArrowRight'); // About
  await page.keyboard.press('Enter');
  await waitForView(page, 'about');
  const texts = await sceneTexts(page, SCENE.help);
  expect(texts).toContain(`Crimson Onslaught  v${VERSION}`);
  for (const { version, line } of CHANGELOG) expect(texts).toContain(`v${version}  ${line}`);
  expect(texts).toContain('Send feedback');
  await expectOnScreen(page);
  await page.screenshot({ path: test.info().outputPath('help-about.png') });

  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.intro);
  expect(errors).toEqual([]);
});

test('a gamepad opens Help, reaches About, and backs out', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'e2e pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { e2ePad: typeof pad }).e2ePad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
  const frames = (n: number): Promise<void> =>
    page.evaluate(
      (count) =>
        new Promise<void>((resolve) => {
          const tick = (left: number): void => {
            if (left <= 0) resolve();
            else requestAnimationFrame(() => tick(left - 1));
          };
          tick(count);
        }),
      n,
    );
  const press = async (button: number): Promise<void> => {
    for (const down of [true, false]) {
      await page.evaluate(
        ([index, pressed]) => {
          const pad = (
            window as unknown as {
              e2ePad: { timestamp: number; buttons: { pressed: boolean; value: number }[] };
            }
          ).e2ePad;
          pad.buttons[index as number] = { pressed: pressed as boolean, value: pressed ? 1 : 0 };
          // Phaser skips a pad state stamped before it first saw the pad.
          pad.timestamp = performance.now();
        },
        [button, down] as const,
      );
      await frames(4);
    }
  };
  const A = 0;
  const UP = 12;
  const DOWN = 13;

  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await frames(4); // the first poll after a connect only takes a baseline
  await press(UP); // reveals Start
  await press(UP); // wraps to Help
  await press(A);
  await waitForView(page, 'pickups');

  await frames(4);
  await press(DOWN); // reveals the Pickups tab
  await press(DOWN); // About
  await press(A);
  await waitForView(page, 'about');

  await frames(4);
  await press(DOWN); // reveals the Pickups tab
  await press(UP); // wraps to Back
  await press(A);
  await waitForScene(page, SCENE.intro);
});

test('the feedback form refuses blank input, sends a prefixed subject, and keeps keys to itself', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const bodies = await routeFeedback(page, 200);
  await openFeedbackForm(page);
  await expectOnScreen(page);
  await page.screenshot({ path: test.info().outputPath('help-feedback.png') });

  // The field being typed in has the crimson border; the other keeps the wine one.
  const borders = (): Promise<string[]> =>
    page
      .locator('input[name="subject"], textarea[name="message"]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopColor));
  const CRIMSON = 'rgb(220, 20, 60)';
  const WINE = 'rgb(90, 22, 32)';
  expect(await borders()).toEqual([CRIMSON, WINE]);
  await page.keyboard.press('Tab');
  expect(await borders()).toEqual([WINE, CRIMSON]);
  await page.screenshot({ path: test.info().outputPath('help-feedback-message.png') });
  await page.keyboard.press('Shift+Tab');

  // Blank: refused in the form, nothing posted.
  await page.mouse.click(SEND.x, SEND.y);
  await expect.poll(() => sceneTexts(page, SCENE.help)).toContain('Enter a subject and a message.');
  expect(bodies).toEqual([]);

  // The DOM form is not a Text or Sprite, so `expectOnScreen` skips it: the
  // message box must end above the status line, with slack for CI's taller
  // fonts. The viewport is the canvas, so page pixels are game pixels.
  const formBottom = await page
    .locator('textarea[name="message"]')
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const statusTop = (await drawnBounds(page)).find(
    (box) => box.label === 'Enter a subject and a message.',
  )?.t;
  console.log(`feedback form: message box bottom ${formBottom}, status top ${statusTop}`);
  expect(statusTop).toBeDefined();
  expect(formBottom).toBeLessThanOrEqual((statusTop ?? 0) - 8);

  // Menu keys, the mute key and Enter all stay in the fields.
  const muted = (): Promise<boolean> =>
    page.evaluate(async (key) => {
      const { game } = await import('/src/main.ts');
      return (game.registry.get(key) as Audio).settings.muted;
    }, AUDIO_REGISTRY_KEY);
  const mutedBefore = await muted();
  await page.keyboard.type('wasd m');
  await page.keyboard.press('Tab');
  await page.keyboard.type('line one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line two');
  expect(await helpView(page)).toBe('feedback');
  expect(await muted()).toBe(mutedBefore);
  await expect(page.locator('input[name="subject"]')).toHaveValue('wasd m');
  await expect(page.locator('textarea[name="message"]')).toHaveValue('line one\nline two');

  await page.mouse.click(SEND.x, SEND.y);
  await expect.poll(() => sceneTexts(page, SCENE.help)).toContain('Thanks, feedback sent');
  expect(bodies).toEqual([
    {
      access_key: E2E_FEEDBACK_KEY,
      subject: '[CrimsonOnslaught] Feedback: wasd m',
      message: 'line one\nline two',
      version: VERSION,
      botcheck: '',
    },
  ]);
  // Send rests after a success, so a second click posts nothing.
  await page.locator('input[name="subject"]').fill('again');
  await page.locator('textarea[name="message"]').fill('again');
  await page.mouse.click(SEND.x, SEND.y);
  await page.waitForTimeout(300);
  expect(bodies).toHaveLength(1);

  // Cancel returns to About and takes the DOM form with it.
  await page.mouse.click(CANCEL.x, CANCEL.y);
  await waitForView(page, 'about');
  await expect(page.locator('input[name="subject"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a failed send says so and keeps what was typed; Esc in a field closes the form', async ({
  page,
}) => {
  const bodies = await routeFeedback(page, 500);
  await openFeedbackForm(page);
  await page.keyboard.type('Crash');
  await page.keyboard.press('Tab');
  await page.keyboard.type('It froze on wave 3');
  await page.mouse.click(SEND.x, SEND.y);
  await expect.poll(() => sceneTexts(page, SCENE.help)).toContain("Couldn't send, try again");
  expect(bodies).toHaveLength(1);
  await expect(page.locator('input[name="subject"]')).toHaveValue('Crash');
  await expect(page.locator('textarea[name="message"]')).toHaveValue('It froze on wave 3');

  await page.locator('textarea[name="message"]').focus();
  await page.keyboard.press('Escape');
  await waitForView(page, 'about');
  await expect(page.locator('textarea[name="message"]')).toHaveCount(0);
});
