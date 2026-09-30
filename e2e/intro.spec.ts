import { expect, test, type Page } from '@playwright/test';
import { FEEDBACK_SETTING_KEYS } from '../src/config/hitFeedback';
import { MENU_ART } from '../src/config/menuArt';
import { AUDIO_SETTING_KEYS } from '../src/config/sounds';
import { emptySave, type Save } from '../src/core/save';
import { AUDIO_REGISTRY_KEY, SCENE, type GamePayload } from '../src/core/scenePayloads';
import type { Audio } from '../src/render/audio';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import {
  PAD,
  addFakePad,
  cardCenter,
  clickRow,
  collectErrors,
  frames,
  isSceneActive,
  menuRows,
  padPress,
  sceneTexts,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * The front door (#121): boot lands on Intro; Start Game leads to the same run
 * SpellSelect always started; Settings and Profile open and come back; mouse,
 * keyboard and a gamepad all drive the menus. Rows are
 * found where the scene drew them (`menuRows`), not at fixed positions.
 */

/** Seed storage on an empty store only, so what the game writes survives a reload. */
async function seedStorage(page: Page, save: Save): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: SAVE_STORAGE_KEY, value: JSON.stringify(save) },
  );
}

async function storedSettings(page: Page): Promise<Record<string, unknown>> {
  const json = await page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);
  return (JSON.parse(json ?? '{"settings":{}}') as Save).settings;
}

/** The title image(s) Intro shows, by texture key, with their bounds in game pixels. */
function titleImages(
  page: Page,
): Promise<{ top: number; bottom: number; left: number; right: number }[]> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return game.scene
      .getScene('Intro')
      .children.list.filter(
        (child) =>
          child.type === 'Image' &&
          (child as unknown as { texture: { key: string } }).texture.key === key,
      )
      .map((child) => {
        const box = (child as unknown as { getBounds(): DOMRect }).getBounds();
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
      });
  }, MENU_ART.title.key);
}

test('boots to Intro, and Start Game plays the run SpellSelect always started', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=7');
  await waitForScene(page, SCENE.intro);
  // The title is the painted image, not lettering; the entries are texts.
  const texts = await sceneTexts(page, SCENE.intro);
  expect(texts).toEqual(expect.arrayContaining(['Start Game', 'Settings', 'Profile', 'Help']));
  expect(texts).not.toContain('Crimson Onslaught');
  expect((await titleImages(page)).length).toBe(1);

  await clickRow(page, SCENE.intro, 'Start Game');
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(2);
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const payload = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as unknown as { payload: GamePayload | null }).payload;
  }, SCENE.game);
  expect(payload).toEqual({ spellId: 'lightning', seed: 7 });
  expect(errors).toEqual([]);
});

test('the painted title clears the top edge and the first plate', async ({ page }) => {
  await page.goto('/?seed=7');
  await waitForScene(page, SCENE.intro);
  const [title] = await titleImages(page);
  expect(title).toBeDefined();
  // The image carries a 27 px margin of shadow and glow round the letters.
  const margin = (MENU_ART.title.height - 205) / 2;
  const [first, ...rest] = await menuRows(page, SCENE.intro);
  expect(title!.top + margin, 'letters below the canvas top').toBeGreaterThanOrEqual(12);
  expect(
    first!.bounds.y - (title!.bottom - margin),
    'first plate under the letters',
  ).toBeGreaterThanOrEqual(12);
  expect((title!.left + title!.right) / 2).toBe(480);
  // The last plate keeps 8 px clear of the save notice, which sits at y 468 and is 27 px tall.
  const last = rest[rest.length - 1]!;
  expect(468 - 27 / 2 - (last.bounds.y + last.bounds.height)).toBeGreaterThanOrEqual(8);
});

test('without the title image, Intro letters the title in the title face and warns once', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.route('**/assets/menu/menu_title.png', (route) => route.fulfill({ status: 404 }));
  await page.goto('/?seed=7');
  await waitForScene(page, SCENE.intro);
  expect(await titleImages(page)).toEqual([]);
  expect(await sceneTexts(page, SCENE.intro)).toContain('Crimson Onslaught');
  expect((await menuRows(page, SCENE.intro)).map((row) => row.label)).toEqual([
    'Start Game',
    'Settings',
    'Profile',
    'Help',
  ]);
  const menuWarnings = warnings.filter((text) => text.startsWith('[menu]'));
  expect(menuWarnings).toHaveLength(1);
  expect(menuWarnings[0]).toContain('menu_title.png');
});

test('Intro lists its four entries in order, and the arrows and the pointer light them', async ({
  page,
}) => {
  await page.goto('/?seed=7');
  await waitForScene(page, SCENE.intro);
  const rows = await menuRows(page, SCENE.intro);
  expect(rows.map((row) => row.label)).toEqual(['Start Game', 'Settings', 'Profile', 'Help']);
  expect(rows.every((row) => row.enabled && !row.selected)).toBe(true);

  await page.keyboard.press('ArrowDown'); // reveals Start
  await page.keyboard.press('ArrowDown');
  expect((await menuRows(page, SCENE.intro)).map((row) => row.selected)).toEqual([
    false,
    true,
    false,
    false,
  ]);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp'); // wraps to Help
  expect((await menuRows(page, SCENE.intro)).map((row) => row.selected)).toEqual([
    false,
    false,
    false,
    true,
  ]);
});

