import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { E2E_FEEDBACK_KEY } from '../playwright.config';
import { CHANGELOG } from '../src/config/changelog';
import { FEEDBACK_URL } from '../src/core/feedback';
import { pickupHelpRows, spellHelpPages } from '../src/core/helpModel';
import { AUDIO_REGISTRY_KEY, SCENE, type HelpView } from '../src/core/scenePayloads';
import type { Audio } from '../src/render/audio';
import { clickRow, collectErrors, menuRows, sceneTexts, waitForScene } from './game';
import type { MenuRowReport } from '../src/scenes/menuUi';

/**
 * The Help screen (#226): Intro's fourth entry opens it by mouse, keys or pad;
 * the Pickups tab has a row with art for every pickup; About shows the version,
 * what's new and a feedback form, which posts to the service's URL (routed
 * here, never really sent). Rows are found where the scene drew them (`menuRows`).
 */

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
  await clickRow(page, SCENE.intro, 'Help');
  await waitForView(page, 'pickups');
  await clickRow(page, SCENE.help, 'About');
  await waitForView(page, 'about');
  await clickRow(page, SCENE.help, 'Send feedback');
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
  await clickRow(page, SCENE.intro, 'Help');
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
  // The open tab is marked apart from whatever the arrows have lit.
  const rows = await menuRows(page, SCENE.help);
  expect(rows.filter((row) => row.active).map((row) => row.label)).toEqual(['Pickups']);
  expect(rows.filter((row) => row.selected)).toEqual([]);
  await expectOnScreen(page);
  await page.screenshot({ path: test.info().outputPath('help-pickups.png') });

  await clickRow(page, SCENE.help, 'Back  (Esc)');
  await waitForScene(page, SCENE.intro);
  expect(errors).toEqual([]);
});

/**
 * The Spells page on screen: every row of `page` drawn inside the panel, clear
 * of the tabs above and the Back row below, and each pager button that exists
 * (`< Prev` / `Next >`) clear of Back and the side edges. The screen is still,
 * so texts, boxes and rows read one after another agree.
 */
async function expectSpellsPageFits(
  page: Page,
  spellsPage: ReturnType<typeof spellHelpPages>[number],
  neighbours: { prev?: string; next?: string },
): Promise<void> {
  const boxes = await drawnBounds(page);
  const boxOf = (label: string): (typeof boxes)[number] => {
    const box = boxes.find((b) => b.label === label);
    if (!box) throw new Error(`Help drew no text "${label}"`);
    return box;
  };
  const menu = await menuRows(page, SCENE.help);
  expect(menu.filter((row) => row.active).map((row) => row.label)).toEqual(['Spells']);
  const tabs = menu.filter((row) => ['Pickups', 'Spells', 'About'].includes(row.label));
  expect(tabs.map((row) => row.label)).toEqual(['Pickups', 'Spells', 'About']);
  const back = menu.find((row) => row.label === 'Back  (Esc)')!;

  // Slack for CI's taller fonts: nothing may come within 8 px of the tabs, Back or the side edges.
  const SLACK = 8;
  const tabsBottom = Math.max(...tabs.map((row) => row.bounds.y + row.bounds.height));
  let previousBottom = tabsBottom;
  for (const row of spellsPage.rows) {
    const name = boxOf(row.name);
    const lv2 = boxOf(row.lv2);
    const lv3 = boxOf(row.lv3);
    expect(lv2.t, row.lv2).toBeGreaterThanOrEqual(previousBottom + SLACK / 2);
    expect(lv3.t, row.lv3).toBeGreaterThanOrEqual(lv2.b);
    for (const box of [name, lv2, lv3]) {
      expect(box.l, box.label).toBeGreaterThanOrEqual(30 + SLACK);
      expect(box.r, box.label).toBeLessThanOrEqual(930 - SLACK);
    }
    // The name shares the row: it starts left of the two lines and does not run into them.
    expect(name.r, row.name).toBeLessThanOrEqual(lv2.l - SLACK);
    previousBottom = lv3.b;
  }
  expect(previousBottom).toBeLessThanOrEqual(back.bounds.y - SLACK);

  // A pager button only where that neighbour page exists, labelled with its element.
  const pager = menu.filter((row) => row.label.startsWith('< ') || row.label.endsWith(' >'));
  expect(pager.map((row) => row.label)).toEqual(
    [neighbours.prev && `< ${neighbours.prev}`, neighbours.next && `${neighbours.next} >`].filter(
      (label): label is string => label !== undefined,
    ),
  );
  for (const button of pager) {
    const { x, y, width, height } = button.bounds;
    const label = boxOf(button.label);
    // On Back's row, centred label, and 8 px clear of Back and of the panel's side edges.
    expect(y + height / 2, button.label).toBeCloseTo(back.bounds.y + back.bounds.height / 2, 0);
    expect((label.l + label.r) / 2, button.label).toBeCloseTo(x + width / 2, 0);
    expect(label.l, button.label).toBeGreaterThanOrEqual(x + SLACK);
    expect(label.r, button.label).toBeLessThanOrEqual(x + width - SLACK);
    expect(x, button.label).toBeGreaterThanOrEqual(30 + SLACK);
    expect(x + width, button.label).toBeLessThanOrEqual(930 - SLACK);
    const clear =
      x + width <= back.bounds.x - SLACK || x >= back.bounds.x + back.bounds.width + SLACK;
    expect(clear, `${button.label} clear of Back`).toBe(true);
  }
  await expectOnScreen(page);
}

