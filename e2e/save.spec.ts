import { expect, test, type Page } from '@playwright/test';
import { PLAYER_MAX_HP } from '../src/config/player';
import { upgradeById } from '../src/config/meta';
import {
  SAVE_COUNT_MAX,
  SAVE_FAILED_TEXT,
  SAVE_RESET_TEXT,
  emptySave,
  type Save,
} from '../src/core/save';
import { SCENE } from '../src/core/scenePayloads';
import type { UpgradesScene } from '../src/scenes/UpgradesScene';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import {
  cardCenter,
  clickRow,
  collectErrors,
  menuRows,
  readHud,
  sceneTexts,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * Persistence (CO-101) through the real storage: what Boot does with a corrupt
 * entry, and that a bought upgrade survives a reload and reaches the next run.
 * Each test gets a fresh browser context, so storage starts empty and the
 * `addInitScript` below is the only thing in it.
 */

const vigor = upgradeById('upgrade_vigor');
if (!vigor) throw new Error('upgrade_vigor is missing from the config');

/**
 * Put `json` in storage before the page's own scripts run. An init script runs
 * on every navigation, reloads included, so it only seeds an empty store: what
 * the game wrote before a reload must be what the game reads after it.
 */
async function seedStorage(page: Page, json: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: SAVE_STORAGE_KEY, value: json },
  );
}

function withName(save: Save, name: string): Save {
  return { ...save, profile: { ...save.profile, name } };
}

function readStorage(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);
}

/** The save as the Upgrades scene sees it (`UpgradesScene.save`), from the registry. */
function readSave(page: Page): Promise<Save> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as UpgradesScene).save;
  }, SCENE.upgrades);
}

async function openUpgrades(page: Page): Promise<void> {
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('u');
  await waitForScene(page, SCENE.upgrades);
}

test('a corrupt save is reset with a warning and the game still boots', async ({ page }) => {
  const errors = collectErrors(page);
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await seedStorage(page, '{"version":1,"profile":');

  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);

  expect(warnings.some((w) => w.startsWith('[save] stored save was unreadable'))).toBe(true);
  expect(errors).toEqual([]);
  // The bad entry is overwritten with a fresh save, so the next boot is quiet.
  // The fresh profile is given a generated name, never left blank (CO-165).
  const stored = JSON.parse((await readStorage(page)) ?? 'null') as Save;
  expect(stored.profile.name).toMatch(/^Player\d{9}$/);
  expect(stored).toEqual(withName(emptySave(), stored.profile.name));
});

test('a bought upgrade persists across a reload and changes the next run', async ({ page }) => {
  const errors = collectErrors(page);
  const funded: Save = { ...emptySave(), currency: 1000 };
  await seedStorage(page, JSON.stringify(funded));

  await page.goto('/?seed=1&timeScale=10');
  await openUpgrades(page);

  const bought = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(key) as UpgradesScene;
    return [scene.buy('upgrade_vigor'), scene.buy('upgrade_vigor')];
  }, SCENE.upgrades);
  expect(bought).toEqual([true, true]);

  const cost = vigor.baseCost + (vigor.baseCost + vigor.costStep);
  await expect.poll(() => readSave(page).then((s) => s.upgrades.upgrade_vigor)).toBe(2);
  expect((await readSave(page)).currency).toBe(1000 - cost);

  // Reload: the registry is gone, storage is all that is left.
  await page.reload();
  await openUpgrades(page);
  const reloaded = await readSave(page);
  expect(reloaded.upgrades).toEqual({ upgrade_vigor: 2 });
  expect(reloaded.currency).toBe(1000 - cost);

  // The next run starts with the upgraded max HP, before any level-up.
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(0);
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect
    .poll(() => readHud(page).then((hud) => hud.maxHp))
    .toBe(PLAYER_MAX_HP + 2 * vigor.amount);
  expect(errors).toEqual([]);
});

