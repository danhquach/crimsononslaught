import { expect, test, type Page } from '@playwright/test';
import { PLAYER_MAX_HP } from '../src/config/player';
import { upgradeById } from '../src/config/meta';
import { emptySave, type Save } from '../src/core/save';
import { SCENE } from '../src/core/scenePayloads';
import type { UpgradesScene } from '../src/scenes/UpgradesScene';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

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
  expect(JSON.parse((await readStorage(page)) ?? 'null')).toEqual(emptySave());
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

test('wiping progress leaves an empty save in storage', async ({ page }) => {
  const funded: Save = { ...emptySave(), currency: 500, upgrades: { upgrade_fleet: 1 } };
  funded.profile.runs = 3;
  await seedStorage(page, JSON.stringify(funded));

  await page.goto('/?seed=1');
  await openUpgrades(page);
  expect((await readSave(page)).profile.runs).toBe(3);

  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(key) as UpgradesScene).wipe();
  }, SCENE.upgrades);

  await expect.poll(() => readSave(page)).toEqual(emptySave());
  expect(JSON.parse((await readStorage(page)) ?? 'null')).toEqual(emptySave());
});
