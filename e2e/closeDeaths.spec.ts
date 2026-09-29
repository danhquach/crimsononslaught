import { expect, test, type Page } from '@playwright/test';
import { BOSS_EMBERS } from '../src/config/pickups';
import { SPELL_IDS } from '../src/config/spells';
import type { DecidedOutcome } from '../src/core/runOutcome';
import { SCENE, type Outcome } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { ResultScene } from '../src/scenes/ResultScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #315 item 2 in the browser: the boss's killing blow decides the run, not
 * whichever death clip finishes first. The hero's clip is 750 ms and the
 * boss's 1000 ms, so a hero dying within 250 ms after the blow used to record
 * a loss, and one dying later, before the boss's clip ended, a win over a
 * corpse.
 *
 * The deaths are ordered by test hooks on the run clock (`killBossForTest`,
 * `killHeroForTest`, `killHeroInForTest`), so the gap is exact at any frame
 * rate. The player is not invulnerable: the hook's hit has to reach the hero.
 * Everything asserted is read in the one `evaluate` that ran the deaths, since
 * the run moves between two.
 */

/** One step of a close death, in the order it is played. */
type Step = { do: 'boss' } | { do: 'hero' } | { do: 'heroIn'; ms: number };

interface Closing {
  outcome: Outcome | undefined;
  embers: number | undefined;
  hpBefore: number;
  /** The hero's HP when the run ended, read from the scene's own report. */
  hpAfter: number;
  /** Whether the scene's delayed hero kill came due; the hook records it, nothing samples it. */
  killFired: boolean;
  decided: DecidedOutcome | undefined;
}

/** Play `steps` in one call, then wait for Result; returns what the scene reports. */
function close(page: Page, steps: Step[]): Promise<Closing> {
  return page.evaluate(
    async ({ scene, steps: plan }) => {
      const { game } = await import('/src/main.ts');
      const gameScene = game.scene.getScene(scene.game) as GameScene;
      const hpBefore = gameScene.deathReport.heroHp;
      for (const step of plan) {
        if (step.do === 'boss') gameScene.killBossForTest();
        else if (step.do === 'hero') gameScene.killHeroForTest();
        else gameScene.killHeroInForTest(step.ms);
      }
      const until = performance.now() + 8000;
      while (!game.scene.isActive(scene.result) && performance.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      // Plain fields of the scene, still readable once Game has shut down.
      const end = gameScene.deathReport;
      const summary = (game.scene.getScene(scene.result) as ResultScene).summary;
      return {
        outcome: summary?.outcome,
        embers: summary?.stats.embers,
        hpBefore,
        hpAfter: end.heroHp,
        killFired: end.heroKillFired,
        decided: end.decided,
      };
    },
    { scene: SCENE, steps },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
});

test('a hero hit on the very frame of the boss killing blow cannot undo the win', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const closing = await close(page, [{ do: 'boss' }, { do: 'hero' }]);
  expect(closing.outcome).toBe('win');
  expect(closing.decided).toBe('win');
  expect(closing.hpAfter, 'the hero could not be hurt after the blow').toBe(closing.hpBefore);
  expect(closing.embers).toBeGreaterThanOrEqual(BOSS_EMBERS);
  expect(errors).toEqual([]);
});

// 100 ms is inside the 250 ms the hero's shorter clip used to lose by, 500 and
// 900 ms in the stretch before the boss's clip ends that used to win over a corpse.
for (const gapMs of [100, 500, 900]) {
  test(`a hero killed ${gapMs} run-ms after the boss's blow is a win with its HP unchanged`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const closing = await close(page, [{ do: 'boss' }, { do: 'heroIn', ms: gapMs }]);
    expect(closing.killFired, 'the delayed kill came due before Result').toBe(true);
    expect(closing.outcome).toBe('win');
    expect(closing.hpAfter, 'the delayed kill was dropped').toBe(closing.hpBefore);
    expect(closing.embers).toBeGreaterThanOrEqual(BOSS_EMBERS);
    expect(errors).toEqual([]);
  });
}

test('a hero already dead when the boss takes its blow is a loss, the boss Embers banked', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const closing = await close(page, [{ do: 'hero' }, { do: 'boss' }]);
  expect(closing.hpAfter, 'the hero died').toBe(0);
  expect(closing.decided).toBe('lose');
  expect(closing.outcome).toBe('lose');
  expect(closing.embers).toBeGreaterThanOrEqual(BOSS_EMBERS);
  expect(errors).toEqual([]);
});
