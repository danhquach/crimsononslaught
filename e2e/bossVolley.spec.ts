import { expect, test, type Page } from '@playwright/test';
import { BOSS, BOSS_VOLLEY } from '../src/config/boss';
import { SPELL_IDS } from '../src/config/spells';
import { enrageThresholdHp } from '../src/core/boss';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import {
  blockBossSkills,
  cardCenter,
  collectErrors,
  readSounds,
  recordSounds,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * CO-223 in the browser: from the second bar the boss may wind up a Bolt volley
 * (1.2 s), then fires 14 bolts round it with two 45 degree gaps at its sides,
 * and a volley is at least 15 s of boss time after the last. The run starts a
 * second short of the boss (`?startAt=`) at `?timeScale=4`, which the scene's
 * sub-stepping keeps honest for the bolts. Every sample reads all it needs in
 * one `evaluate`; spacing is read from the boss's own clock, not wall time.
 * The hit tests keep to `?enemies=tank`, slow and few, so no contact bite opens
 * the hero's immunity window under the bolt.
 */

const START_AT_S = 1199;
const SCALE = '&timeScale=4';
const CALM = `${SCALE}&enemies=tank`;

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
  // CO-232: a far hero draws Leap too; this spec is about the volley.
  await blockBossSkills(page, ['leap']);
}

/**
 * One sample with the hero kept 400 px from the boss, in the far band where the
 * pick favours the volley, so a volley comes on any seed's rolls.
 */
function reportFar(page: Page): Promise<Report | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const g = game.scene.getScene(scene.game) as GameScene;
    const boss = g.bossReport;
    if (boss) g.placeHeroForTest(boss.x + 400, boss.y);
    return g.bossReport;
  }, SCENE);
}

function report(page: Page): Promise<Report | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(scene.game) as GameScene).bossReport;
  }, SCENE);
}

/** The boss loses one whole bar (and, with `toEnrage`, the rest down to its enrage threshold). */
async function breakBar(page: Page, toEnrage = false): Promise<void> {
  const ok = await page.evaluate(
    async ({ scene, bar, threshold, toEnrage }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const first = g.damageBossForTest(bar);
      if (!first) return false;
      if (toEnrage) g.damageBossForTest(Math.max(0, first.hp - threshold));
      return !first.dying;
    },
    { scene: SCENE, bar: BOSS.hp / BOSS.bars, threshold: enrageThresholdHp(), toEnrage },
  );
  expect(ok).toBe(true);
}

test('bar 1 holds no volley, and breaking it lets one come', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, `${SCALE}&invulnerable=1`);
  // Sample until three slams have landed, and keep every sample's volley count.
  let volleysSeen = 0;
  let slams = 0;
  const deadline = Date.now() + 40_000;
  while (slams < 3 && Date.now() < deadline) {
    const sample = await report(page);
    slams = sample?.slam.slams ?? 0;
    volleysSeen = Math.max(volleysSeen, sample?.volley.volleys ?? 0);
    await page.waitForTimeout(100);
  }
  console.log('bar 1 slams', slams, 'volleys', volleysSeen);
  expect(slams).toBeGreaterThanOrEqual(3);
  expect(volleysSeen).toBe(0);

  await breakBar(page);
  await expect
    .poll(async () => (await reportFar(page))?.volley.volleys ?? 0, { timeout: 40_000 })
    .toBeGreaterThanOrEqual(1);
  const after = await report(page);
  console.log('volley log', JSON.stringify(after?.volley.log));
  expect(after?.volley.log[0]?.bolts).toBe(14);
  // The cooldown is stamped at the wind-up's start: ready at atS - windup + cooldown, read on the same clock.
  const first = after?.volley.log[0]?.atS ?? 0;
  const expectedReadyIn =
    first - BOSS_VOLLEY.windupS + BOSS_VOLLEY.cooldownS - (after?.volley.clockS ?? 0);
  console.log('readyInS', after?.volley.readyInS, 'expected', expectedReadyIn);
  expect(after?.volley.readyInS).toBeGreaterThan(0);
  expect(after?.volley.readyInS).toBeLessThanOrEqual(BOSS_VOLLEY.cooldownS);
  expect(Math.abs((after?.volley.readyInS ?? 99) - expectedReadyIn)).toBeLessThan(0.05);
  expect((await readSounds(page)).filter((r) => r.key === 'boss.volley' && r.started)).toHaveLength(
    after?.volley.volleys ?? -1,
  );
  expect(errors).toEqual([]);
});