test('wiping progress leaves an empty save in storage, keeping the name', async ({ page }) => {
  const funded: Save = {
    ...withName(emptySave(), 'Test_Player'),
    currency: 500,
    upgrades: { upgrade_fleet: 1 },
  };
  funded.profile.runs = 3;
  await seedStorage(page, JSON.stringify(funded));

  await page.goto('/?seed=1');
  await openUpgrades(page);
  expect((await readSave(page)).profile.runs).toBe(3);

  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(key) as UpgradesScene).wipe();
  }, SCENE.upgrades);

  // A wipe clears progress, not who is playing (CO-165).
  const wiped = withName(emptySave(), 'Test_Player');
  await expect.poll(() => readSave(page)).toEqual(wiped);
  expect(JSON.parse((await readStorage(page)) ?? 'null')).toEqual(wiped);
});

/** Every text in a scene with its bounds, for the containment checks below. */
function textBoxes(
  page: Page,
  key: string,
): Promise<{ text: string; x: number; y: number; width: number; height: number }[]> {
  return page.evaluate(async (sceneKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene
      .getScene(sceneKey)
      .children.list.filter((child) => child.type === 'Text')
      .map((child) => {
        const { x, y, width, height } = (
          child as unknown as { getBounds(): Phaser.Geom.Rectangle }
        ).getBounds();
        return { text: (child as unknown as { text: string }).text, x, y, width, height };
      });
  }, key);
}

/** The balance line on Upgrades, with its bounds. */
async function balanceLabel(page: Page) {
  const boxes = await textBoxes(page, SCENE.upgrades);
  const label = boxes.find((box) => box.text.startsWith('Embers: '));
  if (!label) throw new Error('no Embers label on Upgrades');
  return label;
}

test.describe('a stored counter outside the ceiling (#316)', () => {
  test('1e308 resets the save, says so on Intro, and the balance reads 0', async ({ page }) => {
    const errors = collectErrors(page);
    await seedStorage(page, JSON.stringify({ ...emptySave(), currency: 1e308 }));

    await page.goto('/?seed=1');
    await waitForScene(page, SCENE.intro);
    expect(await sceneTexts(page, SCENE.intro)).toContain(SAVE_RESET_TEXT);

    await openUpgrades(page);
    expect((await balanceLabel(page)).text).toBe('Embers: 0');
    expect(errors).toEqual([]);
  });

  test('a balance exactly at the ceiling draws inside the screen', async ({ page }) => {
    await seedStorage(page, JSON.stringify({ ...emptySave(), currency: SAVE_COUNT_MAX }));

    await page.goto('/?seed=1');
    await openUpgrades(page);
    const label = await balanceLabel(page);
    expect(label.text).toBe('Embers: 1,000,000,000');
    expect(label.text.length).toBeLessThanOrEqual(30);
    expect(label.x).toBeGreaterThanOrEqual(8);
    expect(label.x + label.width).toBeLessThanOrEqual(960 - 8);
  });

  test('a stored -0 reads as 0', async ({ page }) => {
    const raw = JSON.stringify(emptySave()).replace('"currency":0', '"currency":-0');
    expect(raw).toContain('"currency":-0');
    await seedStorage(page, raw);

    await page.goto('/?seed=1');
    await openUpgrades(page);
    expect((await balanceLabel(page)).text).toBe('Embers: 0');
  });
});

/** Make every write to storage throw, as a full quota or a blocked store does. */
async function breakWrites(page: Page, alsoReads = false): Promise<void> {
  await page.addInitScript((reads) => {
    const quota = (): never => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    Storage.prototype.setItem = quota;
    if (reads) {
      Storage.prototype.getItem = (): never => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
    }
  }, alsoReads);
}

/** Click the pause screen's text button with this label, once it is drawn. */
async function clickPauseButton(page: Page, label: string): Promise<void> {
  const centre = (): Promise<{ x: number; y: number } | null> =>
    page.evaluate(
      async ([key, text]) => {
        const { game } = await import('/src/main.ts');
        const button = game.scene
          .getScene(key)
          .children.list.find(
            (child) =>
              child.type === 'Text' && (child as unknown as { text: string }).text === text,
          ) as unknown as { getCenter(): { x: number; y: number } } | undefined;
        return button ? button.getCenter() : null;
      },
      [SCENE.pause, label] as const,
    );
  await expect.poll(centre, { message: `pause button "${label}"` }).not.toBeNull();
  const at = await centre();
  if (!at) throw new Error(`pause button "${label}" vanished`);
  await page.mouse.click(at.x, at.y);
}

