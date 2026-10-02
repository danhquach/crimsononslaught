import { expect, test, type Page } from '@playwright/test';
import { BOSS_SLAM, BOSS_ENRAGE } from '../src/config/boss';
import { BOSS_SLAM_FX } from '../src/config/fx';
import { PLAYER_MAX_HP } from '../src/config/player';
import { SPELL_IDS } from '../src/config/spells';
import { enrageThresholdHp } from '../src/core/boss';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import {
  cardCenter,
  collectErrors,
  readSounds,
  recordSounds,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * CO-222 in the browser: between charges the boss winds up a Ground slam, a red
 * ring on the floor for 1 s, then slams everything inside it. The run starts a
 * second short of the boss (`?startAt=`). The damage tests skip the boss's
 * cycle straight to its next skill and place the hero in the same `evaluate`,
 * so no frame of the fight lands between them; the slam's damage is read from
 * its own tally, apart from the boss's contact bites.
 */

const START_AT_S = 1199;

type Report = NonNullable<GameScene['bossReport']>;

async function startRun(page: Page, query = ''): Promise<void> {
  await page.goto(`/?seed=1&startAt=${START_AT_S}${query}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await recordSounds(page);
  await expect.poll(async () => (await report(page)) !== null, { timeout: 20_000 }).toBe(true);
}

function report(page: Page): Promise<Report | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(scene.game) as GameScene).bossReport;
  }, SCENE);
}

/** Skip to the boss's next skill and stand the hero `dx` px to its right, in one frame. */
async function slamWithHeroAt(page: Page, dx: number): Promise<void> {
  const placed = await page.evaluate(
    async ({ scene, dx }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (!boss || !g.skipBossToSkillForTest()) return false;
      g.placeHeroForTest(boss.x + dx, boss.y);
      return true;
    },
    { scene: SCENE, dx },
  );
  expect(placed).toBe(true);
}

/** Wait out the slam, then keep sampling a further second so a second hit would show. */
async function afterSlam(page: Page): Promise<Report | null> {
  await expect
    .poll(async () => (await report(page))?.slam.slams ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1_000);
  return report(page);
}

const slamCues = async (page: Page): Promise<number> =>
  (await readSounds(page)).filter((r) => r.key === 'boss.slam' && r.started).length;

test('a hero inside the ring takes the slam once', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await slamWithHeroAt(page, BOSS_SLAM.radius * 0.65);

  await expect
    .poll(async () => (await report(page))?.phase, { message: 'the boss winds up' })
    .toBe('windup');
  const windup = await report(page);
  expect(windup?.skill).toBe('slam');
  expect(windup?.clip).toMatch(/^boss\.slamWindup\./);
  expect(windup?.warnVisible).toBe(true);
  expect(windup?.rimClip).toBe(BOSS_SLAM_FX.rim);
  expect(windup?.fillClip).toBe(BOSS_SLAM_FX.fill);
  expect(Math.abs((windup?.warnRadiusPx ?? 0) - BOSS_SLAM.radius)).toBeLessThanOrEqual(2);

  const after = await afterSlam(page);
  console.log('slam inside', JSON.stringify(after?.slam), after?.shockPlays);
  expect(after?.slam.slams).toBe(1);
  expect(after?.slam.hits).toBe(1);
  expect(after?.slam.hpLost).toBe(BOSS_SLAM.damage);
  expect(after?.shockPlays).toBe(1);
  expect(after?.warnVisible).toBe(false);
  expect(await slamCues(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('a hero bitten just before the slam still takes it, through the hit-immunity window', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await slamWithHeroAt(page, BOSS_SLAM.radius * 0.65);
  await expect.poll(async () => (await report(page))?.phase).toBe('windup');
  // Late in the 1 s wind-up the hero steps into the boss's body (40 px plus its
  // own 14): the bite opens the hero's 0.5 s immunity window, and the slam lands
  // inside it. Checked in the same evaluate that the wind-up is still running.
  await page.waitForTimeout(650);
  const bitten = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const g = game.scene.getScene(scene.game) as GameScene;
    const boss = g.bossReport;
    if (boss?.phase !== 'windup') return null;
    g.placeHeroForTest(boss.x + 45, boss.y);
    return boss.slam.slams;
  }, SCENE);
  expect(bitten).toBe(0);
  // Once the slam lands the hero steps well clear, so further bites cannot
  // end the run during the second of sampling after it.
  await expect
    .poll(
      async () =>
        page.evaluate(async (scene) => {
          const { game } = await import('/src/main.ts');
          const g = game.scene.getScene(scene.game) as GameScene;
          const boss = g.bossReport;
          if (!boss || boss.slam.slams < 1) return 0;
          g.placeHeroForTest(boss.x + 400, boss.y);
          return boss.slam.slams;
        }, SCENE),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1_000);
  const after = await report(page);
  const hero = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(scene.game) as GameScene).dashReport.hp;
  }, SCENE);
  console.log('slam bitten', JSON.stringify(after?.slam), 'hero hp', hero);
  expect(after?.slam.hits).toBe(1);
  expect(after?.slam.hpLost).toBe(BOSS_SLAM.damage);
  // A bite landed as well, so the slam came while the window was open.
  expect(PLAYER_MAX_HP - hero).toBeGreaterThan(BOSS_SLAM.damage);
  expect(errors).toEqual([]);
});

test('stepping out of the ring avoids the slam', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await slamWithHeroAt(page, BOSS_SLAM.radius + 40);

  const after = await afterSlam(page);
  console.log('slam outside', JSON.stringify(after?.slam));
  expect(after?.slam.slams).toBe(1);
  expect(after?.slam.hits).toBe(0);
  expect(after?.slam.hpLost).toBe(0);
  expect(after?.shockPlays).toBe(1);
  expect(errors).toEqual([]);
});

test('an enraged boss slams harder', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  const enraged = await page.evaluate(
    async ({ scene, threshold }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const now = g.damageBossForTest(0);
      if (!now) return false;
      g.damageBossForTest(Math.max(0, now.hp - threshold));
      return g.bossReport?.enraged ?? false;
    },
    { scene: SCENE, threshold: enrageThresholdHp() },
  );
  expect(enraged).toBe(true);
  await slamWithHeroAt(page, BOSS_SLAM.radius * 0.65);

  const after = await afterSlam(page);
  console.log('slam enraged', JSON.stringify(after?.slam));
  expect(after?.slam.hits).toBe(1);
  expect(after?.slam.hpLost).toBe(BOSS_SLAM.damage * BOSS_ENRAGE.damageMul);
  expect(errors).toEqual([]);
});

test('in a plain fight the first slam comes after the first charge', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, '&invulnerable=1');
  await expect
    .poll(async () => (await report(page))?.slam.log.length ?? 0, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1);
  const first = (await report(page))?.slam.log[0];
  console.log('first slam', JSON.stringify(first));
  expect(first?.chargesBefore).toBe(1);
  expect(typeof first?.hit).toBe('boolean');
  expect(errors).toEqual([]);
});