test('volleys keep their 15 s cooldown, enraged too, with the hero far away', async ({ page }) => {
  test.setTimeout(55_000);
  const errors = collectErrors(page);
  await startRun(page, `${SCALE}&invulnerable=1`);
  await breakBar(page, true);
  expect((await report(page))?.enraged).toBe(true);
  // CO-225: an enraged charge leg is a chain now, so skills come less often and the seeded rolls
  // gave one volley before the first level-up paused the clock. A forced first volley starts the
  // cooldown the same way a natural one does, so the natural ones after it keep 15 s from it.
  await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(scene.game) as GameScene).skipBossToSkillForTest('volley');
  }, SCENE);

  const startClock = (await report(page))?.volley.clockS ?? 0;
  let last: Report | null = null;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    last = await reportFar(page);
    if (!last || last.volley.clockS - startClock >= 70) break;
    await page.waitForTimeout(250);
  }
  const volleys = last?.volley.log ?? [];
  const slams = last?.slam.log ?? [];
  const gaps = volleys.slice(1).map((v, i) => v.atS - (volleys[i]?.atS ?? 0));
  console.log(
    'boss clock sampled',
    ((last?.volley.clockS ?? 0) - startClock).toFixed(1),
    'volleys',
    volleys.length,
    'gaps',
    gaps.map((g) => g.toFixed(2)).join(','),
    'slams',
    slams.length,
  );
  // The pick is random by distance; with the hero kept far the volley is
  // favoured, so volleys come often, but never closer than 15 s and never more
  // than the cooldown allows in the span.
  const spanS = (last?.volley.clockS ?? 0) - startClock;
  expect(volleys.length).toBeGreaterThanOrEqual(2);
  expect(volleys.length).toBeLessThanOrEqual(Math.floor(spanS / BOSS_VOLLEY.cooldownS) + 1);
  expect(volleys.every((v) => v.enraged && v.bolts === 14)).toBe(true);
  for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(BOSS_VOLLEY.cooldownS - 1e-6);
  expect(slams.length).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('a bolt that reaches the hero hits once, for its damage', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, CALM);
  await breakBar(page);
  // Hero 120 px to the boss's right (clear of the boss body), then the wind-up starts aimed at them.
  console.log('boss radius', BOSS.radius, 'hero radius 14');
  expect(BOSS.radius + 14).toBeLessThan(120);
  const placed = await page.evaluate(
    async ({ scene }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (!boss) return false;
      g.placeHeroForTest(boss.x + 120, boss.y);
      return g.skipBossToSkillForTest('volley');
    },
    { scene: SCENE },
  );
  expect(placed).toBe(true);
  // Once it has hit, the hero steps well clear (the boss would bite them dead
  // otherwise) and sampling goes on for a second, so a second hit would show.
  let sample: Report | null = null;
  let hitAt = 0;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    sample = await page.evaluate(async (scene) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (boss && boss.volley.boltHits >= 1) g.placeHeroForTest(boss.x + 400, boss.y);
      return boss;
    }, SCENE);
    if ((sample?.volley.boltHits ?? 0) >= 1 && hitAt === 0) hitAt = Date.now();
    if (hitAt > 0 && Date.now() - hitAt >= 1_000) break;
    await page.waitForTimeout(50);
  }
  console.log('volley hit', JSON.stringify(sample?.volley));
  expect(sample?.volley.volleys).toBe(1);
  expect(sample?.volley.boltHits).toBe(1);
  expect(sample?.volley.hpLost).toBe(BOSS_VOLLEY.damage);
  expect(errors).toEqual([]);
});

