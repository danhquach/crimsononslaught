import { expect, test, type Page } from '@playwright/test';
import { MAX_LIVE_TELEGRAPHS } from '../src/config/fx';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { BASE_METEOR_STATS, STRIKE_SPELL_IDS } from '../src/config/strikes';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, readHud, waitForScene } from './game';

/**
 * #138 in the browser: a run carrying Meteor, equipped through the `?loadout=`
 * test hook, in a filling arena so the strikes have a crowd to fall on.
 *
 * When a strike lands exactly, where it lands and who it reaches are
 * `core/skyStrike.test.ts`'s. What only a real run can show is that casts reach
 * the pool, that a telegraph holds on the ground for the fall and comes off it
 * when the strike lands rather than piling up, that the landings hit live
 * enemies, that the cap holds in a scaled run, and that the frame rate survives
 * it all (spec §11).
 */

const PICKED: SpellId = 'fire';
const EXTRA = STRIKE_SPELL_IDS;

/**
 * The smallest blast a strike can telegraph. Expanse is the only passive that
 * reaches `aoeRadius` and it multiplies above 1, so a live telegraph is never
 * smaller than its base block.
 */
const SMALLEST_RADIUS = BASE_METEOR_STATS.aoeRadius;

/**
 * The window is budgeted in run time, read off the HUD's timer, not in wall
 * clock (#187). It used to be 10 s of wall clock at 10x, which a developer
 * machine turns into 112-116 s of run and the CI runner into only 100-108 s.
 * Now every machine samples the same 115 s stretch of run. That alone did not
 * fix the crowd check (see the note on it below): the run was not too short,
 * the build was different.
 */
const RUN_MS = 115_000;
/** A runner too slow to reach `RUN_MS` in this much wall clock fails outright. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** The floor the frame rate must hold at, the same one `groundArea` uses. */
const MIN_FPS = 20;

type Report = GameScene['strikeReport'];

async function sample(page: Page): Promise<Report | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    return (game.scene.getScene(scene.game) as GameScene).strikeReport;
  }, SCENE);
}

/** A level-up pauses the run under its overlay; the first card resumes it. */
async function answerLevelUp(page: Page): Promise<void> {
  const paused = await page.evaluate(async (levelUpKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(levelUpKey);
  }, SCENE.levelUp);
  if (paused) await page.keyboard.press('1');
}

test('meteors telegraph a point, hold for the fall and land on the crowd', async ({ page }) => {
  const errors = collectErrors(page);

  // Invulnerable, so the window is spent watching strikes rather than possibly
  // ending early on a player who is standing still in a filling arena.
  await page.goto(`/?seed=1&timeScale=10&invulnerable=1&loadout=${EXTRA.join(',')}`);
  await waitForScene(page, SCENE.spellSelect);

  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const equipped = await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(gameKey) as GameScene).equippedSpellIds;
  }, SCENE.game);
  expect(equipped).toEqual([PICKED, ...EXTRA]);

  // Sampled through the run rather than only at the end: a telegraph that
  // appeared and landed in between would leave no trace in a final reading.
  const trace: Report[] = [];
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  while (runMs < RUN_MS && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) break;
    trace.push(current);
    runMs = (await readHud(page)).elapsedMs;
    await page.waitForTimeout(SAMPLE_MS);
  }
  expect(trace.length, 'samples taken while the run was live').toBeGreaterThan(10);
  expect(runMs, 'run time the window covered').toBeGreaterThanOrEqual(RUN_MS);

  const last = trace[trace.length - 1];
  // A 4 s cooldown over ~115 s of run: many strikes committed.
  expect(last?.committed, 'strikes committed over the run').toBeGreaterThan(10);
  // Every strike lands, one fall after it is committed; only the one in the
  // air at the last sample may be outstanding.
  expect(last?.landed, 'strikes landed').toBeGreaterThan(0);
  expect(last?.landed, 'landed never exceeds committed').toBeLessThanOrEqual(last?.committed ?? 0);
  expect(
    (last?.committed ?? 0) - (last?.landed ?? 0),
    'strikes still in the air at the end',
  ).toBeLessThanOrEqual(MAX_LIVE_TELEGRAPHS);
  // And the landings hit live enemies, more than one at a time: the blast is an
  // area, so a landing reaches the crowd around its mark, not only the enemy it
  // was aimed at. Not an average per strike (#187): which cards the level-ups
  // offer decides how thick the crowd gets, and a run that draws Fire Column
  // early clears it to about one enemy per strike. About a third of landings
  // hit nothing on either build — the primary spell often kills the target
  // during the fall.
  expect(last?.hits, 'enemies hit by landings').toBeGreaterThan(0);
  expect(last?.widest, 'most enemies one landing hit').toBeGreaterThan(1);

  const counts = trace.map((report) => report.live.length);
  const mostAtOnce = Math.max(...counts);
  // A telegraph was seen holding on the ground at some sample: a 1 s fall at
  // 10x run time is 100 ms of wall time, the sampling interval.
  expect(mostAtOnce, 'telegraphs on the ground at once').toBeGreaterThan(0);
  expect(mostAtOnce, 'the pool cap holds').toBeLessThanOrEqual(MAX_LIVE_TELEGRAPHS);
  // They come off the ground: far more were committed than were ever up
  // together, which only landings can produce.
  expect(last?.committed, 'committed vs ever up at once').toBeGreaterThan(mostAtOnce);

  for (const [i, report] of trace.entries()) {
    for (const telegraph of report.live) {
      expect(telegraph.radius, `radius at sample ${i}`).toBeGreaterThanOrEqual(SMALLEST_RADIUS);
      // A telegraph is only ever reported while it still has fall left; one at
      // 0 would be a strike the pool failed to land.
      expect(telegraph.remainingS, `fall left at sample ${i}`).toBeGreaterThan(0);
      expect(telegraph.remainingS, `fall left at sample ${i}`).toBeLessThanOrEqual(
        BASE_METEOR_STATS.fallDelay,
      );
    }
  }

  // Spec §11: the strikes fall on a full arena and the run still draws.
  const arena = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    const gameScene = game.scene.getScene(scene.game) as GameScene;
    return { fps: game.loop.actualFps, enemies: gameScene.liveEnemyCount };
  }, SCENE);
  expect(arena).not.toBeNull();
  expect(arena?.enemies, 'enemies alive at the reading').toBeGreaterThan(0);
  expect(arena?.fps, `fps over ${arena?.enemies} enemies`).toBeGreaterThan(MIN_FPS);

  expect(errors).toEqual([]);
});