test('the keyboard opens Profile and Esc comes back, from SpellSelect too', async ({ page }) => {
  const errors = collectErrors(page);
  const played: Save = emptySave();
  played.profile = {
    name: 'Test_Player',
    runs: 3,
    wins: 1,
    bestTimeMs: 125_000,
    bestLevel: 9,
    totalKills: 1500,
    spellCounts: { fire: 1, ice: 2 },
  };
  await seedStorage(page, played);

  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  // The first arrow only reveals the highlight on Start; two more reach Profile.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.profile);
  expect(await sceneTexts(page, SCENE.profile)).toEqual(
    expect.arrayContaining(['Runs played', '3', '2:05', '9', '1,500', 'Ice Arrow']),
  );

  await page.keyboard.press('Escape');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.intro);
  expect(errors).toEqual([]);
});

test('Profile says so before the first run', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await page.keyboard.press('ArrowUp'); // reveals Start
  await page.keyboard.press('ArrowUp'); // wraps to Help
  await page.keyboard.press('ArrowUp'); // Profile
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.profile);
  expect(await sceneTexts(page, SCENE.profile)).toContain('No runs recorded yet.');
});

test('Settings changes apply at once, persist, and reach the next run', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForScene(page, SCENE.settings);

  // Keyboard: a reflex Enter only highlights "−" (it changes something, so it
  // is no default); the next Enter turns the volume down a notch.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(async (key) => {
        const { game } = await import('/src/main.ts');
        return (game.registry.get(key) as Audio).settings.master;
      }, AUDIO_REGISTRY_KEY),
    )
    .toBe(0.9);
  expect(await sceneTexts(page, SCENE.settings)).toContain('90%');

  // Mouse: switch screen shake off.
  // The minimap's Enemies layer starts off (CO-207), so it is the one dim row.
  expect(
    (await menuRows(page, SCENE.settings)).filter((row) => row.dim).map((row) => row.label),
  ).toEqual(['Enemies: Off']);
  await clickRow(page, SCENE.settings, 'Screen shake: On');
  // An off switch is quieter than an on one by more than its word.
  await expect
    .poll(async () =>
      (await menuRows(page, SCENE.settings)).filter((r) => r.dim).map((r) => r.label),
    )
    .toEqual(['Screen shake: Off', 'Enemies: Off']);
  await expect
    .poll(() => storedSettings(page))
    .toEqual(
      expect.objectContaining({
        [AUDIO_SETTING_KEYS.master]: 0.9,
        [FEEDBACK_SETTING_KEYS.shake]: 0,
      }),
    );

  // Survives a reload, and the run started afterwards plays without shake.
  await page.reload();
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(0);
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  const inRun = await page.evaluate(
    async ([gameKey, audioKey]) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(gameKey) as unknown as { feedback: { shake: number } };
      return {
        shake: scene.feedback.shake,
        master: (game.registry.get(audioKey) as Audio).settings.master,
      };
    },
    [SCENE.game, AUDIO_REGISTRY_KEY] as const,
  );
  expect(inRun).toEqual({ shake: 0, master: 0.9 });
  expect(errors).toEqual([]);
});

test('a gamepad drives Intro into Settings and back', async ({ page }) => {
  await addFakePad(page);
  const press = (button: number): Promise<void> => padPress(page, button);
  const { A, UP, DOWN } = PAD;

  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await frames(page, 4); // the first poll after a connect only takes a baseline
  await press(DOWN); // reveals Start
  await press(DOWN); // Settings
  await press(A);
  await waitForScene(page, SCENE.settings);

  await frames(page, 4);
  await press(UP); // reveals the first control
  await press(UP); // wraps to Back
  await press(A);
  await waitForScene(page, SCENE.intro);
});

test('pad B goes back one screen at a time from Settings, Profile, SpellSelect and Upgrades (#377)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await addFakePad(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await frames(page, 4); // the first poll after a connect only takes a baseline
  // The mouse opens each screen; the pad only backs out. A fresh scene baselines
  // its pad first, so give it a few frames before pressing.
  const back = async (from: string, to: string): Promise<void> => {
    await waitForScene(page, from);
    await frames(page, 4);
    await padPress(page, PAD.B);
    await waitForScene(page, to);
    await frames(page, 4);
  };

  await clickRow(page, SCENE.intro, 'Settings');
  await back(SCENE.settings, SCENE.intro);

  await clickRow(page, SCENE.intro, 'Profile');
  await back(SCENE.profile, SCENE.intro);

  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await clickRow(page, SCENE.spellSelect, 'Upgrades  (U)');
  // Upgrades -> SpellSelect, one screen, not straight to Intro.
  await back(SCENE.upgrades, SCENE.spellSelect);
  expect(await isSceneActive(page, SCENE.intro)).toBe(false);
  await back(SCENE.spellSelect, SCENE.intro);
  expect(errors).toEqual([]);
});
