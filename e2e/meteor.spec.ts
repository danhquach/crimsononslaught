import { expect, test, type Page } from '@playwright/test';
import { MAX_LIVE_TELEGRAPHS } from '../src/config/fx';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import {
  BASE_METEOR_STATS,
  METEOR_CLIP,
  METEOR_FALL_PX,
  METEOR_POND_LOOK,
  STRIKE_SPELL_IDS,
} from '../src/config/strikes';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, MIN_FPS, startFromIntro, waitForScene } from './game';

/**
 * #138 in the browser: a run carrying Meteor, equipped through the `?loadout=`
 * test hook, in a filling arena so the strikes have a crowd to fall on.
 *
 * When a strike lands exactly, where it lands, who it reaches and how hard are
 * `core/skyStrike.test.ts`'s. What only a real run can show is that casts reach
 * the pool, that each strike is a meteor drawn falling along its path onto the
 * point with nothing on the ground first (CO-167), that it comes off the pool
 * when it lands rather than piling up, that the landings hit live enemies
 * harder near the centre, that each leaves a pond that burns the crowd and
 * goes, that the cap holds in a scaled run, and that the frame rate survives
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

/**
 * How far a meteor may be drawn from where its fall says it is, in px: the
 * sprite is placed on the run clock's step, so only float noise separates them.
 */
const PATH_TOLERANCE_PX = 1;

type Report = GameScene['strikeReport'];

/**
 * The report and the run time, read in one evaluate so both describe the same
 * step of a running game (#198).
 */
async function sample(page: Page): Promise<{ report: Report; elapsedMs: number } | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    return {
      report: (game.scene.getScene(scene.game) as GameScene).strikeReport,
      elapsedMs: (game.scene.getScene(scene.hud) as HudScene).view.elapsedMs,
    };
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

