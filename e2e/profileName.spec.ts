import { expect, test, type Page } from '@playwright/test';
import { AUDIO_REGISTRY_KEY, SAVE_REGISTRY_KEY, SCENE } from '../src/core/scenePayloads';
import type { Save } from '../src/core/save';
import type { Audio } from '../src/render/audio';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import { collectErrors, sceneTexts, startFromIntro, waitForScene } from './game';

/**
 * The player name (CO-165): generated once on first launch and stored before
 * any run, given to a save from before names, shown on Profile and renamed
 * there through a real `<input>` with the keyboard, the mouse or a pad.
 * Fixtures use made-up names only.
 */

const GENERATED = /^Player\d{9}$/;

/** A save as a build before CO-165 wrote it: version 1, no name. Not built from `emptySave()`. */
const V1_SAVE = {
  version: 1,
  profile: {
    runs: 3,
    wins: 1,
    bestTimeMs: 125_000,
    bestLevel: 9,
    totalKills: 1500,
    spellCounts: { fire: 1, ice: 2 },
  },
  currency: 500,
  upgrades: { upgrade_vigor: 1 },
  settings: {},
};

/** Seed storage on an empty store only, so what the game writes survives a reload. */
async function seedStorage(page: Page, json: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: SAVE_STORAGE_KEY, value: json },
  );
}

/** The save in the registry and the one in storage, read in one evaluate. */
async function saves(page: Page): Promise<{ registry: Save; stored: Save | null }> {
  return page.evaluate(
    async ([registryKey, storageKey]) => {
      const { game } = await import('/src/main.ts');
      const json = localStorage.getItem(storageKey);
      return {
        registry: game.registry.get(registryKey) as Save,
        stored: json === null ? null : (JSON.parse(json) as Save),
      };
    },
    [SAVE_REGISTRY_KEY, SAVE_STORAGE_KEY] as const,
  );
}

async function openProfile(page: Page): Promise<void> {
  await waitForScene(page, SCENE.intro);
  await page.keyboard.press('ArrowUp'); // reveals Start
  await page.keyboard.press('ArrowUp'); // wraps to Help
  await page.keyboard.press('ArrowUp'); // Profile
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.profile);
}

/** Where the Profile scene draws the Rename (or, while editing, Save) button. */
async function renameButton(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const button = game.scene
      .getScene(key)
      .children.list.find(
        (child) =>
          child.type === 'Text' &&
          ['Rename', 'Save'].includes((child as unknown as { text: string }).text),
      ) as unknown as { x: number; y: number } | undefined;
    if (!button) throw new Error('no Rename button');
    return { x: button.x, y: button.y };
  }, SCENE.profile);
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

test('a first launch stores a generated name before any run, and a reload keeps it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);

  const first = await saves(page);
  expect(first.registry.profile.name).toMatch(GENERATED);
  expect(first.stored?.profile.name).toBe(first.registry.profile.name);

  await page.reload();
  await openProfile(page);
  const again = await saves(page);
  expect(again.registry.profile.name).toBe(first.registry.profile.name);
  const texts = await sceneTexts(page, SCENE.profile);
  expect(texts.slice(0, 2)).toEqual(['Profile', first.registry.profile.name]);
  expect(texts).toEqual(
    expect.arrayContaining(['No runs recorded yet.', 'Progress is saved in this browser only.']),
  );
  expect(errors).toEqual([]);
});

test('a version 1 save keeps every stat, Ember and upgrade, and is stored as version 2 with a name', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await seedStorage(page, JSON.stringify(V1_SAVE));
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);

  const { registry, stored } = await saves(page);
  expect(registry.profile.name).toMatch(GENERATED);
  const expected = {
    ...V1_SAVE,
    version: 2,
    profile: { ...V1_SAVE.profile, name: registry.profile.name },
  };
  expect(registry).toEqual(expected);
  expect(stored).toEqual(expected);

  await page.reload();
  await openProfile(page);
  expect((await saves(page)).stored).toEqual(expected);
  expect(await sceneTexts(page, SCENE.profile)).toEqual(
    expect.arrayContaining([registry.profile.name, 'Runs played', '3', '1,500']),
  );
  expect(errors).toEqual([]);
});

