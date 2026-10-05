import { expect, test, type Page } from '@playwright/test';
import {
  ACTION_LABEL,
  CONTROL_ACTIONS,
  DEFAULT_KEYS,
  DEFAULT_PAD,
  type ControlAction,
  type ControlDevice,
} from '../src/config/controls';
import { SPELL_IDS } from '../src/config/spells';
import {
  bindingLabel,
  defaultControls,
  rebind,
  writeControls,
  type Controls,
} from '../src/core/controls';
import { emptySave, type Save } from '../src/core/save';
import { SAVE_REGISTRY_KEY, SCENE } from '../src/core/scenePayloads';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { SettingsScene } from '../src/scenes/SettingsScene';
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
 * CO-226 in the browser: the Controls page rebinds every action on the keyboard
 * and on a controller, swaps a clash and says so, saves at once and live, and
 * asks Yes or No before a reset. The rules (allow-lists, swaps, reserved
 * inputs, hostile values) are `core/controls.test.ts`'s; this drives the real
 * scenes: the hero moves on the new key, the labels name the new bindings, and
 * a waiting rebind swallows the very press it waits for.
 */

const ISOLATED = '&enemies=ranged&invulnerable=1';
const CONTROLS_ROW = 'Controls  ▸';

/** Put `json` in storage before the page's own scripts run; only seeds an empty store, so a reload keeps what the game wrote. */
async function seedStorage(page: Page, json: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: SAVE_STORAGE_KEY, value: json },
  );
}

function saveWith(settings: Save['settings']): string {
  return JSON.stringify({ ...emptySave(), settings });
}

function saveWithControls(controls: Controls): string {
  return saveWith(writeControls({}, controls));
}

/** `controls` with these keyboard rebinds applied; a refused one fails the test. */
function withKeys(...pairs: readonly (readonly [ControlAction, string])[]): Controls {
  let controls = defaultControls();
  for (const [action, key] of pairs) {
    const result = rebind(controls, 'keyboard', action, key);
    if (!result.ok) throw new Error(result.note);
    controls = result.controls;
  }
  return controls;
}

function rowText(
  action: ControlAction,
  device: ControlDevice,
  controls = defaultControls(),
): string {
  return `${ACTION_LABEL[action]}: ${bindingLabel(controls, device, action)}`;
}

async function toSettings(page: Page): Promise<void> {
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForScene(page, SCENE.settings);
}

async function toControls(page: Page, device: ControlDevice = 'keyboard'): Promise<void> {
  await toSettings(page);
  await clickRow(page, SCENE.settings, CONTROLS_ROW);
  await waitForControls(page, device);
}

async function waitForControls(page: Page, device: ControlDevice): Promise<void> {
  await expect
    .poll(async () => (await isSceneActive(page, SCENE.settings)) && (await report(page)).device, {
      message: 'the Controls page is open',
    })
    .toBe(device);
  // The page's own rows, not the main page's.
  await expect
    .poll(async () => (await labels(page)).some((label) => label.startsWith('Move up:')))
    .toBe(true);
}

/** Open the Controls page from a running game's pause screen. */
async function labels(page: Page): Promise<string[]> {
  return (await menuRows(page, SCENE.settings)).map((row) => row.label);
}

interface Report {
  device: ControlDevice;
  waiting: ControlAction | null;
  note: string;
  confirm: string | null;
}

function report(page: Page): Promise<Report> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as SettingsScene).controlsReport;
  }, SCENE.settings);
}

/** What the page has saved: the stored JSON's settings, and the registry's, read together. */
function savedSettings(page: Page): Promise<{ stored: Save['settings']; live: Save['settings'] }> {
  return page.evaluate(
    async ([storageKey, registryKey]) => {
      const { game } = await import('/src/main.ts');
      const raw = localStorage.getItem(storageKey as string);
      const stored = raw ? (JSON.parse(raw) as Save).settings : {};
      const live = (game.registry.get(registryKey as string) as Save | undefined)?.settings ?? {};
      return { stored, live };
    },
    [SAVE_STORAGE_KEY, SAVE_REGISTRY_KEY] as const,
  );
}

