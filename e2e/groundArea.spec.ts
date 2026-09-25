import { expect, test, type Page } from '@playwright/test';
import { AREA_SPELL_IDS, BASE_AREA_STATS } from '../src/config/areas';
import { MAX_LIVE_AREAS } from '../src/config/fx';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * #135 in the browser: a run carrying both ground areas, equipped through the
 * `?loadout=` test hook, in a filling arena so the patches land on real crowds.
 *
 * What a patch does exactly — the tick count over a lifetime, who is inside it,
 * the expiry on the edge — is `core/groundArea.test.ts`'s. What only a real run
 * can show is that casts reach the pool, that the patches tick live enemies,
 * that they come off the ground when their duration is up rather than piling up
 * over a whole run, that a scaled run holds the cap, and that the frame rate
 * survives several patches overlap-testing a full arena every tick (spec §11).
 */

const PICKED: SpellId = 'ice';
/** One of each; the hook equips across elements, as `multiSpell` does. */
const EXTRA = AREA_SPELL_IDS;

/**
 * The smallest patch a cast can produce. Expanse and Persistence are the only
 * passives that reach `radius` and `duration`, and both are multipliers above
 * 1, so a live patch is never smaller or shorter than its base block.
 */
const SMALLEST_RADIUS = Math.min(...AREA_SPELL_IDS.map((id) => BASE_AREA_STATS[id].radius));

/**
 * The window is 100 s of run, read off the HUD's timer rather than budgeted in
 * wall clock (#187, #190), so a slow runner covers the same stretch of run as a
 * fast one.
 */
const RUN_MS = 100_000;
/** A runner too slow to reach `RUN_MS` in this much wall clock fails outright. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;
/** The quake-only run: long enough for three casts on a 14 s cooldown. */
const QUAKE_RUN_MS = 150_000;

/**
 * The floor the frame rate must hold at with patches on the ground, the same
 * one `multiSpell` uses: far below the 60 fps a desktop holds, because the
 * check is for a collapse — a pool thrashing, a leak, a membership test gone
 * quadratic — and not for a tuned number on a slow CI runner.
 */
const MIN_FPS = 20;

type Report = GameScene['areaReport'];

function sample(page: Page): Promise<Report | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    return (game.scene.getScene(scene.game) as GameScene).areaReport;
  }, SCENE);
}

/** Answer any level-up overlay with its first card, so the run never sits paused. */
async function answerLevelUp(page: Page): Promise<void> {
  const paused = await page.evaluate(async (levelUpKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(levelUpKey);
  }, SCENE.levelUp);
  if (paused) await page.keyboard.press('1');
}

