import { expect, test, type Page } from '@playwright/test';
import { BOSS, BOSS_LEAP, BOSS_SKILL_RANGE } from '../src/config/boss';
import { BOSS_LEAP_FX } from '../src/config/fx';
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
 * CO-232 in the browser: from the second bar a far hero draws the boss's Leap:
 * a 0.9 s crouch with a 90 px circle on the floor where the hero stood, a flight
 * that lands on the circle as the wind-up ends, and a hit for a hero inside it.
 * The run starts a second short of the boss (`?startAt=`). The natural-pick test
 * runs at `?timeScale=4` and reads the take-off distance from the leap's own
 * log; the damage tests force the skill and run in real time, so a poll every
 * 50 ms always catches the 0.9 s wind-up. Every sample reads all it needs in one
 * `evaluate`; the landing is read from the boss's own tally, apart from its
 * contact bites.
 */

const START_AT_S = 1199;
const SCALE = '&timeScale=4&enemies=tank&invulnerable=1';
/** How far the hero stands from the boss as the leap is forced, px: clear of its body and bite. */
const HERO_AWAY_PX = 300;
/** How far the hero walks from the locked circle's centre: outside the ring and the hero's own radius. */
const STEP_OUT_PX = 150;

type Report = NonNullable<GameScene['bossReport']>;

async function startRun(page: Page, query = '&enemies=tank'): Promise<void> {
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

/** The boss loses one whole bar, so its second-bar skills are on. */
async function breakBar(page: Page): Promise<void> {
  const ok = await page.evaluate(
    async ({ scene, bar }) => {
      const { game } = await import('/src/main.ts');
      const first = (game.scene.getScene(scene.game) as GameScene).damageBossForTest(bar);
      return first !== null && !first.dying;
    },
    { scene: SCENE, bar: BOSS.hp / BOSS.bars },
  );
  expect(ok).toBe(true);
}

/**
 * Break the bar, stand the hero `HERO_AWAY_PX` from the boss (toward the arena's
 * middle, so no world edge clamps it) and force a leap at them, in one frame.
 * Returns where the hero stands.
 */
async function forceLeap(page: Page): Promise<{ x: number; y: number }> {
  await breakBar(page);
  const hero = await page.evaluate(
    async ({ scene, away }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (!boss) return null;
      const spot = g.placeHeroForTest(boss.x + (boss.x < 1500 ? away : -away), boss.y);
      return g.skipBossToSkillForTest('leap') ? spot : null;
    },
    { scene: SCENE, away: HERO_AWAY_PX },
  );
  expect(hero).not.toBeNull();
  return hero as { x: number; y: number };
}

const leapCues = async (page: Page): Promise<number> =>
  (await readSounds(page)).filter((r) => r.key === 'boss.leap' && r.started).length;

test('a far hero draws a natural leap, from beyond the far band, on a 12 s cooldown', async ({
  page,
}) => {
  test.setTimeout(75_000);
  const errors = collectErrors(page);
  await startRun(page, SCALE);
  await breakBar(page);
  const startClock = (await report(page))?.volley.clockS ?? 0;
  // The hero is kept 400 px out (far band) from the boss at every sample, so each skill leg rolls
  // with the leap at weight 3. Sampling goes on a full 60 s of boss time, past the first leap.
  let last: Report | null = null;
  const deadline = Date.now() + 55_000;
  while (Date.now() < deadline) {
    last = await page.evaluate(async (scene) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (boss && boss.phase !== 'windup')
        g.placeHeroForTest(boss.x + (boss.x < 1500 ? 400 : -400), boss.y);
      return g.bossReport;
    }, SCENE);
    if (last && last.volley.clockS - startClock >= 60) break;
    await page.waitForTimeout(100);
  }
  const log = last?.leap.log ?? [];
  const gaps = log.slice(1).map((l, i) => l.atS - (log[i]?.atS ?? 0));
  console.log(
    'natural window',
    ((last?.volley.clockS ?? 0) - startClock).toFixed(1),
    's, leaps',
    JSON.stringify(log),
    'gaps',
    gaps.map((g) => g.toFixed(2)).join(','),
    'slams',
    last?.slam.slams,
    'volleys',
    last?.volley.volleys,
    'summons',
    last?.summon.summons,
  );
  expect(log.length).toBeGreaterThanOrEqual(2); // the gap check below needs a pair of leaps
  // The pick rolled with the hero beyond the far band: the take-off was that far from the locked circle.
  for (const entry of log) expect(entry.takeoffDist).toBeGreaterThan(BOSS_SKILL_RANGE.farPx);
  for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(BOSS_LEAP.cooldownS - 1e-6);
  expect(await leapCues(page)).toBe(last?.leap.leaps ?? -1);
  expect(errors).toEqual([]);
});

