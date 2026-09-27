import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { PAUSE_EVENT, type PauseChoosePayload } from '../src/core/pauseModel';
import { SCENE } from '../src/core/scenePayloads';
import type { RunState } from '../src/core/runState';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #273 in the browser: while a run is live, leaving the page asks first, so an
 * accidental reload cannot drop a run that is only saved on Result. The guard
 * is Game's own `beforeunload` listener; every way out of the run drops it.
 */

const PICKED: SpellId = 'fire';

/** The Game scene's private part these tests reach into. */
interface Inner {
  run: RunState;
}

/** Tally the page's `beforeunload` listeners from before its own scripts run. */
async function countListeners(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const live = new Set<unknown>();
    (window as unknown as { e2eUnload: Set<unknown> }).e2eUnload = live;
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, listener: unknown, options?: unknown) => {
      if (type === 'beforeunload') live.add(listener);
      add(type, listener as EventListener, options as AddEventListenerOptions);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, listener: unknown, options?: unknown) => {
      if (type === 'beforeunload') live.delete(listener);
      remove(type, listener as EventListener, options as EventListenerOptions);
    }) as typeof window.removeEventListener;
  });
}

interface Guard {
  /** Listeners past the ones the page had on the intro (Vite's dev client keeps one). */
  listeners: number;
  /** A cancelable `beforeunload` came back cancelled: the browser would ask. */
  asks: boolean;
}

/** Take the intro's listeners as the page's own, before any run. */
async function markBaseline(page: Page): Promise<void> {
  await waitForScene(page, SCENE.intro);
  await page.evaluate(() => {
    const w = window as unknown as { e2eUnload: Set<unknown>; e2eUnloadBase: number };
    w.e2eUnloadBase = w.e2eUnload.size;
  });
}

/** Both read in one evaluate, so the running game cannot move between them. */
function readGuard(page: Page): Promise<Guard> {
  return page.evaluate(() => {
    const w = window as unknown as { e2eUnload: Set<unknown>; e2eUnloadBase: number };
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return { listeners: w.e2eUnload.size - w.e2eUnloadBase, asks: event.defaultPrevented };
  });
}

const ON: Guard = { listeners: 1, asks: true };
const OFF: Guard = { listeners: 0, asks: false };

async function startRun(page: Page): Promise<void> {
  await countListeners(page);
  await page.goto('/?seed=1&invulnerable=1');
  await markBaseline(page);
  expect(await readGuard(page)).toEqual(OFF);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  expect(await readGuard(page)).toEqual(OFF);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

/** Send Game a confirmed pause choice, as the pause screen's Yes does. */
async function choose(page: Page, action: PauseChoosePayload['action']): Promise<void> {
  await page.evaluate(
    async ([scene, event, payload]) => {
      const { game } = await import('/src/main.ts');
      game.scene.getScene(scene).events.emit(event, payload);
    },
    [SCENE.game, PAUSE_EVENT.choose, { action } satisfies PauseChoosePayload] as const,
  );
}

function elapsedMs(page: Page): Promise<number> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(scene) as unknown as Inner).run.elapsedMs;
  }, SCENE.game);
}

test('the intro and spell select leave silently', async ({ page }) => {
  await countListeners(page);
  await page.goto('/?seed=1');
  await markBaseline(page);
  expect(await readGuard(page)).toEqual(OFF);
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.spellSelect);
  expect(await readGuard(page)).toEqual(OFF);
});

test('leaving during a run asks, and cancelling keeps the same run going', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  expect(await readGuard(page)).toEqual(ON);
  await page.waitForTimeout(1000);
  const before = await elapsedMs(page);

  // The browser's own dialog: dismissing it is the player's Cancel.
  const dialog = page.waitForEvent('dialog');
  page.once('dialog', (d) => void d.dismiss());
  await page.close({ runBeforeUnload: true });
  expect((await dialog).type()).toBe('beforeunload');

  expect(page.isClosed()).toBe(false);
  await waitForScene(page, SCENE.game);
  await expect.poll(() => elapsedMs(page)).toBeGreaterThan(before);
  expect(await readGuard(page)).toEqual(ON);
  expect(errors).toEqual([]);
});

test('Restart keeps one guard and Main menu drops it', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);

  await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    (window as unknown as { e2eRun: unknown }).e2eRun = (
      game.scene.getScene(scene) as unknown as Inner
    ).run;
  }, SCENE.game);
  await choose(page, 'restart');
  await expect
    .poll(
      () =>
        page.evaluate(async (scene) => {
          const { game } = await import('/src/main.ts');
          const run = (game.scene.getScene(scene) as unknown as Inner).run;
          return (
            game.scene.isActive(scene) && run !== (window as unknown as { e2eRun: unknown }).e2eRun
          );
        }, SCENE.game),
      { message: 'a new run started' },
    )
    .toBe(true);
  expect(await readGuard(page)).toEqual(ON);

  await choose(page, 'menu');
  await waitForScene(page, SCENE.intro);
  expect(await readGuard(page)).toEqual(OFF);
  expect(errors).toEqual([]);
});

test('End run drops the guard on Result', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  expect(await readGuard(page)).toEqual(ON);

  await choose(page, 'end');
  await waitForScene(page, SCENE.result);
  expect(await readGuard(page)).toEqual(OFF);
  expect(errors).toEqual([]);
});