/** Start a run, let it bank a little, and End run from pause to reach Result. */
async function endRun(page: Page): Promise<void> {
  await page.goto('/?seed=1&invulnerable=1&timeScale=10');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(0);
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);
  await clickPauseButton(page, 'End run');
  await clickPauseButton(page, 'Yes');
  await waitForScene(page, SCENE.result);
}

test.describe('a browser that will not keep the save (#316)', () => {
  test('Intro and Result both say so, and the notice clears the hint', async ({ page }) => {
    const errors = collectErrors(page);
    await breakWrites(page);

    await page.goto('/?seed=1');
    await waitForScene(page, SCENE.intro);
    expect(await sceneTexts(page, SCENE.intro)).toContain(SAVE_FAILED_TEXT);

    await endRun(page);
    const boxes = await textBoxes(page, SCENE.result);
    const notice = boxes.find((box) => box.text === SAVE_FAILED_TEXT);
    expect(notice, 'the notice is on Result').toBeDefined();
    if (!notice) return;
    expect(notice.x).toBeGreaterThanOrEqual(8);
    expect(notice.x + notice.width).toBeLessThanOrEqual(960 - 8);
    expect(notice.y + notice.height).toBeLessThanOrEqual(540);
    const hint = boxes.find((box) => box.text.includes('Enter'));
    expect(hint, 'the hint is on Result').toBeDefined();
    if (hint) expect(notice.y).toBeGreaterThanOrEqual(hint.y + hint.height);
    expect(errors).toEqual([]);
  });

  test('blocked reads as well as writes still boot, with the line shown', async ({ page }) => {
    const errors = collectErrors(page);
    await breakWrites(page, true);

    await page.goto('/?seed=1');
    await waitForScene(page, SCENE.intro);
    expect(await sceneTexts(page, SCENE.intro)).toContain(SAVE_FAILED_TEXT);
    expect(errors).toEqual([]);
  });

  test('working storage shows no such line on Intro or Result', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/?seed=1');
    await waitForScene(page, SCENE.intro);
    expect(await sceneTexts(page, SCENE.intro)).not.toContain(SAVE_FAILED_TEXT);

    await endRun(page);
    expect(await sceneTexts(page, SCENE.result)).not.toContain(SAVE_FAILED_TEXT);
    expect(errors).toEqual([]);
  });
});

test('the Wipe progress row wipes on the second press, and leaving the screen disarms the first', async ({
  page,
}) => {
  const funded: Save = {
    ...withName(emptySave(), 'Test_Player'),
    currency: 500,
    upgrades: { upgrade_fleet: 1 },
  };
  funded.profile.runs = 3;
  await seedStorage(page, JSON.stringify(funded));
  await page.goto('/?seed=1');
  await openUpgrades(page);
  const stored = (): Promise<Save> =>
    readStorage(page).then((json) => JSON.parse(json ?? 'null') as Save);

  const expectRow = (label: string): Promise<void> =>
    expect
      .poll(async () => (await menuRows(page, SCENE.upgrades)).map((row) => row.label))
      .toContain(label);

  // First press: only the row changes.
  await clickRow(page, SCENE.upgrades, 'Wipe progress');
  await expectRow('Really wipe? Click again');
  expect(await readSave(page)).toEqual(funded);
  expect(await stored()).toEqual(funded);

  // The pointer moving off it does not disarm it; leaving the screen does.
  await page.mouse.move(5, 5);
  await expectRow('Really wipe? Click again');
  await clickRow(page, SCENE.upgrades, 'Back  (Esc)');
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('u');
  await waitForScene(page, SCENE.upgrades);
  await expectRow('Wipe progress');
  expect(await stored()).toEqual(funded);

  // Armed again, the second press wipes and keeps the name (CO-165).
  await clickRow(page, SCENE.upgrades, 'Wipe progress');
  await clickRow(page, SCENE.upgrades, 'Really wipe? Click again');
  const wiped = withName(emptySave(), 'Test_Player');
  await expect.poll(() => readSave(page)).toEqual(wiped);
  expect(await stored()).toEqual(wiped);
  // The scene restarts on the fresh save, so the row is unarmed again.
  await expectRow('Wipe progress');
});
