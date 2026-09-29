import { expect, test } from '@playwright/test';
import { BOSS_CC_DR } from '../src/config/boss';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #315 item 1 in the browser: the boss's crowd control diminishes. A short
 * first application opens the window; the same kind applied again lasts
 * `BOSS_CC_DR.factor` of its length. The first is kept short on purpose:
 * a repeat that is no longer than what is left changes nothing (a stop is
 * refreshed to the longer of the two), so a long first one would hide the
 * scaling. Read in the one `evaluate` that applied them, all in one frame,
 * so no run time passes between the calls and the window cannot reset.
 */

const SHORT_S = 0.1;
const LONG_S = 2;

test('a repeated stun, stagger and freeze on the boss is shorter, and a freeze never cuts a running one', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const seen = await page.evaluate(
    async ({ scene, shortS, longS }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const firstStun = g.applyBossCcForTest('stun', shortS);
      const repeatStun = g.applyBossCcForTest('stun', longS);
      const firstStagger = g.applyBossCcForTest('stagger', shortS);
      const repeatStagger = g.applyBossCcForTest('stagger', longS);
      // The freeze shares the stun's count: it is the third stun.
      const freeze = g.applyBossCcForTest('freeze', longS);
      // And a shorter freeze on top of it leaves the running one alone.
      const shorter = g.applyBossCcForTest('freeze', shortS);
      return { firstStun, repeatStun, firstStagger, repeatStagger, freeze, shorter };
    },
    { scene: SCENE, shortS: SHORT_S, longS: LONG_S },
  );

  const { factor } = BOSS_CC_DR;
  expect(seen.firstStun?.stunS, 'first stun in full').toBeCloseTo(SHORT_S, 9);
  expect(seen.repeatStun?.stunS, 'repeat stun scaled').toBeCloseTo(LONG_S * factor, 9);
  expect(seen.firstStagger?.staggerS, 'first stagger in full').toBeCloseTo(SHORT_S, 9);
  expect(seen.repeatStagger?.staggerS, 'repeat stagger scaled').toBeCloseTo(LONG_S * factor, 9);
  expect(seen.freeze?.frozenS, 'a freeze is the third stun').toBeCloseTo(LONG_S * factor ** 2, 9);
  expect(seen.shorter?.frozenS, 'a shorter freeze keeps the running one').toBeCloseTo(
    LONG_S * factor ** 2,
    9,
  );
  expect(errors).toEqual([]);
});
