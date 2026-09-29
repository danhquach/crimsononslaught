import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #315 item 4 in the browser: a hero at 0 HP, still playing its death clip,
 * collects nothing. A gem or an Ember lying on it stays where it is, the run's
 * XP and Embers do not move, and no level-up choice opens under the clip.
 *
 * A first phase proves the setup would otherwise pay: with the hero alive, the
 * same gems level the run up (the overlay opens) and the same Ember is banked.
 * The test hooks drop the loot on the hero (`dropGemsForTest`,
 * `dropEmberForTest`) and kill it (`killHeroForTest`); every value asserted is
 * read in the one `evaluate` that ran the phase, since the run moves between two.
 */

/** Wall clock the dead phase watches: inside the hero's 750 ms clip, long enough for many overlap steps. */
const WATCH_MS = 350;
/**
 * Far past anything the crowd drops (a tank's 3), so a live hero banking at
 * least this much has collected the Ember dropped for it, not one the fire
 * spell's kills left behind.
 */
const EMBER_VALUE = 500;

interface Phase {
  xpBefore: GameScene['xpReport'];
  xpAfter: GameScene['xpReport'];
  embersBefore: number;
  embersAfter: number;
  gemsBefore: number;
  gemsAfter: number;
  emberLiveAfter: number;
  heroDead: boolean;
  levelUpSeen: boolean;
  resultOpen: boolean;
}

/**
 * Drop enough gems to level the run up, and an Ember, on the hero; `kill`
 * first for the dead phase. Watches for `watchMs`, or until a level-up opens
 * when the hero is alive, and reports what moved.
 */
function phase(page: Page, kill: boolean, watchMs: number): Promise<Phase> {
  return page.evaluate(
    async ({ scene, kill: killFirst, watchMs: watch, ember }) => {
      const { game } = await import('/src/main.ts');
      const gameScene = game.scene.getScene(scene.game) as GameScene;
      if (killFirst) gameScene.killHeroForTest();
      const xpBefore = gameScene.xpReport;
      const embersBefore = gameScene.pickupReport.embers;
      gameScene.dropGemsForTest(Math.ceil(xpBefore.xpToNext));
      gameScene.dropEmberForTest(ember);
      const gemsBefore = gameScene.pickupReport.gems;
      let levelUpSeen = false;
      const until = performance.now() + watch;
      while (performance.now() < until && !game.scene.isActive(scene.result)) {
        levelUpSeen ||= game.scene.isActive(scene.levelUp);
        if (levelUpSeen && !killFirst) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      levelUpSeen ||= game.scene.isActive(scene.levelUp);
      const resultOpen = game.scene.isActive(scene.result);
      // The overlay pauses Game; its report is still readable, and the numbers are the frozen ones.
      const report = gameScene.pickupReport;
      return {
        xpBefore,
        xpAfter: gameScene.xpReport,
        embersBefore,
        embersAfter: report.embers,
        gemsBefore,
        gemsAfter: report.gems,
        emberLiveAfter: report.live.ember,
        heroDead: gameScene.deathReport.heroDead,
        levelUpSeen,
        resultOpen,
      };
    },
    { scene: SCENE, kill, watchMs, ember: EMBER_VALUE },
  );
}

test('a live hero levels up and banks the loot; a dead one collects none of it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  // The control: alive, the same drop pays.
  const alive = await phase(page, false, 5000);
  expect(alive.levelUpSeen, 'a live hero is offered the level-up').toBe(true);
  expect(alive.xpAfter.level, 'and gains the level').toBeGreaterThan(alive.xpBefore.level);
  expect(alive.embersAfter - alive.embersBefore, 'and banks the Ember').toBeGreaterThanOrEqual(
    EMBER_VALUE,
  );
  await page.keyboard.press('1');
  await expect
    .poll(() =>
      page.evaluate(
        async (key) => (await import('/src/main.ts')).game.scene.isActive(key),
        SCENE.levelUp,
      ),
    )
    .toBe(false);

  // The dead hero: the same drop lies untouched. The gems just collected burst
  // for a moment before they leave the count; let them, or they would read as
  // gems taken from the dead hero.
  await page.waitForTimeout(800);
  const dead = await phase(page, true, WATCH_MS);
  expect(dead.heroDead, 'the hero is dead').toBe(true);
  expect(dead.resultOpen, 'the watch fell inside the death clip').toBe(false);
  expect(dead.levelUpSeen, 'no level-up opens under the clip').toBe(false);
  expect(dead.xpAfter, 'XP and level did not move').toEqual(dead.xpBefore);
  expect(dead.embersAfter, 'no Ember was banked').toBe(dead.embersBefore);
  expect(dead.gemsAfter, 'no gem was taken').toBeGreaterThanOrEqual(dead.gemsBefore);
  expect(dead.emberLiveAfter, 'the Ember still lies there').toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