test('ground areas land on the crowd, tick it and come off the ground', async ({ page }) => {
  const errors = collectErrors(page);

  // Invulnerable, so the window is spent watching patches rather than possibly
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

  // Sampled through the run rather than only at the end: patches that were
  // placed and expired in between would leave no trace in a final reading.
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
  // Both spells cast several times over 100 s of run (12 s and 14 s cooldowns).
  expect(last?.placed, 'patches placed over the run').toBeGreaterThan(4);
  // And the patches found enemies to tick: a 6-8 s patch at two ticks a second
  // in a filling arena is worth many times its own tick count.
  expect(last?.hits, 'enemy-ticks paid out').toBeGreaterThan(last?.placed ?? 0);

  const counts = trace.map((report) => report.live.length);
  const mostAtOnce = Math.max(...counts);
  expect(mostAtOnce, 'patches on the ground at once').toBeGreaterThan(0);
  // They come off the ground: more were placed over the run than were ever up
  // together, which only expiry can produce. Asserting on an empty sample
  // instead would ride on the cooldowns staying longer than the durations,
  // which a Haste or a Persistence taken at a level-up can undo.
  expect(last?.placed, 'patches placed vs ever up at once').toBeGreaterThan(mostAtOnce);
  expect(mostAtOnce, 'the pool cap holds').toBeLessThanOrEqual(MAX_LIVE_AREAS);

  for (const [i, report] of trace.entries()) {
    for (const area of report.live) {
      expect(area.radius, `radius at sample ${i}`).toBeGreaterThanOrEqual(SMALLEST_RADIUS);
      // A patch is only ever reported while it still has lifetime left; one at
      // 0 would be a patch the pool failed to take off the ground.
      expect(area.remainingS, `lifetime at sample ${i}`).toBeGreaterThan(0);
      // #179: the ring, and the art under it when there is some, is drawn at
      // exactly the radius that ticks, whatever the art's frame measures.
      expect(Math.abs(area.drawnRadius - area.radius), `ring at sample ${i}`).toBeLessThan(1);
      if (area.artRadius !== null) {
        expect(Math.abs(area.artRadius - area.radius), `art at sample ${i}`).toBeLessThan(1);
        expect(area.artOffset, `art on its ring at sample ${i}`).toBeLessThan(1);
      }
    }
  }

  // Ice Storm is layered (#219) and draws no single clip; Earthquake is its
  // fissures with no ring (#220), spanning the radius that ticks (checked above).
  const clips = new Set(trace.flatMap((report) => report.live.map((area) => area.clip)));
  expect([...clips].sort(), 'art the patches were drawn with').toEqual(['earth.quakeRift', null]);
  const quakes = trace.flatMap((report) =>
    report.live.filter((area) => area.clip === 'earth.quakeRift'),
  );
  for (const quake of quakes) expect(quake.ringShown, 'a quake hides the ring').toBe(false);

  // #219: Ice Storm is drawn as sleet over the crowd with no ring and no
  // drawn edge: every piece that can be seen is inside the radius that ticks,
  // the sleet is thick while the storm rages, and shards burst a few at a time.
  const storms = trace.flatMap((report) => report.live.filter((area) => area.storm !== null));
  expect(storms.length, 'storm samples').toBeGreaterThan(0);
  for (const { storm, radius, ringShown } of storms) {
    expect(ringShown, 'a storm hides the ring').toBe(false);
    expect(storm?.reach ?? 0, 'sleet seen inside the storm only').toBeLessThanOrEqual(radius);
    expect(storm?.brightest ?? 0).toBeLessThanOrEqual(1);
    expect(storm?.shards ?? 0, 'shards bursting at once').toBeLessThanOrEqual(3);
  }
  expect(
    Math.max(...storms.map((area) => area.storm?.sleet ?? 0)),
    'sleet in the air',
  ).toBeGreaterThan(10);
  expect(
    Math.max(...storms.map((area) => area.storm?.brightest ?? 0)),
    'sleet seen',
  ).toBeGreaterThan(0.5);
  expect(Math.max(...storms.map((area) => area.storm?.shards ?? 0)), 'shards seen').toBeGreaterThan(
    0,
  );

  // #219: a slowed enemy keeps its own colours under a light tint, whichever
  // spell slowed it; only a freeze paints it solid. The hit flash and a stun
  // fill it for their own reasons, so those samples are left out. Ice Arrow
  // and both areas slow, so a run holds many of these; the storm's own, at
  // radius 80, are only a few, so every one is checked but none is required.
  const chilled = trace.flatMap((report) =>
    report.tints.filter((e) => e.slowed && !e.frozen && !e.stunned && !e.flashing),
  );
  expect(chilled.length, 'slowed enemies sampled').toBeGreaterThan(0);
  for (const enemy of chilled) {
    const where = enemy.inStorm ? 'in a storm' : 'outside a storm';
    expect(enemy.tinted, `a slowed enemy ${where} is tinted`).toBe(true);
    expect(enemy.tintFill, `a slowed enemy ${where} is not filled solid`).toBe(false);
  }

  // Spec §11: the patches tick against a full arena and the run still draws.
  const arena = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    const gameScene = game.scene.getScene(scene.game) as GameScene;
    return {
      fps: game.loop.actualFps,
      enemies: gameScene.liveEnemyCount,
      areas: gameScene.areaReport.live.length,
    };
  }, SCENE);
  expect(arena).not.toBeNull();
  // An fps reading on an empty arena, or with nothing on the ground, would
  // prove nothing about what the patches cost.
  expect(arena?.enemies, 'enemies alive at the reading').toBeGreaterThan(0);
  expect(
    arena?.fps,
    `fps with ${arena?.areas} patches over ${arena?.enemies} enemies`,
  ).toBeGreaterThan(MIN_FPS);

  expect(errors).toEqual([]);
});

test('an earthquake staggers what stands in it, never slows it, and leaves its colours', async ({
  page,
}) => {
  const errors = collectErrors(page);

  // Earth alone: level-ups offer only the run's own element (spec §7.1), and
  // nothing on Earth slows or staggers but the quake, so any slow is a bug and
  // every stagger is the quake's.
  await page.goto(`/?seed=1&timeScale=10&invulnerable=1&loadout=earth_quake`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('earth'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  // Each tint is read with its status in the one `areaReport` (#198), so a
  // stagger that ends between two reads cannot pair with a later tint.
  const tints: Report['tints'] = [];
  let staggers = 0;
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  while (runMs < QUAKE_RUN_MS && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) break;
    tints.push(...current.tints);
    staggers = current.staggers;
    runMs = (await readHud(page)).elapsedMs;
    await page.waitForTimeout(SAMPLE_MS);
  }
  expect(runMs, 'run time the window covered').toBeGreaterThanOrEqual(QUAKE_RUN_MS);

  expect(
    tints.filter((e) => e.slowed),
    'slowed enemies',
  ).toEqual([]);
  // Counted where the tick applies it, so only enemies inside a quake. A poll
  // rarely catches a 0.2 s stagger in an 80-radius patch: main CI saw an enemy
  // in a patch 5 times in 26 polls, and none of them staggered.
  expect(staggers, 'staggers applied inside a quake').toBeGreaterThan(0);
  const staggered = tints.filter((e) => e.staggered);
  // A stagger has no tint of its own: the overlay marks it. A stun and the
  // hit flash fill the sprite for their own reasons, so those are left out.
  for (const enemy of staggered.filter((e) => !e.stunned && !e.flashing)) {
    expect(enemy.tinted, 'a staggered enemy is not tinted').toBe(false);
  }

  expect(errors).toEqual([]);
});
