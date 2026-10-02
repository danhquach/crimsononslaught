import { expect, test, type Page } from '@playwright/test';
import { BOSS, BOSS_SUMMON } from '../src/config/boss';
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
 * CO-224 in the browser: from the second bar the boss may call a pack of Swarm
 * enemies round itself (a 1 s wind-up with a circle where each one will
 * appear), at most `maxLive` of the pack alive, a summon at least 14 s of boss
 * time after the last, and the pack drops XP gems and nothing else. The run
 * starts a second short of the boss (`?startAt=`) at `?timeScale=4`. Every
 * sample reads all it needs in one `evaluate`; spacing is read from the boss's
 * own clock. The hero is kept far from the boss where a test must keep the
 * pack alive, so the hero's spells do not clear it.
 */

const START_AT_S = 1199;
const SCALE = '&timeScale=4&invulnerable=1';

type Report = NonNullable<GameScene['bossReport']>;

async function startRun(page: Page, query = SCALE): Promise<void> {
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

/**
 * One sample with the hero kept `distance` px from the boss (toward the middle
 * of the arena, so the world edge never clamps it); with `kill`, the pack is
 * killed in the same evaluate, so the cap never holds a cooldown test back.
 */
function sample(page: Page, distance: number, kill = false): Promise<Report | null> {
  return page.evaluate(
    async ({ scene, distance, kill }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (boss) g.placeHeroForTest(boss.x + (boss.x < 1500 ? distance : -distance), boss.y);
      if (kill) g.killSummonedForTest();
      return g.bossReport;
    },
    { scene: SCENE, distance, kill },
  );
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

/** The boss starts a summon wind-up now, with the hero `distance` px away. */
async function forceSummon(page: Page, distance: number): Promise<void> {
  const ok = await page.evaluate(
    async ({ scene, distance }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (!boss) return false;
      g.placeHeroForTest(boss.x + (boss.x < 1500 ? distance : -distance), boss.y);
      return g.skipBossToSkillForTest('summon');
    },
    { scene: SCENE, distance },
  );
  expect(ok).toBe(true);
}

test('bar 1 holds no summon', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  // Sample until three slams have landed (the boss clock, not wall time), keeping every summon count.
  let slams = 0;
  let summons = 0;
  let circles = 0;
  const deadline = Date.now() + 40_000;
  while (slams < 3 && Date.now() < deadline) {
    const s = await sample(page, 400);
    slams = s?.slam.slams ?? 0;
    summons = Math.max(summons, s?.summon.summons ?? 0);
    circles = Math.max(circles, s?.summon.circlesVisible ?? 0);
    await page.waitForTimeout(100);
  }
  console.log('bar 1 slams', slams, 'summons', summons, 'circles', circles);
  expect(slams).toBeGreaterThanOrEqual(3);
  expect(summons).toBe(0);
  expect(circles).toBe(0);
  expect(errors).toEqual([]);
});

test('a summon shows circles where the pack appears, then the pack lands there', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await forceSummon(page, 300);
  let seenCircles = 0;
  let windupSamples = 0;
  const bad: string[] = [];
  let last: Report | null = null;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    last = await sample(page, 300);
    if (!last) break;
    if (last.phase === 'windup' && last.skill === 'summon') {
      windupSamples += 1;
      seenCircles = Math.max(seenCircles, last.summon.circlesVisible);
      for (const p of last.summon.points) {
        const d = Math.hypot(p.x - last.x, p.y - last.y);
        // A circle clamped by the arena wall sits nearer than the ring; none sits farther.
        if (d > BOSS_SUMMON.ringRadius + 1e-6) bad.push(d.toFixed(2));
      }
      expect(last.summon.points.length).toBe(BOSS_SUMMON.packSize);
    }
    // Keep sampling past the landing, so a second summon would show.
    if (last.summon.summons >= 1 && last.phase !== 'skill' && last.phase !== 'windup') break;
    await page.waitForTimeout(50);
  }
  const sounds = (await readSounds(page)).filter((r) => r.key === 'boss.summon' && r.started);
  console.log(
    'windup samples',
    windupSamples,
    'max circles',
    seenCircles,
    'summon',
    JSON.stringify(last?.summon),
    'sounds',
    sounds.length,
  );
  expect(bad).toEqual([]);
  expect(seenCircles).toBe(BOSS_SUMMON.packSize);
  expect(last?.summon.summons).toBe(1);
  expect(last?.summon.log[0]).toMatchObject({ liveBefore: 0, spawned: BOSS_SUMMON.packSize });
  expect(last?.summon.spawned).toBe(BOSS_SUMMON.packSize);
  expect(last?.summon.liveSummoned).toBe(BOSS_SUMMON.packSize);
  expect(last?.summon.circlesVisible).toBe(0);
  expect(sounds).toHaveLength(last?.summon.summons ?? -1);
  expect(errors).toEqual([]);
});

