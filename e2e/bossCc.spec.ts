import { expect, test, type Page } from '@playwright/test';
import { BOSS_CC_DR, BOSS_CC_RESIST } from '../src/config/boss';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * CO-221 in the browser: the boss shrugs off a stun, turns a freeze into a short
 * slow, takes a quarter of a stagger's or slow's length with #315's repeat
 * halving on top, and says "Immune" over itself, throttled. A short first
 * stagger is kept short on purpose: a repeat no longer than what is left changes
 * nothing (a stop refreshes to the longer of the two), so a long first one would
 * hide the scaling. Each group is read in the one `evaluate` that applied it, all
 * in one frame, so no run time passes between the calls and the window cannot reset.
 */

const SHORT_S = 0.1;
const LONG_S = 2;
/** Long enough that its resisted, halved length (10 x 0.25 x 0.5) beats the freeze's slow left running. */
const SLOW_S = 10;

async function startGame(page: Page): Promise<void> {
  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

test('the boss ignores a stun, slows instead of freezing, and takes a quarter of a stagger and slow', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startGame(page);

  const seen = await page.evaluate(
    async ({ scene, shortS, longS, slowS }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const stun = g.applyBossCcForTest('stun', longS);
      // A second stun in the same frame is inside the pop's gap: still one pop.
      const stunAgain = g.applyBossCcForTest('stun', longS);
      const firstStagger = g.applyBossCcForTest('stagger', shortS);
      const repeatStagger = g.applyBossCcForTest('stagger', longS);
      const freeze = g.applyBossCcForTest('freeze', longS);
      const slow = g.applyBossCcForTest('slow', slowS);
      return { stun, stunAgain, firstStagger, repeatStagger, freeze, slow };
    },
    { scene: SCENE, shortS: SHORT_S, longS: LONG_S, slowS: SLOW_S },
  );

  const { factor } = BOSS_CC_DR;
  const cut = BOSS_CC_RESIST.durationFactor;
  expect(seen.stun?.stunS, 'a stun does nothing').toBe(0);
  expect(seen.stun?.immunePops, 'a shrugged stun pops').toBe(1);
  expect(seen.stunAgain?.stunS).toBe(0);
  expect(seen.stunAgain?.immunePops, 'the second is throttled').toBe(1);
  expect(seen.firstStagger?.staggerS, 'first stagger a quarter').toBeCloseTo(SHORT_S * cut, 9);
  expect(seen.repeatStagger?.staggerS, 'repeat a quarter, then halved').toBeCloseTo(
    LONG_S * cut * factor,
    9,
  );
  expect(seen.freeze?.frozenS, 'a freeze does not freeze').toBe(0);
  // 2 s freeze -> a slow of 2 x 2 s, cut to a quarter: 1 s.
  expect(seen.freeze?.slowS, 'a freeze is a short slow').toBeCloseTo(
    LONG_S * BOSS_CC_RESIST.freezeSlowPerFreezeS * cut,
    9,
  );
  expect(seen.freeze?.immunePops, 'a shrugged freeze is throttled too').toBe(1);
  // The slow is the second slow application, so it is halved after the cut.
  expect(seen.slow?.slowS, 'a slow a quarter, then halved').toBeCloseTo(SLOW_S * cut * factor, 9);
  expect(errors).toEqual([]);
});

test('the Immune pop shows again once the gap has passed on the boss clock', async ({ page }) => {
  const errors = collectErrors(page);
  await startGame(page);

  const first = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const g = game.scene.getScene(scene.game) as GameScene;
    const stun = g.applyBossCcForTest('stun', 1);
    return { pops: stun?.immunePops, clockS: g.bossClockForTest() };
  }, SCENE);
  expect(first.pops).toBe(1);

  // The gap is read on the boss's own clock, which moves only as it steers, so
  // wait on that clock rather than on wall time.
  const readClock = (): Promise<number> =>
    page.evaluate(async (scene) => {
      const { game } = await import('/src/main.ts');
      return (game.scene.getScene(scene.game) as GameScene).bossClockForTest() ?? 0;
    }, SCENE);
  await expect
    .poll(readClock, { timeout: 20_000 })
    .toBeGreaterThanOrEqual((first.clockS ?? 0) + BOSS_CC_RESIST.immunePopGapS);

  const second = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const g = game.scene.getScene(scene.game) as GameScene;
    return g.applyBossCcForTest('stun', 1)?.immunePops;
  }, SCENE);
  expect(second).toBe(2);
  expect(errors).toEqual([]);
});
