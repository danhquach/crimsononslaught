import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import type { RunPhase } from '../src/core/runEvents';
import { BOSS_START_MS } from '../src/core/runState';
import { SCENE, type ResultPayload } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';
import type { ResultScene } from '../src/scenes/ResultScene';
import { cardCenter, collectErrors, waitForScene } from './game';

/**
 * Spec §8 full run (CO-061): one seeded run at an accelerated clock, played
 * hands-off, reaches the boss phase and ends on the Result scene with no
 * console errors. Nobody steers, so `?invulnerable=1` keeps the player alive
 * through the waves, and every level-up overlay is answered with its first
 * card. Either outcome is fine; balance is CO-062's job.
 *
 * Observed at seed 1: fire wins at about 5:30 of run time in roughly 14 s of
 * wall clock.
 */

/**
 * Not `MAX_TIME_SCALE` (CO-091): the scale multiplies one frame's delta, so the
 * run window a frame simulates grows with the runner's frame time, and past
 * roughly 30 a slow machine's frames are long enough that a fireball's step
 * carries it clear across the boss instead of into it. The run clock keeps
 * flying while almost nothing lands, which is how the hosted runner reached
 * ~48:00 with the boss untouched. At 30 the arena is still faithful: measured
 * under CPU throttling from 1x to 32x, the boss dies within 7 s of reaching it
 * every time, where at 100 it survives the whole budget from 16x down.
 */
const TIME_SCALE = 30;

/**
 * The ticket's ceiling: the whole test, boot included, must fit in CI's 90 s.
 *
 * The waves are what spends it — the boss dies seconds after it arrives, so the
 * cost is the clock's climb to 5:00. Under a 32x CPU throttle that took 50 s
 * and the run ended at 57 s, against 14 s unthrottled.
 */
const TEST_BUDGET_MS = 90_000;

/**
 * Held back from the run so the assertions still have room: once the loop
 * returns, only `readResult` and the `expect`s are left, so this is slack for
 * those last round-trips to the page and not more of the run.
 *
 * Everything else is the run's, including whatever boot did not use, so a slow
 * runner spends the ceiling on the run rather than timing the test out — and an
 * overrun is this file's snapshot error, which names the phase and the clock,
 * rather than Playwright's timeout, which names neither.
 */
const RUN_TAIL_MS = 10_000;

/** Fire, by name rather than position: the timings above are fire's, whatever order the cards take. */
const SPELL_INDEX = SPELL_IDS.indexOf('fire');

interface Snapshot {
  levelUp: boolean;
  result: boolean;
  phase: RunPhase;
  elapsedMs: number;
}

function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const hud = (game.scene.getScene(scene.hud) as HudScene).view;
    return {
      levelUp: game.scene.isActive(scene.levelUp),
      result: game.scene.isActive(scene.result),
      phase: hud.phase,
      elapsedMs: hud.elapsedMs,
    };
  }, SCENE);
}

/** What the Result scene shows (`ResultScene.summary`), not the Game scene's internals. */
function readResult(page: Page): Promise<Readonly<ResultPayload> | null> {
  return page.evaluate(async (resultKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(resultKey) as ResultScene).summary;
  }, SCENE.result);
}

/**
 * Drives the run to Result: every level-up overlay is answered with its first
 * card (`1`), so the run never sits paused. A press that lands before the
 * overlay listens is harmless — the overlay is still up on the next poll.
 * Returns whether the HUD was ever seen in the boss phase.
 */
async function playToResult(page: Page, deadline: number): Promise<boolean> {
  let sawBoss = false;
  for (;;) {
    const snap = await snapshot(page);
    sawBoss ||= snap.phase === 'boss';
    if (snap.result) return sawBoss;
    if (Date.now() > deadline) {
      throw new Error(`no Result by the deadline; last seen ${JSON.stringify(snap)}`);
    }
    if (snap.levelUp) await page.keyboard.press('1');
    else await page.waitForTimeout(50);
  }
}

test(`a ${SPELL_IDS[SPELL_INDEX]} run at time scale ${TIME_SCALE} reaches the boss and a Result`, async ({
  page,
}) => {
  test.setTimeout(TEST_BUDGET_MS);
  const deadline = Date.now() + TEST_BUDGET_MS - RUN_TAIL_MS;
  const errors = collectErrors(page);

  await page.goto(`/?seed=1&timeScale=${TIME_SCALE}&invulnerable=1`);
  await waitForScene(page, SCENE.spellSelect);

  const { x, y } = cardCenter(SPELL_INDEX);
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const sawBoss = await playToResult(page, deadline);
  const result = await readResult(page);

  expect(sawBoss).toBe(true);
  expect(result).not.toBeNull();
  // With the hook on, only a win can end the run today; these two hold the
  // ticket's actual terms so a narrower hook or a losable boss fight later
  // still has to reach the boss first.
  expect(['win', 'lose']).toContain(result?.outcome);
  expect(result?.stats.timeSurvivedMs).toBeGreaterThanOrEqual(BOSS_START_MS);
  expect(result?.stats.spellId).toBe(SPELL_IDS[SPELL_INDEX]);
  expect(errors).toEqual([]);
});