/** Click an action's row and press the new key, once the page shows it waiting. */
async function rebindKey(
  page: Page,
  action: ControlAction,
  from: string,
  key: string,
): Promise<void> {
  await clickRow(page, SCENE.settings, `${ACTION_LABEL[action]}: ${from}`);
  await expect.poll(async () => (await report(page)).waiting).toBe(action);
  await page.keyboard.press(key);
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
}

async function startRun(page: Page): Promise<void> {
  await page.goto(`/?seed=1${ISOLATED}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

function heroPosition(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(key) as unknown as { player: { x: number; y: number } };
    return { x: scene.player.x, y: scene.player.y };
  }, SCENE.game);
}

/** Hold `key` for some frames and report how far the hero went. */
async function holdAndMove(page: Page, key: string): Promise<{ dx: number; dy: number }> {
  const before = await heroPosition(page);
  await page.keyboard.down(key);
  await frames(page, 30);
  await page.keyboard.up(key);
  const after = await heroPosition(page);
  return { dx: after.x - before.x, dy: after.y - before.y };
}

function mutedNow(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    const { audioOf } = await import('/src/render/audio.ts');
    return audioOf(game.scene.getScene('Boot')).settings.muted;
  });
}

test('both tabs list every action with its default binding', async ({ page }) => {
  const errors = collectErrors(page);
  await toControls(page);
  let rows = await labels(page);
  for (const action of CONTROL_ACTIONS) expect(rows).toContain(rowText(action, 'keyboard'));
  expect(rows).toEqual(
    expect.arrayContaining(['Keyboard', 'Controller', 'Reset all', 'Back  (Esc)']),
  );
  expect(rows).toContain('Reset keyboard to default');

  await clickRow(page, SCENE.settings, 'Controller');
  await waitForControls(page, 'pad');
  rows = await labels(page);
  for (const action of CONTROL_ACTIONS) expect(rows).toContain(rowText(action, 'pad'));
  expect(rows).toContain('Reset controller to default');
  expect(errors).toEqual([]);
});

test('the main page has a Controls row that opens the page and Back returns to it', async ({
  page,
}) => {
  await toSettings(page);
  const rows = await menuRows(page, SCENE.settings);
  const controls = rows.find((row) => row.label === CONTROLS_ROW);
  expect(controls, 'the Controls row').toBeTruthy();
  const back = rows.find((row) => row.label === 'Back  (Esc)');
  // Under the Minimap panel in the right column, above Back.
  expect(controls!.bounds.y + controls!.bounds.height).toBeLessThanOrEqual(back!.bounds.y);
  expect(controls!.bounds.x).toBeGreaterThan(480);

  await clickRow(page, SCENE.settings, CONTROLS_ROW);
  await waitForControls(page, 'keyboard');
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await expect.poll(async () => (await labels(page)).includes(CONTROLS_ROW)).toBe(true);
  expect(
    (await menuRows(page, SCENE.settings)).find((r) => r.label === CONTROLS_ROW)?.selected,
  ).toBe(true);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.intro);
});

test('a rebind moves the hero on the new key, is stored at once and survives a reload', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await toControls(page);
  await rebindKey(page, 'moveUp', 'W', 'KeyI');
  expect(await labels(page)).toContain('Move up: I');
  expect((await report(page)).note).toBe('');

  const { stored, live } = await savedSettings(page);
  expect(stored['controls.key.moveUp']).toBe('KeyI');
  expect(live['controls.key.moveUp']).toBe('KeyI');

  await page.reload();
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForScene(page, SCENE.settings);
  await clickRow(page, SCENE.settings, CONTROLS_ROW);
  await waitForControls(page, 'keyboard');
  expect(await labels(page)).toContain('Move up: I');

  await startRun(page);
  await frames(page, 10);
  const onI = await holdAndMove(page, 'KeyI');
  expect(onI.dy, 'I moves the hero up').toBeLessThan(-20);
  const onW = await holdAndMove(page, 'KeyW');
  expect(onW.dy, 'W no longer does').toBeGreaterThan(-5);
  const arrow = await holdAndMove(page, 'ArrowDown');
  expect(arrow.dy, 'the arrows stay fixed').toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('binding a key another action holds swaps the two and a note says what moved', async ({
  page,
}) => {
  await toControls(page);
  await rebindKey(page, 'moveUp', 'W', 'KeyS');
  const rows = await labels(page);
  expect(rows).toContain('Move up: S');
  expect(rows).toContain('Move down: W');
  expect((await report(page)).note).toBe('Move down moved to W');
  expect(await sceneTexts(page, SCENE.settings)).toContain('Move down moved to W');

  // Another context keeps its own key: Skip also holds S and was left alone.
  expect(rows).toContain('Skip: S');
  await rebindKey(page, 'reroll', 'R', 'KeyW');
  expect(await labels(page)).toContain('Reroll: W');
  expect(await labels(page)).toContain('Move down: W');
  expect((await report(page)).note).toBe('');
});

test('Esc cancels a waiting rebind without leaving, a refusal says why, and Enter that confirmed a row is not a key', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await toControls(page);

  await clickRow(page, SCENE.settings, 'Move up: W');
  await expect.poll(async () => (await report(page)).waiting).toBe('moveUp');
  expect(await labels(page)).toContain('Move up: press a key…');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect(await isSceneActive(page, SCENE.settings)).toBe(true);
  expect((await report(page)).device).toBe('keyboard');
  expect(await labels(page)).toContain('Move up: W');

  // Refusals: an arrow, a key the menus keep, a key the browser keeps.
  await clickRow(page, SCENE.settings, 'Move up: W');
  await expect.poll(async () => (await report(page)).waiting).toBe('moveUp');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect((await report(page)).note).toBe('Arrow keys are fixed for movement and menus.');
  expect(await labels(page)).toContain('Move up: W');

  await clickRow(page, SCENE.settings, 'Mute: M');
  await expect.poll(async () => (await report(page)).waiting).toBe('mute');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect((await report(page)).note).toBe('Enter is kept for the menus.');
  expect(await labels(page)).toContain('Mute: M');

  await clickRow(page, SCENE.settings, 'Mute: M');
  await expect.poll(async () => (await report(page)).waiting).toBe('mute');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect((await report(page)).note).toBe('That cannot be used.');

  // Pause may take Esc back only through a reset or a swap, and Esc cancels, so nothing took it here.
  const saved = await savedSettings(page);
  expect(Object.keys(saved.stored).filter((k) => k.startsWith('controls.'))).toEqual([]);

  // Enter that picks the row with the keyboard does not also bind: the key after it does.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const rows = await menuRows(page, SCENE.settings);
  expect(rows.find((row) => row.selected)?.label).toBe('Move up: W');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await report(page)).waiting).toBe('moveUp');
  await frames(page, 6);
  expect((await report(page)).waiting, 'the Enter was not taken as the binding').toBe('moveUp');
  expect(await labels(page)).toContain('Move up: press a key…');
  await page.keyboard.press('KeyI');
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect(await labels(page)).toContain('Move up: I');

  // With nothing waiting, Esc goes back as before.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await labels(page)).includes(CONTROLS_ROW)).toBe(true);
  expect(errors).toEqual([]);
});

test('a rebind that is waiting swallows the press, so M does not mute while it is bound', async ({
  page,
}) => {
  await toControls(page);
  expect(await mutedNow(page)).toBe(false);
  await rebindKey(page, 'mute', 'M', 'KeyM'); // the same key: a no-op, and no mute
  expect(await mutedNow(page)).toBe(false);
  await rebindKey(page, 'mute', 'M', 'KeyN');
  expect(await mutedNow(page)).toBe(false);
  expect(await labels(page)).toContain('Mute: N');

  await page.keyboard.press('KeyM');
  await frames(page, 4);
  expect(await mutedNow(page), 'M is free now').toBe(false);
  await page.keyboard.press('KeyN');
  await expect.poll(() => mutedNow(page)).toBe(true);
  await page.keyboard.press('KeyN');
  await expect.poll(() => mutedNow(page)).toBe(false);
});

test('a saved mute key and mute button work from the first screen', async ({ page }) => {
  await addFakePad(page);
  await seedStorage(page, saveWithControls(withKeys(['mute', 'KeyN'])));
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await frames(page, 6);
  await page.keyboard.press('KeyM');
  await frames(page, 4);
  expect(await mutedNow(page)).toBe(false);
  await page.keyboard.press('KeyN');
  await expect.poll(() => mutedNow(page)).toBe(true);
  // Pad Back is the default mute button.
  await padPress(page, PAD.BACK);
  await expect.poll(() => mutedNow(page)).toBe(false);
});

test('a controller dash button can be rebound and takes effect in the run', async ({ page }) => {
  const errors = collectErrors(page);
  await addFakePad(page);
  await toControls(page);
  await clickRow(page, SCENE.settings, 'Controller');
  await waitForControls(page, 'pad');
  await frames(page, 6);
  await clickRow(page, SCENE.settings, 'Dash: A');
  await expect.poll(async () => (await report(page)).waiting).toBe('dash');
  expect(await labels(page)).toContain('Dash: press a button…');
  await frames(page, 6);
  await padPress(page, PAD.RT);
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect(await labels(page)).toContain('Dash: RT');
  expect((await savedSettings(page)).stored['controls.pad.dash']).toBe(PAD.RT);

  await startRun(page);
  await frames(page, 10);
  const dashState = (): Promise<string> =>
    page.evaluate(async (key) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key) as unknown as {
        player: { dashReport: { state: string } };
      };
      return scene.player.dashReport.state;
    }, SCENE.game);
  await padPress(page, PAD.A);
  expect(await dashState(), 'A no longer dashes').toBe('ready');
  await padPress(page, PAD.RT);
  await expect.poll(dashState).not.toBe('ready');
  expect(errors).toEqual([]);
});

test('B cancels a waiting controller rebind, a bound Start never leaves the page mid-capture', async ({
  page,
}) => {
  await addFakePad(page);
  await toControls(page);
  await clickRow(page, SCENE.settings, 'Controller');
  await waitForControls(page, 'pad');
  await frames(page, 6);

  await clickRow(page, SCENE.settings, 'Dash: A');
  await expect.poll(async () => (await report(page)).waiting).toBe('dash');
  await frames(page, 6);
  await padPress(page, PAD.B);
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect(await isSceneActive(page, SCENE.settings)).toBe(true);
  expect((await report(page)).device).toBe('pad');
  expect(await labels(page)).toContain('Dash: A');

  // Start is the pause button; while a rebind waits it is a candidate, not a way out.
  await clickRow(page, SCENE.settings, 'Dash: A');
  await expect.poll(async () => (await report(page)).waiting).toBe('dash');
  await frames(page, 6);
  await padPress(page, PAD.START);
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect(await isSceneActive(page, SCENE.settings)).toBe(true);
  expect((await report(page)).device).toBe('pad');
  const rows = await labels(page);
  expect(rows).toContain('Dash: Start');
  expect(rows).toContain('Pause: A');
  expect((await report(page)).note).toBe('Pause moved to A');

  // A menu action may not take a button the menus keep.
  await clickRow(page, SCENE.settings, 'Mute: Back');
  await expect.poll(async () => (await report(page)).waiting).toBe('mute');
  await frames(page, 6);
  await padPress(page, PAD.A);
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect((await report(page)).note).toBe('A is kept for the menus.');
  expect(await labels(page)).toContain('Mute: Back');
});

test('the Controls page can be used with a controller alone', async ({ page }) => {
  const errors = collectErrors(page);
  await addFakePad(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await frames(page, 6);
  await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    game.scene.getScene('Intro').scene.start('Settings', { page: 'controls', device: 'pad' });
  });
  await waitForControls(page, 'pad');
  await frames(page, 6);

  // Down wakes the highlight on the Keyboard tab, then the Controller tab, then Move up.
  await padPress(page, PAD.DOWN);
  await padPress(page, PAD.DOWN);
  await padPress(page, PAD.DOWN);
  expect((await menuRows(page, SCENE.settings)).find((r) => r.selected)?.label).toBe(
    'Move up: D-pad up',
  );
  await padPress(page, PAD.A);
  await expect.poll(async () => (await report(page)).waiting).toBe('moveUp');
  // The A that picked the row is not the binding.
  await frames(page, 8);
  expect((await report(page)).waiting).toBe('moveUp');
  await padPress(page, PAD.RT);
  await expect.poll(async () => (await report(page)).waiting).toBeNull();
  expect(await labels(page)).toContain('Move up: RT');

  // Reset the device by pad: Yes / No with No the default.
  await clickRowByPad(page, 'Reset controller to default');
  await expect.poll(async () => (await report(page)).confirm).toBe('pad');
  await frames(page, 6);
  await padPress(page, PAD.A); // nothing highlighted: it only lights Yes, never confirms it
  expect((await report(page)).confirm).toBe('pad');
  await padPress(page, PAD.B); // No
  await expect.poll(async () => (await report(page)).confirm).toBeNull();
  await frames(page, 6);
  expect(await labels(page)).toContain('Move up: RT');

  // Back out with B: Controls, then Settings.
  await padPress(page, PAD.B);
  await expect.poll(async () => (await labels(page)).includes(CONTROLS_ROW)).toBe(true);
  expect(errors).toEqual([]);
});

/** Walk the pad's highlight to the row with this label, one D-pad press at a time. */
async function clickRowByPad(page: Page, label: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const rows = await menuRows(page, SCENE.settings);
    const at = rows.findIndex((r) => r.selected);
    if (at >= 0 && rows[at]?.label === label) break;
    await padPress(page, PAD.DOWN);
  }
  expect((await menuRows(page, SCENE.settings)).find((r) => r.selected)?.label).toBe(label);
  await padPress(page, PAD.A);
}

test('each reset asks Yes or No first, and No, Esc and Enter with nothing lit all leave bindings alone', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await toControls(page);
  await rebindKey(page, 'moveUp', 'W', 'KeyI');

  // No
  await clickRow(page, SCENE.settings, 'Reset keyboard to default');
  await expect.poll(async () => (await report(page)).confirm).toBe('keyboard');
  const texts = await sceneTexts(page, SCENE.settings);
  expect(texts).toContain('Reset keyboard controls?');
  expect(texts).toEqual(expect.arrayContaining(['Yes', 'No']));
  await clickRow(page, SCENE.settings, 'No');
  await waitForControls(page, 'keyboard');
  expect(await labels(page)).toContain('Move up: I');

  // Esc is No
  await clickRow(page, SCENE.settings, 'Reset keyboard to default');
  await expect.poll(async () => (await report(page)).confirm).toBe('keyboard');
  await page.keyboard.press('Escape');
  await waitForControls(page, 'keyboard');
  expect(await labels(page)).toContain('Move up: I');

  // Enter with nothing lit is No
  await clickRow(page, SCENE.settings, 'Reset all');
  await expect.poll(async () => (await report(page)).confirm).toBe('all');
  expect(await sceneTexts(page, SCENE.settings)).toContain('Reset all controls?');
  await frames(page, 4);
  await page.keyboard.press('Enter');
  await waitForControls(page, 'keyboard');
  expect(await labels(page)).toContain('Move up: I');

  // Yes
  await clickRow(page, SCENE.settings, 'Reset keyboard to default');
  await expect.poll(async () => (await report(page)).confirm).toBe('keyboard');
  await clickRow(page, SCENE.settings, 'Yes');
  await waitForControls(page, 'keyboard');
  expect(await labels(page)).toContain('Move up: W');
  expect((await report(page)).note).toBe('Keyboard controls reset to default.');
  const { stored } = await savedSettings(page);
  expect(stored['controls.key.moveUp']).toBe('KeyW');
  expect(errors).toEqual([]);
});

test('Reset all puts both devices back, and Reset device leaves the other alone', async ({
  page,
}) => {
  const first = rebind(defaultControls(), 'keyboard', 'moveUp', 'KeyI');
  const second = first.ok ? rebind(first.controls, 'pad', 'dash', 7) : first;
  if (!second.ok) throw new Error(second.note);
  await seedStorage(page, saveWithControls(second.controls));
  await toControls(page);
  expect(await labels(page)).toContain('Move up: I');

  // Resetting the keyboard keeps the controller's binding.
  await clickRow(page, SCENE.settings, 'Reset keyboard to default');
  await expect.poll(async () => (await report(page)).confirm).toBe('keyboard');
  await clickRow(page, SCENE.settings, 'Yes');
  await waitForControls(page, 'keyboard');
  expect(await labels(page)).toContain('Move up: W');
  await clickRow(page, SCENE.settings, 'Controller');
  await waitForControls(page, 'pad');
  expect(await labels(page)).toContain('Dash: RT');

  await clickRow(page, SCENE.settings, 'Reset all');
  await expect.poll(async () => (await report(page)).confirm).toBe('all');
  await clickRow(page, SCENE.settings, 'Yes');
  await waitForControls(page, 'pad');
  expect(await labels(page)).toContain('Dash: A');
  expect((await report(page)).note).toBe('All controls reset to default.');
  const { stored } = await savedSettings(page);
  for (const action of CONTROL_ACTIONS) {
    expect(stored[`controls.key.${action}`]).toBe(DEFAULT_KEYS[action]);
    expect(stored[`controls.pad.${action}`]).toBe(DEFAULT_PAD[action]);
  }
});

test('rebinding from the pause screen takes effect when the run resumes, with no reload', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await frames(page, 10);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);
  await clickRow(page, SCENE.pause, 'Settings');
  await waitForScene(page, SCENE.settings);
  await clickRow(page, SCENE.settings, CONTROLS_ROW);
  await waitForControls(page, 'keyboard');
  await rebindKey(page, 'moveUp', 'W', 'KeyI');
  await rebindKey(page, 'pause', 'Esc', 'KeyP');
  expect(await labels(page)).toContain('Pause: P');

  await clickRow(page, SCENE.settings, 'Back  (Esc)'); // to Settings
  await expect.poll(async () => (await labels(page)).includes(CONTROLS_ROW)).toBe(true);
  await page.keyboard.press('Escape'); // to Pause
  await waitForScene(page, SCENE.pause);
  // The pause screen names the new key, and Esc still backs out of it.
  expect(await sceneTexts(page, SCENE.pause)).toContain('Esc, P, Start or B to resume');
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.game);
  await frames(page, 10);

  const onI = await holdAndMove(page, 'KeyI');
  expect(onI.dy, 'the new key moves the hero without a reload').toBeLessThan(-20);
  // The old pause key does nothing; the new one opens the pause screen.
  await page.keyboard.press('Escape');
  await frames(page, 10);
  expect(await isSceneActive(page, SCENE.pause)).toBe(false);
  await page.keyboard.press('KeyP');
  await waitForScene(page, SCENE.pause);
  // The bound key resumes too.
  await page.keyboard.press('KeyP');
  await waitForScene(page, SCENE.game);
  expect(errors).toEqual([]);
});

test('hints and labels name the rebound keys and buttons on the level-up and Help screens', async ({
  page,
}) => {
  const errors = collectErrors(page);
  let controls = withKeys(['reroll', 'KeyX'], ['ban', 'KeyV'], ['helpNext', 'KeyP']);
  const padResult = rebind(controls, 'pad', 'reroll', PAD.RT);
  if (!padResult.ok) throw new Error(padResult.note);
  controls = padResult.controls;
  await seedStorage(page, saveWithControls(controls));
  await startRun(page);

  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(key) as unknown as { pendingLevelUps: number }).pendingLevelUps += 1;
  }, SCENE.game);
  await waitForScene(page, SCENE.levelUp);
  await frames(page, 4);
  const texts = await sceneTexts(page, SCENE.levelUp);
  expect(texts.some((t) => t.includes('use a gamepad (RT reroll, RB skip, Y ban)'))).toBe(true);
  // The badges on the buttons.
  expect(texts).toEqual(expect.arrayContaining(['X', 'S', 'V']));
  expect(texts).not.toContain('R');
  expect(texts).not.toContain('B');

  const rerolls = (): Promise<number | undefined> =>
    page.evaluate(async (key) => {
      const { game } = await import('/src/main.ts');
      return (game.scene.getScene(key) as unknown as LevelUpScene).view.actions?.rerolls;
    }, SCENE.levelUp);
  const before = await rerolls();
  await page.keyboard.press('KeyR'); // the old key does nothing
  await frames(page, 6);
  expect(await rerolls()).toBe(before);
  await page.keyboard.press('KeyX');
  await expect.poll(rerolls).toBe((before ?? 0) - 1);
  // Pick a card to get back to the run.
  await page.keyboard.press('Digit1');
  await waitForScene(page, SCENE.game);

  // Help: the Controls tab and the hint line.
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Help');
  await waitForScene(page, SCENE.help);
  await clickRow(page, SCENE.help, 'Controls');
  await expect
    .poll(async () => (await sceneTexts(page, SCENE.help)).some((t) => t.includes('X reroll')))
    .toBe(true);
  const help = await sceneTexts(page, SCENE.help);
  expect(help).toEqual(
    expect.arrayContaining(['X reroll, S skip, V ban', 'RT reroll, RB skip, Y ban', 'Q / P']),
  );
  expect(help.some((t) => t.includes('Q/P tabs'))).toBe(true);
  // The bound tab key walks the tabs.
  await page.keyboard.press('KeyP');
  await expect
    .poll(async () =>
      page.evaluate(async (key) => {
        const { game } = await import('/src/main.ts');
        return (game.scene.getScene(key) as unknown as { view: string }).view;
      }, SCENE.help),
    )
    .toBe('about');
  expect(errors).toEqual([]);
});

const HOSTILE: { name: string; json: string }[] = [
  {
    name: 'unknown keys and look-alikes',
    json: saveWith({
      'controls.key.moveUp': 'Tab',
      'controls.key.moveDown': 'KeyS​',
      'controls.key.evil': 'KeyI',
      'controls.key.оveUp': 'KeyI',
      'controls.pad.dash': 99,
      'controls.pad.pause': '9',
      'controls.mouse.dash': 'KeyI',
      'controls.key.constructor': 'KeyI',
    }),
  },
  {
    name: 'a clash and a reserved key on a menu action',
    json: saveWith({ 'controls.key.moveUp': 'KeyD', 'controls.key.mute': 'Escape' }),
  },
  {
    name: 'wrong types and a huge string',
    json: saveWith({
      'controls.key.dash': true,
      'controls.key.pause': 7,
      'controls.key.mute': 'x'.repeat(200_000),
      'controls.pad.ban': 1.5,
      'controls.pad.skip': -1,
    }),
  },
  {
    name: 'a __proto__ object',
    json: JSON.stringify({
      ...emptySave(),
      settings: JSON.parse('{"__proto__":{"controls.key.moveUp":"KeyI"}}'),
    }),
  },
];

for (const { name, json } of HOSTILE) {
  test(`a hostile save (${name}) runs on the defaults and loses its unknown keys`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedStorage(page, json);
    await toControls(page);
    const rows = await labels(page);
    for (const action of CONTROL_ACTIONS) expect(rows).toContain(rowText(action, 'keyboard'));
    const { live } = await savedSettings(page);
    const allowed = new Set(
      CONTROL_ACTIONS.flatMap((action) => [`controls.key.${action}`, `controls.pad.${action}`]),
    );
    for (const key of Object.keys(live).filter((k) => k.startsWith('controls.'))) {
      expect(allowed.has(key), key).toBe(true);
    }
    expect(
      await page.evaluate(() => Reflect.get(Object.prototype, 'controls.key.moveUp') as unknown),
    ).toBeUndefined();
    await startRun(page);
    const onW = await holdAndMove(page, 'KeyW');
    expect(onW.dy, 'W still moves the hero up').toBeLessThan(-20);
    expect(errors.filter((text) => !text.includes('Failed to load resource'))).toEqual([]);
  });
}
