import { expect, test, type Page } from '@playwright/test';
import { FEEDBACK_SETTING_KEYS } from '../src/config/hitFeedback';
import { AUDIO_SETTING_KEYS } from '../src/config/sounds';
import { emptySave, type Save } from '../src/core/save';
import { AUDIO_REGISTRY_KEY, SCENE, type GamePayload } from '../src/core/scenePayloads';
import type { Audio } from '../src/render/audio';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import { cardCenter, collectErrors, sceneTexts, startFromIntro, waitForScene } from './game';

/**
 * The front door (#121): boot lands on Intro; Start Game leads to the same run
 * SpellSelect always started; Settings and Profile open and come back; mouse,
 * keyboard and a gamepad all drive the menus. Button positions mirror
 * `IntroScene` (entries 68 px apart from y = 280) and `SettingsScene` (rows
 * 58 px apart from y = 140, switches 120 px right of centre).
 */

const INTRO_ENTRY = { start: { x: 480, y: 280 }, settings: { x: 480, y: 348 } } as const;
const SHAKE_SWITCH = { x: 600, y: 140 + 4 * 58 };

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

/** Wait for `n` browser frames; the game loop steps once per frame. */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
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
}

test('boots to Intro, and Start Game plays the run SpellSelect always started', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=7');
  await waitForScene(page, SCENE.intro);
  expect(await sceneTexts(page, SCENE.intro)).toEqual(
    expect.arrayContaining(['Crimson Onslaught', 'Start Game', 'Settings', 'Profile']),
  );

  await page.mouse.click(INTRO_ENTRY.start.x, INTRO_ENTRY.start.y);
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

test('the keyboard opens Profile and Esc comes back, from SpellSelect too', async ({ page }) => {
  const errors = collectErrors(page);
  const played: Save = emptySave();
  played.profile = {
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
  await page.keyboard.press('ArrowUp'); // wraps to Profile
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.profile);
  expect(await sceneTexts(page, SCENE.profile)).toContain('No runs recorded yet.');
});

test('Settings changes apply at once, persist, and reach the next run', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await page.mouse.click(INTRO_ENTRY.settings.x, INTRO_ENTRY.settings.y);
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
  await page.mouse.click(SHAKE_SWITCH.x, SHAKE_SWITCH.y);
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
  // A fake standard-mapping pad Phaser finds by polling `navigator.getGamepads`.
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
      await frames(page, 4);
    }
  };
  const A = 0;
  const UP = 12;
  const DOWN = 13;

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
