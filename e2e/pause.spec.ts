import { expect, test, type Page } from '@playwright/test';
import { SPELL_CARDS, SPELL_IDS, type SpellId } from '../src/config/spells';
import type { PausePayload, ResultPayload } from '../src/core/scenePayloads';
import { SCENE } from '../src/core/scenePayloads';
import type { RunState } from '../src/core/runState';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import type { GameScene } from '../src/scenes/GameScene';
import type { PauseScene } from '../src/scenes/PauseScene';
import type { ResultScene } from '../src/scenes/ResultScene';
import { cardCenter, collectErrors, isSceneActive, startFromIntro, waitForScene } from './game';

/**
 * #252 in the browser: Esc or pad Start pauses the run under the pause screen,
 * which shows the build and offers Resume, Restart, End run and Main menu, the
 * last three behind a Yes / No. What the screen lists and which actions ask
 * are `core/pauseModel.test.ts`'s.
 */

const PICKED: SpellId = 'fire';
const TIME_SCALE = 10;

/** The Game scene's private parts these tests reach into. */
interface Inner {
  run: RunState;
  pendingLevelUps: number;
  drainLevelUps(): boolean;
}

async function startRun(page: Page): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1&timeScale=${TIME_SCALE}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

/** Let the page draw `n` frames. */
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

interface Snapshot {
  gamePaused: boolean;
  pause: PausePayload | null;
  levelUp: boolean;
  /** The HUD hides behind the pause screen and comes back after it. */
  hudVisible: boolean;
  elapsedMs: number;
  kills: number;
  level: number;
  spells: string[];
  /** Wall clock, for how far the run may move in the time since. */
  now: number;
}

/** Every value a check compares, read in one evaluate so the running game cannot move between them. */
async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const run = game.scene.getScene(scene.game) as GameScene;
    const inner = run as unknown as Inner;
    return {
      gamePaused: game.scene.isPaused(scene.game),
      pause: game.scene.isActive(scene.pause)
        ? (game.scene.getScene(scene.pause) as PauseScene).view
        : null,
      levelUp: game.scene.isActive(scene.levelUp),
      hudVisible: game.scene.getScene(scene.hud).sys.settings.visible,
      elapsedMs: inner.run.elapsedMs,
      kills: inner.run.kills,
      level: inner.run.level,
      spells: run.equippedSpellIds,
      now: performance.now(),
    };
  }, SCENE);
}

/** Click the pause screen's button with this label, where the scene drew it. */
async function clickButton(page: Page, label: string): Promise<void> {
  const at = await page.evaluate(
    async ([key, text]) => {
      const { game } = await import('/src/main.ts');
      const button = game.scene
        .getScene(key)
        .children.list.find(
          (child) => child.type === 'Text' && (child as unknown as { text: string }).text === text,
        ) as unknown as { getCenter(): { x: number; y: number } } | undefined;
      return button ? button.getCenter() : null;
    },
    [SCENE.pause, label] as const,
  );
  expect(at, `pause button "${label}"`).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
}

async function waitForPause(page: Page, confirm: PausePayload['confirm']): Promise<void> {
  await expect
    .poll(async () => {
      const { pause } = await snapshot(page);
      return pause === null ? 'closed' : (pause.confirm ?? 'menu');
    })
    .toBe(confirm ?? 'menu');
}

const readStoredSave = (page: Page): Promise<string | null> =>
  page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);

test('Esc pauses the whole run over the build, and Esc resumes it without a jump', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.waitForTimeout(1000);

  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
  const paused = await snapshot(page);
  expect(paused.gamePaused).toBe(true);
  expect(paused.hudVisible).toBe(false);
  expect(paused.pause?.view.level).toBe(paused.level);
  expect(paused.pause?.view.spells).toEqual([{ id: PICKED, name: SPELL_CARDS[PICKED].name }]);
  expect(paused.pause?.view.stats.kills).toBe(paused.kills);

  // Frozen: a second of wall time moves nothing (spec: enemies, spells,
  // cooldowns, the clock and pickups all run on the run clock).
  await page.waitForTimeout(1000);
  const later = await snapshot(page);
  expect(later.elapsedMs).toBe(paused.elapsedMs);
  expect(later.kills).toBe(paused.kills);

  // Esc again resumes, and the Esc that closed the screen does not open it again.
  const beforeResume = await snapshot(page);
  await page.keyboard.press('Escape');
  await frames(page, 10);
  const resumed = await snapshot(page);
  expect(resumed.pause).toBeNull();
  expect(resumed.gamePaused).toBe(false);
  expect(resumed.hudVisible).toBe(true);
  expect(resumed.elapsedMs).toBeGreaterThan(beforeResume.elapsedMs);
  // No catch-up: the clock moved about as far as the wall time since at this
  // scale (plus one capped frame of slack), not by the second spent paused.
  const allowed = (resumed.now - beforeResume.now) * TIME_SCALE + 1000;
  expect(resumed.elapsedMs - beforeResume.elapsedMs).toBeLessThan(allowed);
  expect(errors).toEqual([]);
});

