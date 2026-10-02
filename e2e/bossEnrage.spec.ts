import { expect, test, type Page } from '@playwright/test';
import { BOSS, BOSS_ENRAGE } from '../src/config/boss';
import { BOSS_AURA } from '../src/config/fx';
import { BOSS_BAR_FLAMES } from '../src/config/hud';
import { SPELL_IDS } from '../src/config/spells';
import { enrageThresholdHp } from '../src/core/boss';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { BossBarShown, HudScene } from '../src/scenes/HudScene';
import {
  cardCenter,
  collectErrors,
  readSounds,
  recordSounds,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * #388 in the browser: a hit that leaves the boss at or under half its last bar
 * enrages it for good. It takes more damage, hits harder, chases for a shorter
 * leg, wears the ember ring, bursts, roars once and pulses its HUD bar. The run
 * starts a second short of the boss (`?startAt=`), invulnerable, so the boss
 * is on screen at once; every hit goes through `damageBossForTest`, the run's
 * one damage path, and the readings that straddle a hit are taken in one
 * `evaluate` so no frame of the fight lands between them.
 */

const START_AT_S = 1199;
const THRESHOLD = enrageThresholdHp();

type Report = NonNullable<GameScene['bossReport']>;

async function startRun(page: Page): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1&startAt=${START_AT_S}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await recordSounds(page);
}

function report(page: Page): Promise<Report | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(scene.game) as GameScene).bossReport;
  }, SCENE);
}

function bar(page: Page): Promise<BossBarShown> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(scene.hud) as HudScene).bossBarShown;
  }, SCENE);
}

const enrageCues = async (page: Page): Promise<number> =>
  (await readSounds(page)).filter((r) => r.key === 'boss.enrage' && r.started).length;

test('the boss enrages once it is at half its last bar, and not a hit sooner', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await expect.poll(async () => (await report(page)) !== null, { timeout: 20_000 }).toBe(true);

  // One boss HP above the threshold, a read, then the hit that crosses it, a read.
  const crossing = await page.evaluate(
    async ({ scene, above }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const hud = game.scene.getScene(scene.hud) as HudScene;
      const now = g.damageBossForTest(0);
      if (!now) return null;
      g.damageBossForTest(Math.max(0, now.hp - above));
      const calm = g.bossReport;
      const calmBar = hud.bossBarShown;
      g.damageBossForTest(1);
      return { calm, calmBar, after: g.bossReport, afterBar: hud.bossBarShown };
    },
    { scene: SCENE, above: THRESHOLD + 1 },
  );
  expect(crossing).not.toBeNull();
  expect(crossing?.calm).toMatchObject({
    enraged: false,
    contactDamage: BOSS.contactDamage,
    damageTakenFactor: 1,
  });
  expect(crossing?.calmBar.enraged).toBe(false);
  expect(crossing?.calmBar.flames).toBe(0);
  expect(crossing?.after).toMatchObject({
    enraged: true,
    contactDamage: BOSS.contactDamage * BOSS_ENRAGE.damageMul,
    damageTakenFactor: BOSS_ENRAGE.damageTakenMul,
  });
  expect(crossing?.after?.contactDamage).toBe(45);
  // The chase leg is the config's, not timed in the browser: 2.8 s period less the warning and charge.
  expect(crossing?.after?.chaseS).toBeCloseTo(
    BOSS.cycleS * BOSS_ENRAGE.attackGapMul - BOSS.telegraphS - BOSS.chargeS,
    9,
  );
  expect(crossing?.after?.chaseS).toBeCloseTo(1.4, 9);

  // The ring, the burst and the HUD pulse follow the next frames.
  await expect
    .poll(async () => (await report(page))?.auraVisible, { message: 'the ember ring is out' })
    .toBe(true);
  const worn = await report(page);
  expect(worn?.auraClip).toBe(BOSS_AURA.clip);
  expect(worn?.burstPlays).toBe(1);
  await expect.poll(async () => (await bar(page)).enraged).toBe(true);
  // #388: the flames along the bar's top burn too, each tile playing the `hud.bossFlames` loop.
  await expect.poll(async () => (await bar(page)).flames).toBe(BOSS_BAR_FLAMES.count);

  // An enraged boss takes 1.5x: a 100 hit removes 150, read in one evaluate.
  const removed = await page.evaluate(
    async ({ scene }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const before = g.damageBossForTest(0);
      const after = g.damageBossForTest(100);
      return before && after ? before.hp - after.hp : null;
    },
    { scene: SCENE },
  );
  expect(removed).toBe(100 * BOSS_ENRAGE.damageTakenMul);

  // Dead, it takes the ring and the pulse with it; it roared exactly once.
  const killed = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(scene.game) as GameScene).killBossForTest();
  }, SCENE);
  expect(killed).toBe(true);
  await expect.poll(async () => (await bar(page)).enraged).toBe(false);
  await expect.poll(async () => (await bar(page)).flames).toBe(0);
  await expect
    .poll(async () =>
      page.evaluate(async (scene) => {
        const { game } = await import('/src/main.ts');
        return (game.scene.getScene(scene.game) as GameScene).bossReport;
      }, SCENE),
    )
    .toBeNull();
  expect(await enrageCues(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('a kill from above the threshold never enrages the boss', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await expect.poll(async () => (await report(page)) !== null, { timeout: 20_000 }).toBe(true);
  const seen = await page.evaluate(
    async ({ scene, above }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const hud = game.scene.getScene(scene.hud) as HudScene;
      const now = g.damageBossForTest(0);
      if (!now) return null;
      g.damageBossForTest(Math.max(0, now.hp - above));
      const killed = g.damageBossForTest(above);
      return { dying: killed?.dying, enraged: hud.bossBarShown.enraged };
    },
    { scene: SCENE, above: THRESHOLD + 1 },
  );
  expect(seen?.dying).toBe(true);
  expect(seen?.enraged).toBe(false);
  await expect
    .poll(async () => (await readSounds(page)).some((r) => r.key === 'boss.death'))
    .toBe(true);
  expect(await enrageCues(page)).toBe(0);
  expect(errors).toEqual([]);
});
