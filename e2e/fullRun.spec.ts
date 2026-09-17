import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import type { RunPhase } from '../src/core/runEvents';
import { BOSS_START_MS, MAX_TIME_SCALE } from '../src/core/runState';
import { SCENE, type ResultPayload } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';
import type { ResultScene } from '../src/scenes/ResultScene';
import { cardCenter, collectErrors, waitForScene } from './game';

/**
 * Spec §8 full run (CO-061): one seeded run at the maximum time scale, played
 * hands-off, reaches the boss phase and ends on the Result scene with no
 * console errors. Nobody steers, so `?invulnerable=1` keeps the player alive
 * through the waves, and every level-up overlay is answered with its first
 * card. Either outcome is fine; balance is CO-062's job.
 *
 * Observed at seed 1: fire wins at about 5:30 of run time in roughly 5 s of
 * wall clock. Earth is not used because at scale 100 its boulders never land
 * on the boss (they do at scale 30 and below).
 */

/** Wall clock for the run itself. Boot and SpellSelect come on top, all inside the ticket's 90 s. */
const RUN_BUDGET_MS = 60_000;

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
async function playToResult(page: Page): Promise<boolean> {
  const deadline = Date.now() + RUN_BUDGET_MS;
  let sawBoss = false;
  for (;;) {
    const snap = await snapshot(page);
    sawBoss ||= snap.phase === 'boss';
    if (snap.result) return sawBoss;
    if (Date.now() > deadline) {
      throw new Error(`no Result within ${RUN_BUDGET_MS} ms; last seen ${JSON.stringify(snap)}`);
    }
    if (snap.levelUp) await page.keyboard.press('1');
    else await page.waitForTimeout(50);
  }
}

test(`a ${SPELL_IDS[SPELL_INDEX]} run at max time scale reaches the boss and a Result`, async ({
  page,
}) => {
  // The ticket's ceiling: the whole test, boot included, must fit in CI's 90 s.
  test.setTimeout(90_000);
  const errors = collectErrors(page);

  await page.goto(`/?seed=1&timeScale=${MAX_TIME_SCALE}&invulnerable=1`);
  await waitForScene(page, SCENE.spellSelect);

  const { x, y } = cardCenter(SPELL_INDEX);
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const sawBoss = await playToResult(page);
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
