import { expect, test, type Page } from '@playwright/test';
import { MAX_SWITCH_LIST, MIN_TIME_SCALE } from '../src/core/runState';
import {
  ENEMIES_REGISTRY_KEY,
  LOADOUT_REGISTRY_KEY,
  SEED_REGISTRY_KEY,
  TIME_SCALE_REGISTRY_KEY,
  SCENE,
} from '../src/core/scenePayloads';
import { collectErrors, waitForScene } from './game';

/**
 * #316 on the dev server, where every test switch is live: the edge values a
 * hostile address bar can hand Boot come out clamped, de-duplicated and capped
 * in the registry the run reads. The parsers are `core/runState.test.ts`'s;
 * the deployed build's gate is `e2e-csp/prod.spec.ts`'s.
 */

/** What Boot left in the registry, read in one evaluate. */
function readSwitches(page: Page) {
  return page.evaluate(
    async (keys) => {
      const { game } = await import('/src/main.ts');
      return {
        seed: game.registry.get(keys.seed) as unknown,
        timeScale: game.registry.get(keys.timeScale) as unknown,
        loadout: game.registry.get(keys.loadout) as unknown,
        enemies: game.registry.get(keys.enemies) as unknown,
      };
    },
    {
      seed: SEED_REGISTRY_KEY,
      timeScale: TIME_SCALE_REGISTRY_KEY,
      loadout: LOADOUT_REGISTRY_KEY,
      enemies: ENEMIES_REGISTRY_KEY,
    },
  );
}

test('a timeScale near zero is held at the floor, not left to freeze the clock', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&timeScale=1e-320');
  await waitForScene(page, SCENE.intro);
  expect((await readSwitches(page)).timeScale).toBe(MIN_TIME_SCALE);
  expect(errors).toEqual([]);
});

test('repeated and excess loadout and enemy ids are dropped and capped', async ({ page }) => {
  const errors = collectErrors(page);
  const many = Array.from({ length: 200 }, () => 'fire,ice,lightning').join(',');
  await page.goto(`/?seed=1&loadout=fire,fire,${many}&enemies=tank,tank,ranged,tank`);
  await waitForScene(page, SCENE.intro);
  const { loadout, enemies } = await readSwitches(page);
  expect(loadout).toEqual(['fire', 'ice', 'lightning']);
  expect(enemies).toEqual(['tank', 'ranged']);
  expect((loadout as string[]).length).toBeLessThanOrEqual(MAX_SWITCH_LIST);
  expect(errors).toEqual([]);
});

test('hostile switch values never reach the registry as anything but clean ids', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const query = [
    'seed=%E2%80%AE5',
    'timeScale=NaN',
    'loadout=__proto__,constructor,prototype,toString,fire%00,%E2%80%AEfire,%EF%AC%81re',
    `enemies=${'x'.repeat(8_000)}`,
    'timeScale=30',
  ].join('&');
  await page.goto(`/?${query}`);
  await waitForScene(page, SCENE.intro);
  const { seed, timeScale, loadout, enemies } = await readSwitches(page);
  // A bidi-prefixed seed is no integer, so the seed is a fresh clock value.
  expect(Number.isInteger(seed)).toBe(true);
  expect(seed).not.toBe(5);
  expect(timeScale).toBe(1);
  expect(loadout).toEqual([]);
  expect(enemies).toEqual([]);
  expect(errors).toEqual([]);
});
