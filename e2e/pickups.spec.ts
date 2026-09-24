import { expect, test, type Page } from '@playwright/test';
import { MAX_LIVE_PICKUPS, RELIC_COUNT } from '../src/config/pickups';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #195 in the browser: the relics are on the floor when the run starts, and
 * Embers dropped by the crowd are picked up and counted on the HUD.
 *
 * What drops, how often, and where relics may go are `core/pickups.test.ts`'s.
 * What only a real run shows is that the pool, the overlap and the HUD are
 * wired together: a drop reaches the floor, the player collects it, and the
 * count the HUD shows is the run's own.
 *
 * The run starts at 4:00 (`?startAt=240`), where tanks join the waves and
 * always drop 3 Embers, and the player is invulnerable, so the crowd dies at
 * its feet, inside the pickup radius, without anyone steering.
 */

const PICKED: SpellId = 'fire';
const START_AT_S = 240;

/** Budgeted in run time, read off the HUD's timer, so every machine samples the same stretch (#187). */
const RUN_MS = 60_000;
/** A runner too slow to reach `RUN_MS` in this much wall clock fails outright. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 200;

type Report = GameScene['pickupReport'];

interface Sample {
  report: Report;
  hudEmbers: number;
  elapsedMs: number;
}

/**
 * The run's report and the HUD, read in one `evaluate` so they are the same
 * instant. Read in two, the run moves between them, and on CI the HUD was
 * already 3 Embers ahead of the report it was checked against.
 */
async function sample(page: Page): Promise<Sample | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    const report = (game.scene.getScene(scene.game) as GameScene).pickupReport;
    const hud = (game.scene.getScene(scene.hud) as HudScene).view;
    return { report, hudEmbers: hud.embers, elapsedMs: hud.elapsedMs };
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

test('relics lie in the arena at start and collected Embers count up on the HUD', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto(`/?seed=1&timeScale=10&invulnerable=1&startAt=${START_AT_S}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);

  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const first = await sample(page);
  expect(first?.report.live.relic, 'relics on the floor at start').toBe(RELIC_COUNT);
  expect(first?.report.relics, 'relics picked up at start').toBe(0);

  const trace: Sample[] = [];
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  while (runMs < START_AT_S * 1000 + RUN_MS && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) break;
    trace.push(current);
    runMs = current.elapsedMs;
    await page.waitForTimeout(SAMPLE_MS);
  }
  expect(trace.length, 'samples taken while the run was live').toBeGreaterThan(10);
  expect(runMs, 'run time the window covered').toBeGreaterThanOrEqual(START_AT_S * 1000 + RUN_MS);

  const last = trace[trace.length - 1];
  expect(last?.hudEmbers, 'Embers on the HUD at the end').toBeGreaterThan(0);
  // The HUD shows the run's own count, and it only ever goes up.
  expect(last?.hudEmbers).toBe(last?.report.embers);
  const counts = trace.map((t) => t.hudEmbers);
  counts.slice(1).forEach((count, i) => expect(count).toBeGreaterThanOrEqual(counts[i] ?? 0));
  // The cap held throughout. With the floor under the cap nothing is credited
  // past it, so every Ember counted above was a pickup collected off the floor.
  // Whether one is still lying there at a sample is the build's business: a
  // run whose level-ups widen the pickup radius takes each drop the moment it
  // lands.
  const floor = trace.map((t) => t.report.live.ember + t.report.live.consumable);
  expect(Math.max(...floor), 'the drop cap holds').toBeLessThan(MAX_LIVE_PICKUPS);
  // And the pool's own count of drops, the one the cap is checked against,
  // never drifts from what is really on the floor.
  expect(trace.map((t) => t.report.drops)).toEqual(floor);
  // Nobody steers, so the player never walks the 400 px out to a relic.
  expect(last?.report.live.relic).toBe(RELIC_COUNT);
  expect(errors).toEqual([]);
});