test('meteors fall onto a point, blast the crowd and leave a pond that burns and goes', async ({
  page,
}) => {
  const errors = collectErrors(page);

  // Invulnerable, so the window is spent watching strikes rather than possibly
  // ending early on a player who is standing still in a filling arena.
  await page.goto(`/?seed=1&timeScale=10&invulnerable=1&loadout=${EXTRA.join(',')}`);
  await startFromIntro(page);
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
    trace.push(current.report);
    runMs = current.elapsedMs;
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
  // offer decides how thick the crowd gets, and a run that draws Fire Wave
  // early clears it to about one enemy per strike. About a third of landings
  // hit nothing on either build — the primary spell often kills the target
  // during the fall.
  expect(last?.hits, 'enemies hit by landings').toBeGreaterThan(0);
  expect(last?.widest, 'most enemies one landing hit').toBeGreaterThan(1);

  const counts = trace.map((report) => report.live.length);
  const mostAtOnce = Math.max(...counts);
  // A meteor was seen in the air at some sample: a 1 s fall at 10x run time is
  // 100 ms of wall time, the sampling interval.
  expect(mostAtOnce, 'meteors in the air at once').toBeGreaterThan(0);
  expect(mostAtOnce, 'the pool cap holds').toBeLessThanOrEqual(MAX_LIVE_TELEGRAPHS);
  // They come down: far more were committed than were ever up together, which
  // only landings can produce.
  expect(last?.committed, 'committed vs ever up at once').toBeGreaterThan(mostAtOnce);

  // CO-167: every strike in the air is the meteor itself, drawn on its path
  // into the point, up and to the left of it and as far back as the fall has
  // left to run — so nothing is drawn on the point until it lands. Haste may
  // shorten a later fall, so each is held to its own `fallS`.
  const distances: number[] = [];
  for (const [i, report] of trace.entries()) {
    for (const meteor of report.live) {
      const at = `sample ${i}`;
      expect(meteor.radius, `radius at ${at}`).toBeGreaterThanOrEqual(SMALLEST_RADIUS);
      // Only ever reported while it still has fall left; one at 0 would be a
      // strike the pool failed to land.
      expect(meteor.remainingS, `fall left at ${at}`).toBeGreaterThan(0);
      expect(meteor.remainingS, `fall left at ${at}`).toBeLessThanOrEqual(meteor.fallS);
      expect(meteor.fallS, `fall at ${at}`).toBeLessThanOrEqual(BASE_METEOR_STATS.fallDelay);
      expect(meteor.clip, `meteor art at ${at}`).toBe(METEOR_CLIP);
      expect(meteor.visible, `meteor shown at ${at}`).toBe(true);
      const distance = Math.hypot(meteor.x - meteor.drawnX, meteor.y - meteor.drawnY);
      const expected = (METEOR_FALL_PX * meteor.remainingS) / meteor.fallS;
      expect(Math.abs(distance - expected), `meteor on its path at ${at}`).toBeLessThanOrEqual(
        PATH_TOLERANCE_PX,
      );
      expect(meteor.drawnX, `comes from the left at ${at}`).toBeLessThan(meteor.x);
      expect(meteor.drawnY, `comes from above at ${at}`).toBeLessThan(meteor.y);
      distances.push(distance);
    }
  }
  // Seen at different points of their falls, not parked: a meteor moves.
  expect(new Set(distances.map((d) => Math.round(d))).size, 'distinct fall points').toBeGreaterThan(
    1,
  );

  // The blast falls off: an enemy in the inner half of the reach takes more
  // than one in the outer half, on average (both before crits).
  const { spread } = last ?? { spread: null };
  expect(spread?.innerHits, 'blast hits in the inner half').toBeGreaterThan(0);
  expect(spread?.outerHits, 'blast hits in the outer half').toBeGreaterThan(0);
  const innerMean = (spread?.innerDamage ?? 0) / (spread?.innerHits || 1);
  const outerMean = (spread?.outerDamage ?? 0) / (spread?.outerHits || 1);
  expect(innerMean, 'inner vs outer blast damage').toBeGreaterThan(outerMean);

  // Each landing leaves a pond on its point, drawn with its own art and no
  // ring, that burns the crowd. A pond is matched to a meteor seen falling
  // onto the same point, so it is the one that landing left.
  const points = new Set(trace.flatMap((r) => r.live.map((m) => `${m.x},${m.y}`)));
  const ponds = trace.flatMap((r) => r.ponds);
  expect(last?.pondsPlaced, 'ponds placed').toBeGreaterThan(0);
  expect(last?.pondsPlaced, 'ponds never outnumber landings').toBeLessThanOrEqual(
    last?.landed ?? 0,
  );
  expect(ponds.length, 'pond samples').toBeGreaterThan(0);
  for (const pond of ponds) {
    expect(pond.clip).toBe(METEOR_POND_LOOK.clip);
    expect(pond.ringShown, 'the pond has no ring').toBe(false);
    expect(pond.radius).toBeGreaterThanOrEqual(BASE_METEOR_STATS.pondRadius);
    expect(pond.remainingS, 'a pond is gone once it runs out').toBeGreaterThan(0);
  }
  const onPoints = ponds.filter((pond) => points.has(`${pond.x},${pond.y}`)).length;
  expect(onPoints, 'ponds on a point a meteor was seen falling onto').toBeGreaterThan(0);
  expect(last?.pondHits, 'enemies burned by ponds').toBeGreaterThan(0);
  // The ponds go: far more were placed than were ever on the ground together.
  const pondsAtOnce = Math.max(...trace.map((r) => r.ponds.length));
  expect(last?.pondsPlaced, 'placed vs ever down at once').toBeGreaterThan(pondsAtOnce);
  // Logged, not asserted: the 0.3 s fade is 30 ms of wall time at 10x, under
  // the sampling interval, so a sample inside it is luck (the fade itself is
  // `fadeOutAlpha`'s unit test).
  const fading = ponds.filter((pond) => (pond.artAlpha ?? 1) < 1).length;

  // Counts, for comparing runs (small-area sampling, CO-167).
  console.log(
    `meteor: committed ${last?.committed}, landed ${last?.landed}, hits ${last?.hits}, ` +
      `widest ${last?.widest}, air samples ${distances.length}, inner ${spread?.innerHits} ` +
      `(${innerMean.toFixed(1)}), outer ${spread?.outerHits} (${outerMean.toFixed(1)}), ` +
      `ponds ${last?.pondsPlaced}, pond samples ${ponds.length} (on points ${onPoints}, ` +
      `fading ${fading}, most at once ${pondsAtOnce}), pond hits ${last?.pondHits}`,
  );

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