test('a hero standing in the circle takes the landing once, and the boss lands on it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  const hero = await forceLeap(page);

  // Sample through the wind-up and landing: read the warning and the locked circle while it shows,
  // then, once the leap has landed, step the hero well clear (the boss would bite them otherwise).
  let windup: Report | null = null;
  let landed: Report | null = null;
  const deadline = Date.now() + 10_000;
  while (!landed && Date.now() < deadline) {
    const sample = await page.evaluate(async (scene) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (boss && boss.leap.leaps >= 1) g.placeHeroForTest(boss.x + 400, boss.y);
      return boss;
    }, SCENE);
    if (sample?.phase === 'windup' && sample.skill === 'leap') windup = sample;
    if ((sample?.leap.leaps ?? 0) >= 1) landed = sample;
    else await page.waitForTimeout(50);
  }
  expect(windup).not.toBeNull();
  expect(landed).not.toBeNull();
  await page.waitForTimeout(1_000);
  const after = await report(page);
  console.log('leap inside', JSON.stringify(after?.leap), 'warn', windup?.leap.warnRadiusPx);

  expect(windup?.clip).toMatch(/^boss\.leapWindup\./);
  expect(windup?.leap.warnVisible).toBe(true);
  expect(windup?.rimClip).toBeNull(); // the slam's own ring stays off
  expect(Math.abs((windup?.leap.warnRadiusPx ?? 0) - BOSS_LEAP.radius)).toBeLessThanOrEqual(2);
  // The circle is where the hero stood as the wind-up began.
  expect(
    Math.hypot((windup?.leap.target?.x ?? 0) - hero.x, (windup?.leap.target?.y ?? 0) - hero.y),
  ).toBeLessThan(1);
  expect(BOSS_LEAP_FX.rim).toBe('boss.leapWarnRim');

  expect(after?.leap.leaps).toBe(1);
  expect(after?.leap.hits).toBe(1);
  expect(after?.leap.hpLost).toBe(BOSS_LEAP.damage);
  expect(after?.leap.log[0]?.hit).toBe(true);
  expect(after?.leap.shockPlays).toBe(1);
  expect(after?.leap.warnVisible).toBe(false);
  // The boss came down on the locked circle: the landing is the one the tally logged.
  expect(
    Math.hypot(
      (after?.leap.log[0]?.x ?? 0) - (windup?.leap.target?.x ?? 0),
      (after?.leap.log[0]?.y ?? 0) - (windup?.leap.target?.y ?? 0),
    ),
  ).toBeLessThan(1);
  expect(await leapCues(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('walking out of the circle during the wind-up avoids the landing', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await forceLeap(page);

  // Once the circle is locked the hero steps STEP_OUT_PX from its centre, in the same evaluate that read it.
  let stepped: { x: number; y: number; target: { x: number; y: number } } | null = null;
  const deadline = Date.now() + 10_000;
  while (!stepped && Date.now() < deadline) {
    stepped = await page.evaluate(
      async ({ scene, out }) => {
        const { game } = await import('/src/main.ts');
        const g = game.scene.getScene(scene.game) as GameScene;
        const boss = g.bossReport;
        const target = boss?.leap.target;
        if (!boss || boss.phase !== 'windup' || boss.skill !== 'leap' || !target) return null;
        const hero = g.placeHeroForTest(target.x + (target.x < 1500 ? out : -out), target.y);
        return { x: hero.x, y: hero.y, target: { x: target.x, y: target.y } };
      },
      { scene: SCENE, out: STEP_OUT_PX },
    );
    if (!stepped) await page.waitForTimeout(50);
  }
  expect(stepped).not.toBeNull();
  const away = Math.hypot(
    (stepped?.x ?? 0) - (stepped?.target.x ?? 0),
    (stepped?.y ?? 0) - (stepped?.target.y ?? 0),
  );
  expect(away).toBeGreaterThanOrEqual(STEP_OUT_PX - 1);

  // Wait out the landing, then a further second so a second hit would show.
  await expect
    .poll(async () => (await report(page))?.leap.leaps ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1_000);
  const after = await report(page);
  console.log('leap outside', JSON.stringify(after?.leap));
  expect(after?.leap.leaps).toBe(1);
  expect(after?.leap.hits).toBe(0);
  expect(after?.leap.hpLost).toBe(0);
  expect(after?.leap.log[0]?.heroDist).toBeGreaterThanOrEqual(STEP_OUT_PX - 1);
  expect(after?.leap.shockPlays).toBe(1);
  expect(await leapCues(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('an enraged boss forced to leap lands once, and no chained charge follows it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, '&enemies=tank&invulnerable=1');
  // Enraged, the charge leg is a chain; a forced leap cuts it short and nothing of it survives.
  await page.evaluate(
    async ({ scene, bar, threshold }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const first = g.damageBossForTest(bar);
      if (first) g.damageBossForTest(Math.max(0, first.hp - threshold));
    },
    { scene: SCENE, bar: BOSS.hp / BOSS.bars, threshold: enrageThresholdHp() },
  );
  expect((await report(page))?.enraged).toBe(true);
  await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(scene.game) as GameScene).skipBossToSkillForTest('leap');
  }, SCENE);
  await expect
    .poll(async () => (await report(page))?.leap.leaps ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  const after = await report(page);
  console.log('enraged leap', JSON.stringify(after?.leap));
  expect(after?.leap.leaps).toBe(1);
  expect(after?.chain.chained).toBe(false);
  expect(errors).toEqual([]);
});