test('the pack never passes the cap, and the boss still uses its other skills', async ({
  page,
}) => {
  test.setTimeout(55_000);
  const errors = collectErrors(page);
  await startRun(page);
  // Summons forced back to back with nothing killed: 5, 5, then none fit.
  let maxLive = 0;
  for (let i = 1; i <= 4; i += 1) {
    await forceSummon(page, 1000);
    const deadline = Date.now() + 15_000;
    let s: Report | null = null;
    while (Date.now() < deadline) {
      s = await sample(page, 1000);
      maxLive = Math.max(maxLive, s?.summon.liveSummoned ?? 0);
      if ((s?.summon.summons ?? 0) >= i) break;
      await page.waitForTimeout(50);
    }
    expect(s?.summon.summons).toBe(i);
  }
  const forced = (await report(page))?.summon;
  console.log('forced', JSON.stringify(forced), 'max live', maxLive);
  expect(maxLive).toBeLessThanOrEqual(BOSS_SUMMON.maxLive);
  // Every landing took what the cap left of the pack, however many the hero's spells had killed.
  for (const entry of forced?.log ?? []) {
    expect(entry.spawned).toBe(
      Math.max(0, Math.min(BOSS_SUMMON.packSize, BOSS_SUMMON.maxLive - entry.liveBefore)),
    );
  }
  expect(
    forced?.log.map((e) => e.liveBefore + e.spawned).every((n) => n <= BOSS_SUMMON.maxLive),
  ).toBe(true);

  // Natural play on bar 2 with the pack full or near it: a summon is never begun
  // at the cap, and slams and volleys keep coming.
  await breakBar(page);
  const before = await report(page);
  const startSlams = before?.slam.slams ?? 0;
  const startVolleys = before?.volley.volleys ?? 0;
  const startSummons = before?.summon.summons ?? 0;
  const startClock = before?.volley.clockS ?? 0;
  let last: Report | null = before;
  let cappedSamples = 0;
  const wd = Date.now() + 35_000;
  while (Date.now() < wd) {
    last = await sample(page, 1000);
    if (!last) break;
    maxLive = Math.max(maxLive, last.summon.liveSummoned);
    if (last.summon.liveSummoned >= BOSS_SUMMON.maxLive) cappedSamples += 1;
    if (last.volley.clockS - startClock >= 60) break;
    await page.waitForTimeout(100);
  }
  const natural = (last?.summon.log ?? []).slice(startSummons);
  const otherSkills =
    (last?.slam.slams ?? 0) - startSlams + ((last?.volley.volleys ?? 0) - startVolleys);
  console.log(
    'natural window',
    ((last?.volley.clockS ?? 0) - startClock).toFixed(1),
    's, capped samples',
    cappedSamples,
    'natural summons',
    JSON.stringify(natural),
    'other skills',
    otherSkills,
    'max live',
    maxLive,
  );
  expect(maxLive).toBeLessThanOrEqual(BOSS_SUMMON.maxLive);
  // A pick is blocked at the cap and kills only lower the count before it lands.
  for (const entry of natural) expect(entry.liveBefore).toBeLessThan(BOSS_SUMMON.maxLive);
  expect(otherSkills).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('the pack drops XP gems and no Embers or consumables', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await forceSummon(page, 150);
  // The pack lands and walks to the hero standing 150 px off.
  let landed: Report | null = null;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    landed = await sample(page, 150);
    if ((landed?.summon.liveSummoned ?? 0) > 0) break;
    await page.waitForTimeout(50);
  }
  expect(landed?.summon.liveSummoned).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  // One evaluate: the floor before, the pack killed through the real damage path, the floor after.
  const result = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const g = game.scene.getScene(scene.game) as GameScene;
    const before = { ...g.pickupReport, xp: { ...g.xpReport } };
    const killed = g.killSummonedForTest();
    const after = { ...g.pickupReport, xp: { ...g.xpReport } };
    return { before, killed, after };
  }, SCENE);
  const { before, after, killed } = result;
  console.log(
    'killed',
    killed,
    'gems',
    before.gems,
    '->',
    after.gems,
    'drops',
    before.drops,
    '->',
    after.drops,
    'embers',
    before.embers,
    '->',
    after.embers,
  );
  expect(killed).toBeGreaterThan(0);
  expect(after.gems - before.gems).toBe(killed);
  expect(after.drops).toBe(before.drops);
  expect(after.embers).toBe(before.embers);
  expect(after.consumables).toBe(before.consumables);
  expect(after.live).toEqual(before.live);
  expect(after.consumablesLive).toEqual(before.consumablesLive);
  // The hero stands where the pack fell, so the gems drift in and XP rises (or a level was gained).
  const key = (x: { level: number; xp: number }) => x.level * 1e9 + x.xp;
  await expect
    .poll(
      async () =>
        page.evaluate(async (scene) => {
          const { game } = await import('/src/main.ts');
          const { level, xp } = (game.scene.getScene(scene.game) as GameScene).xpReport;
          return level * 1e9 + xp;
        }, SCENE),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(key(before.xp));
  expect(errors).toEqual([]);
});

for (const toEnrage of [false, true]) {
  test(`summons keep their 14 s cooldown${toEnrage ? ', enraged too' : ''}`, async ({ page }) => {
    test.setTimeout(55_000);
    const errors = collectErrors(page);
    await startRun(page);
    await breakBar(page, toEnrage);
    expect((await report(page))?.enraged).toBe(toEnrage);

    const startClock = (await report(page))?.volley.clockS ?? 0;
    let last: Report | null = null;
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      // Hero 400 px out, where summon and volley are favoured; the pack is killed each sample.
      last = await sample(page, 400, true);
      if (!last || last.volley.clockS - startClock >= 120) break;
      await page.waitForTimeout(100);
    }
    const summons = last?.summon.log ?? [];
    const gaps = summons.slice(1).map((v, i) => v.atS - (summons[i]?.atS ?? 0));
    const spanS = (last?.volley.clockS ?? 0) - startClock;
    console.log(
      'boss clock sampled',
      spanS.toFixed(1),
      'summons',
      summons.length,
      'gaps',
      gaps.map((g) => g.toFixed(2)).join(','),
    );
    expect(summons.length).toBeGreaterThanOrEqual(2);
    expect(summons.length).toBeLessThanOrEqual(Math.floor(spanS / BOSS_SUMMON.cooldownS) + 1);
    expect(summons.every((s) => s.enraged === toEnrage && s.spawned === BOSS_SUMMON.packSize)).toBe(
      true,
    );
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(BOSS_SUMMON.cooldownS - 1e-6);
    expect(errors).toEqual([]);
  });
}
