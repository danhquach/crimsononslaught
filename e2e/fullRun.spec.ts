import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import type { RunPhase } from '../src/core/runEvents';
import { BOSS_START_MS, MAX_TIME_SCALE } from '../src/core/runState';
import { currencyFor, type Save } from '../src/core/save';
import { SCENE, type ResultPayload } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';
import type { ResultScene } from '../src/scenes/ResultScene';
import type { UpgradesScene } from '../src/scenes/UpgradesScene';
import { cardCenter, collectErrors, forceFrameLength, waitForScene } from './game';

/**
 * Spec §8 full run (CO-061): a seeded run at an accelerated clock, played
 * hands-off, reaches the boss phase and ends on the Result scene with no
 * console errors. Nobody steers, so `?invulnerable=1` keeps the player alive
 * through the waves, and every level-up overlay is answered with its first
 * card. Either outcome is fine; balance is CO-062's job.
 *
 * The run is 20 minutes (#127), too long to climb here, so the check starts
 * the clock just short of the boss with `?startAt=` and the fresh build it
 * has at 0:00 fights the boss.
 *
 * Observed at seed 1: fire wins at about 24:45 of run time, earth at about
 * 24:20 — each about 22 s of the 90 s budget on a desktop.
 */

/** Run time the check starts at, in seconds: 10 s of waves before the boss at 20:00. */
const START_AT_S = 1190;

/**
 * `MAX_TIME_SCALE` itself, so this check is also the guard on that ceiling
 * (#89): a frame at the ceiling owes the arena the most simulation steps it
 * ever has to fit, and a machine that cannot fit them renders fewer, longer
 * frames — the run slows down, and past what the 90 s budget absorbs this check
 * goes red rather than the ceiling shipping.
 */
const TIME_SCALE = MAX_TIME_SCALE;

/**
 * The frame length the run is driven at: about what the CI runner renders,
 * pinned so the check sees it on every machine (#94). At this length and
 * `TIME_SCALE` a frame covers 3 s of run time; simulated as one decision that
 * skips the boss past Earth's ring for the whole run, which is what CI did while
 * a 60 fps desktop passed. Stepping the frame (`simulationSteps`) is the fix,
 * and this is what proves it holds.
 */
const FRAME_MS = 100;

/**
 * The ticket's ceiling per run: each check, boot included, must fit in CI's 90 s.
 *
 * The boss fight is what spends it: the check starts 10 s short of the boss
 * (`START_AT_S`), so the cost is the fresh build wearing the boss down.
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

/**
 * Fire and earth, by name rather than position, whatever order the cards take.
 *
 * Fire is the reach spell and the one CO-061 was written around; earth is the
 * strictest, the only spell that has to touch the boss to hurt it, and the one
 * the ceiling used to be too fast for (#89). A scale both of these win at is a
 * scale the arena simulates honestly.
 */
const SPELLS: readonly SpellId[] = ['fire', 'earth'];

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

/** The save after a reload, read from the registry through the Upgrades scene (CO-101). */
function readSave(page: Page): Promise<Save> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as UpgradesScene).save;
  }, SCENE.upgrades);
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

for (const spellId of SPELLS) {
  test(`a ${spellId} run at time scale ${TIME_SCALE} reaches the boss and a Result`, async ({
    page,
  }) => {
    test.setTimeout(TEST_BUDGET_MS);
    const deadline = Date.now() + TEST_BUDGET_MS - RUN_TAIL_MS;
    const errors = collectErrors(page);

    await page.goto(`/?seed=1&timeScale=${TIME_SCALE}&invulnerable=1&startAt=${START_AT_S}`);
    await waitForScene(page, SCENE.spellSelect);
    await forceFrameLength(page, FRAME_MS);

    const { x, y } = cardCenter(SPELL_IDS.indexOf(spellId));
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
    expect(result?.stats.spellId).toBe(spellId);
    expect(errors).toEqual([]);
    if (!result) return;

    // CO-101: the run paid out and was recorded; the record outlives the page.
    expect(result.earned).toBe(currencyFor(result.stats, result.outcome));
    expect(result.earned).toBeGreaterThan(0);
    expect(result.balance).toBe(result.earned);
    await page.reload();
    await waitForScene(page, SCENE.spellSelect);
    const save = await readSave(page);
    expect(save.profile.runs).toBe(1);
    expect(save.profile.wins).toBe(result.outcome === 'win' ? 1 : 0);
    expect(save.profile.totalKills).toBe(result.stats.kills);
    expect(save.profile.spellCounts).toEqual({ [spellId]: 1 });
    expect(save.currency).toBe(result.earned);
  });
}