test('renaming with the keyboard: Enter saves, bad names are refused, Esc cancels and stays', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await openProfile(page);
  const generated = (await saves(page)).registry.profile.name;
  const field = page.getByLabel('Player name');
  await expect(field).toBeHidden();

  // The first arrow reveals the highlight on Rename; Enter opens the field on the current name.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(generated);

  // Refused: the old name stays and the message says why.
  for (const [typed, reason] of [
    ['bad-name!', 'Letters, numbers, spaces and underscores only.'],
    ['   ', "Name can't be empty."],
    ['x'.repeat(17), '16 characters at most.'],
  ] as const) {
    await field.fill(typed);
    await field.press('Enter');
    expect(await sceneTexts(page, SCENE.profile)).toContain(reason);
    await expect(field).toBeVisible();
    const now = await saves(page);
    expect([now.registry.profile.name, now.stored?.profile.name]).toEqual([generated, generated]);
  }

  // Esc closes the field without saving, and without leaving the screen.
  await field.press('Escape');
  await expect(field).toBeHidden();
  await frames(page, 4);
  expect(
    await page.evaluate(async (key) => {
      const { game } = await import('/src/main.ts');
      return game.scene.isActive(key);
    }, SCENE.profile),
  ).toBe(true);
  expect(await sceneTexts(page, SCENE.profile)).toContain(generated);

  // Accepted, trimmed and stored at once.
  await page.keyboard.press('Enter'); // the highlight is still on Rename
  await field.fill('  New_Name 1 ');
  await field.press('Enter');
  await expect(field).toBeHidden();
  const renamed = await saves(page);
  expect([renamed.registry.profile.name, renamed.stored?.profile.name]).toEqual([
    'New_Name 1',
    'New_Name 1',
  ]);
  expect(await sceneTexts(page, SCENE.profile)).toContain('New_Name 1');

  // With the field closed, Esc leaves as before.
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.intro);

  await page.reload();
  await openProfile(page);
  expect(await sceneTexts(page, SCENE.profile)).toContain('New_Name 1');
  expect(errors).toEqual([]);
});

test('the mouse reaches Rename and Save', async ({ page }) => {
  await page.goto('/?seed=1');
  await openProfile(page);
  const field = page.getByLabel('Player name');

  const rename = await renameButton(page);
  await page.mouse.click(rename.x, rename.y);
  await expect(field).toBeFocused();
  await field.fill('Mouse_Name');
  // A click on the canvas keeps the field's focus, so Save reads what was typed.
  const save = await renameButton(page);
  await page.mouse.click(save.x, save.y);
  await expect(field).toBeHidden();
  expect((await saves(page)).stored?.profile.name).toBe('Mouse_Name');
});

test('a gamepad reaches Rename, and its A saves', async ({ page }) => {
  // A fake standard-mapping pad, as in intro.spec.ts.
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
          pad.timestamp = performance.now();
        },
        [button, down] as const,
      );
      await frames(page, 4);
    }
  };
  const A = 0;
  const DOWN = 13;

  await page.goto('/?seed=1');
  await openProfile(page);
  await frames(page, 4); // the first poll after a connect only takes a baseline
  await press(DOWN); // reveals Rename
  await press(A);
  const field = page.getByLabel('Player name');
  await expect(field).toBeFocused();
  await field.fill('Pad_Name');
  await press(A);
  await expect(field).toBeHidden();
  expect((await saves(page)).stored?.profile.name).toBe('Pad_Name');
});

/** A payload that sets `window.pwned` if any of it ever runs as markup or script. */
const XSS = '"><img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';

/** Whether anything injected ran or landed in the page, read in one evaluate. */
async function injected(page: Page): Promise<{ pwned: boolean; imgs: number; scripts: number }> {
  return page.evaluate(() => ({
    pwned: (window as unknown as { pwned?: number }).pwned === 1,
    imgs: document.querySelectorAll('img').length,
    scripts: [...document.scripts].filter((s) => s.textContent?.includes('pwned')).length,
  }));
}