test('Restart asks first, then starts the same spell again without banking the run', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.waitForTimeout(1500);
  const storedBefore = await readStoredSave(page);
  const listenersBefore = await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    return game.events.listenerCount('blur');
  });

  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
  await clickButton(page, 'Restart');
  await waitForPause(page, 'restart');
  // Declining goes back to the menu, still paused.
  await clickButton(page, 'No');
  await waitForPause(page, undefined);
  expect((await snapshot(page)).gamePaused).toBe(true);

  const before = await snapshot(page);
  await clickButton(page, 'Restart');
  await waitForPause(page, 'restart');
  await clickButton(page, 'Yes');
  await expect.poll(async () => (await snapshot(page)).elapsedMs < before.elapsedMs).toBe(true);
  const restarted = await snapshot(page);
  expect(restarted.pause).toBeNull();
  expect(restarted.gamePaused).toBe(false);
  expect(restarted.spells).toEqual([PICKED]);
  await waitForScene(page, SCENE.hud);
  expect(await readStoredSave(page)).toBe(storedBefore);

  // Nothing stacked: the restarted run holds as many focus listeners as the
  // first, and losing focus opens exactly one pause screen.
  const after = await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    const count = game.events.listenerCount('blur');
    game.events.emit('blur');
    return count;
  });
  expect(after).toBe(listenersBefore);
  await waitForPause(page, undefined);
  expect(errors).toEqual([]);
});

test('End run by keyboard goes to the results with the run banked once', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.waitForTimeout(1500);

  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
  // The first arrow wakes the highlight on Resume; two more reach End run.
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await waitForPause(page, 'end');
  // Enter with nothing highlighted is No.
  await page.keyboard.press('Enter');
  await waitForPause(page, undefined);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await waitForPause(page, 'end');
  await page.keyboard.press('ArrowLeft'); // wakes the highlight on Yes
  await page.keyboard.press('Enter');

  await waitForScene(page, SCENE.result);
  // The Enter that confirmed must not also press Play again.
  await frames(page, 10);
  expect(await isSceneActive(page, SCENE.result)).toBe(true);
  const read = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return {
      result: (game.scene.getScene(scene.result) as ResultScene).summary as ResultPayload,
      hud: game.scene.isActive(scene.hud),
      pause: game.scene.isActive(scene.pause),
    };
  }, SCENE);
  expect(read.result.outcome).toBe('ended');
  expect(read.result.stats.timeSurvivedMs).toBeGreaterThan(0);
  expect(read.hud).toBe(false);
  expect(read.pause).toBe(false);
  const stored = JSON.parse((await readStoredSave(page)) ?? '{}') as {
    currency: number;
    profile: { runs: number; wins: number };
  };
  expect(stored.profile.runs).toBe(1);
  expect(stored.profile.wins).toBe(0);
  expect(stored.currency).toBe(read.result.earned);
  expect(errors).toEqual([]);
});

test('Esc does nothing under the level-up overlay', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(key) as unknown as Inner).pendingLevelUps += 1;
  }, SCENE.game);
  await waitForScene(page, SCENE.levelUp);

  await page.keyboard.press('Escape');
  await frames(page, 10);
  const read = await snapshot(page);
  expect(read.levelUp).toBe(true);
  expect(read.pause).toBeNull();
  expect(errors).toEqual([]);
});

test('losing focus on the frame a level-up is queued leaves only the level-up', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  // Phaser pauses Game and launches an overlay on its next step, so the blur
  // lands while Game still reads as running.
  const opened = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const inner = game.scene.getScene(key) as unknown as Inner;
    inner.pendingLevelUps += 1;
    const levelUp = inner.drainLevelUps();
    game.events.emit('blur');
    return levelUp;
  }, SCENE.game);
  expect(opened).toBe(true);
  await waitForScene(page, SCENE.levelUp);
  await frames(page, 10);
  const read = await snapshot(page);
  expect(read.levelUp).toBe(true);
  expect(read.pause).toBeNull();
  expect(errors).toEqual([]);
});

test('a gamepad pauses with Start, resumes with Start, and leaves for the main menu', async ({
  page,
}) => {
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
  const START = 9;
  const RIGHT = 15;

  const errors = collectErrors(page);
  await startRun(page);
  await frames(page, 4); // the first poll after a connect only takes a baseline
  const storedBefore = await readStoredSave(page);

  await press(START);
  await waitForPause(page, undefined);
  await press(START);
  await expect.poll(async () => (await snapshot(page)).gamePaused).toBe(false);
  await frames(page, 4);
  expect((await snapshot(page)).pause).toBeNull();

  await press(START);
  await waitForPause(page, undefined);
  await frames(page, 4);
  await press(RIGHT); // wakes the highlight on Resume
  for (let i = 0; i < 3; i += 1) await press(RIGHT); // to Main menu
  await press(A);
  await waitForPause(page, 'menu');
  await frames(page, 4);
  await press(RIGHT); // wakes the highlight on Yes
  await press(A);

  await waitForScene(page, SCENE.intro);
  await frames(page, 10);
  const read = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return {
      intro: game.scene.isActive(scene.intro),
      game: game.scene.isActive(scene.game) || game.scene.isPaused(scene.game),
      hud: game.scene.isActive(scene.hud),
      pause: game.scene.isActive(scene.pause),
    };
  }, SCENE);
  expect(read).toEqual({ intro: true, game: false, hud: false, pause: false });
  // Abandoned: nothing recorded, nothing banked.
  expect(await readStoredSave(page)).toBe(storedBefore);
  expect(errors).toEqual([]);
});