test('standing in a gap dodges the volley', async ({ page }) => {
  const errors = collectErrors(page);
  // No timeScale here: the 1.2 s wind-up runs in real time, so polling every
  // 50 ms always finds it, and the hero is placed in the same evaluate that
  // reads the locked aim and the phase.
  await startRun(page, '&enemies=tank');
  await breakBar(page);
  await page.evaluate(
    async ({ scene }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (!boss) return;
      g.placeHeroForTest(boss.x + 120, boss.y);
      g.skipBossToSkillForTest('volley');
    },
    { scene: SCENE },
  );
  // Step a quarter turn off the locked aim, 100 px out, into the middle of a gap.
  const gapDistance = 100;
  const heroRadius = 14; // Player's body radius
  console.log('boss radius', BOSS.radius, 'hero radius', heroRadius);
  expect(BOSS.radius + heroRadius).toBeLessThan(gapDistance);
  let placed: { phase: string; offsetRad: number; distance: number } | null = null;
  const placeDeadline = Date.now() + 10_000;
  while (!placed && Date.now() < placeDeadline) {
    placed = await page.evaluate(
      async ({ scene, distance }) => {
        const { game } = await import('/src/main.ts');
        const g = game.scene.getScene(scene.game) as GameScene;
        const boss = g.bossReport;
        if (!boss || boss.phase !== 'windup' || boss.skill !== 'volley') return null;
        const side = boss.volley.aimRad + Math.PI / 2;
        const hero = g.placeHeroForTest(
          boss.x + Math.cos(side) * distance,
          boss.y + Math.sin(side) * distance,
        );
        // Read back in the same evaluate: still the wind-up, hero a quarter turn off the aim.
        const after = g.bossReport;
        const angle = Math.atan2(hero.y - boss.y, hero.x - boss.x);
        const turn = Math.atan2(
          Math.sin(angle - boss.volley.aimRad),
          Math.cos(angle - boss.volley.aimRad),
        );
        return {
          phase: after?.phase ?? 'none',
          offsetRad: turn,
          distance: Math.hypot(hero.x - boss.x, hero.y - boss.y),
        };
      },
      { scene: SCENE, distance: gapDistance },
    );
    if (!placed) await page.waitForTimeout(50);
  }
  console.log('hero placed', JSON.stringify(placed));
  expect(placed?.phase).toBe('windup');
  expect(placed?.offsetRad).toBeCloseTo(Math.PI / 2, 1);
  expect(placed?.distance).toBeCloseTo(gapDistance, 0);
  // Sample while the bolts pass the hero; 1.2 s of boss time after the volley
  // they all have, and the hero steps clear before the boss walks over and bites.
  let airborne = 0;
  let sample: Report | null = null;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    sample = await page.evaluate(async (scene) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      const at = boss?.volley.log[0]?.atS;
      if (boss && at !== undefined && boss.volley.clockS - at >= 1.2) {
        g.placeHeroForTest(boss.x + 700, boss.y);
      }
      return boss;
    }, SCENE);
    airborne = Math.max(airborne, sample?.volley.boltsAlive ?? 0);
    const at = sample?.volley.log[0]?.atS;
    if (at !== undefined && (sample?.volley.clockS ?? 0) - at >= 1.4) break;
    await page.waitForTimeout(50);
  }
  console.log('gap dodge', JSON.stringify(sample?.volley), 'airborne', airborne);
  expect(sample?.volley.volleys).toBe(1);
  expect(airborne).toBeGreaterThan(0);
  expect(sample?.volley.boltHits).toBe(0);
  expect(sample?.volley.hpLost).toBe(0);
  expect(errors).toEqual([]);
});