test('a markup name hand-edited into storage never reaches the page, and is replaced at boot', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const tampered = { ...V1_SAVE, version: 2, profile: { ...V1_SAVE.profile, name: XSS } };
  await seedStorage(page, JSON.stringify(tampered));
  await page.goto('/?seed=1');
  await openProfile(page);

  const { registry, stored } = await saves(page);
  expect(registry.profile.name).toMatch(GENERATED);
  expect(stored?.profile.name).toBe(registry.profile.name);
  expect(registry.profile.runs).toBe(V1_SAVE.profile.runs); // only the name is repaired
  expect(await sceneTexts(page, SCENE.profile)).not.toContain(XSS);
  expect(await injected(page)).toEqual({ pwned: false, imgs: 0, scripts: 0 });
  expect(errors).toEqual([]);
});

test('a markup, script or SQL name typed or pasted into the field is refused and never runs', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await openProfile(page);
  const before = (await saves(page)).registry.profile.name;
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const field = page.getByLabel('Player name');
  for (const payload of [XSS, "' OR 1=1 --", '${7*7}']) {
    await field.fill(payload);
    await field.press('Enter');
    await expect(field).toBeVisible();
    const now = await saves(page);
    expect([now.registry.profile.name, now.stored?.profile.name]).toEqual([before, before]);
  }
  expect(await injected(page)).toEqual({ pwned: false, imgs: 0, scripts: 0 });
  // The refusal message is one of the fixed reasons, never the typed text echoed back.
  expect(await sceneTexts(page, SCENE.profile)).toContain(
    'Letters, numbers, spaces and underscores only.',
  );
});

test('the field keeps its keys: captured letters type and M does not mute', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await openProfile(page);
  // Stand in for a finished run, which leaves these captured on `window` for the page.
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    game.scene.getScene(key).input.keyboard?.addCapture('W,A,S,D,SPACE,M');
  }, SCENE.profile);
  const mutedBefore = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.registry.get(key) as Audio).settings.muted;
  }, AUDIO_REGISTRY_KEY);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const field = page.getByLabel('Player name');
  await field.fill('');
  await field.pressSequentially('was d m');
  await expect(field).toHaveValue('was d m');
  const mutedAfter = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.registry.get(key) as Audio).settings.muted;
  }, AUDIO_REGISTRY_KEY);
  expect(mutedAfter).toBe(mutedBefore);

  await field.press('Enter');
  expect((await saves(page)).stored?.profile.name).toBe('was d m');
  expect(errors).toEqual([]);
});

test('a seeded run starts from the same seed with and without a profile, and the name is not drawn from it', async ({
  browser,
}) => {
  // The first level-up offer is no replay check: two loads of `?seed=` with no
  // profile at all drew different offers 1 time in 5 (spawns follow frame
  // timing). What the name must not touch is the seed the run is built from,
  // and the run's RNG, which Game creates from that seed alone.
  const start = async (stored: string | null) => {
    const page = await browser.newPage();
    try {
      if (stored !== null) await seedStorage(page, stored);
      await page.goto('/?seed=3&invulnerable=1');
      await startFromIntro(page);
      await waitForScene(page, SCENE.spellSelect);
      await page.keyboard.press('1');
      await waitForScene(page, SCENE.game);
      return await page.evaluate(
        async ([gameKey, saveKey]) => {
          const { game } = await import('/src/main.ts');
          const scene = game.scene.getScene(gameKey) as unknown as {
            payload: unknown;
            rng: { seed: number };
          };
          return {
            payload: scene.payload,
            rngSeed: scene.rng.seed,
            name: (game.registry.get(saveKey) as Save).profile.name,
          };
        },
        [SCENE.game, SAVE_REGISTRY_KEY] as const,
      );
    } finally {
      await page.close();
    }
  };
  // No upgrades (they change the run) and no runs played.
  const existing = JSON.stringify({
    ...V1_SAVE,
    profile: { ...V1_SAVE.profile, runs: 0 },
    upgrades: {},
    currency: 0,
  });
  const fresh = await start(null);
  const returning = await start(existing);
  const another = await start(null);
  expect(fresh.rngSeed).toBe(3);
  for (const run of [returning, another]) {
    expect({ payload: run.payload, rngSeed: run.rngSeed }).toEqual({
      payload: fresh.payload,
      rngSeed: fresh.rngSeed,
    });
  }
  // Same `?seed=`, different names: the name follows the clock, not the run seed.
  for (const run of [fresh, returning, another]) expect(run.name).toMatch(GENERATED);
  expect(new Set([fresh.name, returning.name, another.name]).size).toBe(3);
});