test('the Spells tab lists every spell of each element with its two upgrades, inside the panel', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Help');
  await waitForView(page, 'pickups');
  await clickRow(page, SCENE.help, 'Spells');
  await waitForView(page, 'spells');

  const pages = spellHelpPages();
  expect(pages.map((p) => p.title)).toEqual(['Fire', 'Ice', 'Lightning']);
  expect(pages[0]?.rows.map((row) => row.id)).toEqual([
    'fire',
    'fire_meteor',
    'fire_column',
    'fire_companion',
    'fire_dragon',
  ]);
  // Walk the pages with the pager: each fits, a `Next >` click turns forward, `< Prev` turns back.
  for (const [i, spellsPage] of pages.entries()) {
    await expectSpellsPageFits(page, spellsPage, {
      prev: pages[i - 1]?.title,
      next: pages[i + 1]?.title,
    });
    await page.screenshot({
      path: test.info().outputPath(`help-spells-${spellsPage.element}.png`),
    });
    const next = pages[i + 1];
    if (next) {
      await clickRow(page, SCENE.help, `${next.title} >`);
      await expect.poll(async () => sceneTexts(page, SCENE.help)).toContain(next.rows[0]!.lv2);
    }
  }
  for (let i = pages.length - 1; i > 0; i--) {
    await clickRow(page, SCENE.help, `< ${pages[i - 1]!.title}`);
    await expect
      .poll(async () => sceneTexts(page, SCENE.help))
      .toContain(pages[i - 1]!.rows[0]!.lv2);
  }

  await clickRow(page, SCENE.help, 'Back  (Esc)');
  await waitForScene(page, SCENE.intro);
  expect(errors).toEqual([]);
});

test('the Spells pager is reached by keyboard and turns the page', async ({ page }) => {
  // Only with a second element's text in the table does a pager exist to reach.
  const pages = spellHelpPages();
  test.skip(pages.length < 2, 'one Spells page: no pager buttons');
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Help');
  await waitForView(page, 'pickups');
  await clickRow(page, SCENE.help, 'Spells');
  await waitForView(page, 'spells');

  // Menu order: tabs, `Next >` (page 0 has no `< Prev`), Back. Arrows reveal the first entry.
  await page.keyboard.press('ArrowRight'); // reveals the Pickups tab
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); // Spells, About, Next >
  const lit = (await menuRows(page, SCENE.help)).filter((row) => row.selected);
  expect(lit.map((row) => row.label)).toEqual([`${pages[1]!.title} >`]);
  await page.keyboard.press('Enter');
  await expect.poll(async () => sceneTexts(page, SCENE.help)).toContain(pages[1]!.rows[0]!.lv2);
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
  await page.keyboard.press('ArrowRight'); // Spells
  await page.keyboard.press('Enter');
  await waitForView(page, 'spells');
  expect(await sceneTexts(page, SCENE.help)).toContain(spellHelpPages()[0]!.rows[0]!.lv2);

  await page.keyboard.press('ArrowRight'); // reveals the Pickups tab
  await page.keyboard.press('ArrowRight'); // Spells
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
  await press(DOWN); // Spells
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
  await clickRow(page, SCENE.help, 'Send');
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

  await clickRow(page, SCENE.help, 'Send');
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
  // Read once per poll: the row as one evaluate saw it, label, bounds and enabled together.
  let resting: MenuRowReport | undefined;
  await expect
    .poll(async () => {
      resting = (await menuRows(page, SCENE.help)).find((row) => row.label.startsWith('Send ('));
      return resting?.label;
    })
    .toMatch(/^Send \(\d+ s\)$/);
  expect(resting?.enabled).toBe(false);
  const { x, y, width, height } = resting!.bounds;
  await page.mouse.click(x + width / 2, y + height / 2);
  await page.waitForTimeout(300);
  expect(bodies).toHaveLength(1);

  // Cancel returns to About and takes the DOM form with it.
  await clickRow(page, SCENE.help, 'Cancel  (Esc)');
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
  await clickRow(page, SCENE.help, 'Send');
  await expect.poll(() => sceneTexts(page, SCENE.help)).toContain("Couldn't send, try again");
  expect(bodies).toHaveLength(1);
  await expect(page.locator('input[name="subject"]')).toHaveValue('Crash');
  await expect(page.locator('textarea[name="message"]')).toHaveValue('It froze on wave 3');

  await page.locator('textarea[name="message"]').focus();
  await page.keyboard.press('Escape');
  await waitForView(page, 'about');
  await expect(page.locator('textarea[name="message"]')).toHaveCount(0);
});

test('a hostile spellPage is refused whole: Help falls back to Pickups and draws without an error', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Help');
  await waitForView(page, 'pickups');

  const restartHelp = (payload: object) =>
    page.evaluate(
      async ([key, data]) => {
        const { game } = await import('/src/main.ts');
        game.scene.getScene(key as string).scene.restart(data as object);
      },
      [SCENE.help, payload] as const,
    );

  // A page the scene accepts shows the Spells tab; the same view with any of
  // these is not a HelpPayload, so the scene shows its default view instead.
  await restartHelp({ view: 'spells', spellPage: 1 });
  await waitForView(page, 'spells');
  for (const spellPage of [999, -1, '1', Number.NaN, 1.5, { page: 1 }, [1]]) {
    await restartHelp({ view: 'spells', spellPage });
    await expect
      .poll(() => helpView(page), { message: `Help falls back for ${String(spellPage)}` })
      .toBe('pickups');
    await waitForScene(page, SCENE.help);
    expect(await sceneTexts(page, SCENE.help), String(spellPage)).toEqual(
      expect.arrayContaining(['Help', 'Pickups', 'About', ...NAMES]),
    );
    await expectOnScreen(page);
    // Back to the accepted case, so the fallback is seen to be a change and not a stale view.
    await restartHelp({ view: 'spells', spellPage: 1 });
    await waitForView(page, 'spells');
  }
  expect(errors).toEqual([]);
});
