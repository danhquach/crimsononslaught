import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #126 in the browser: ranged enemies join the waves at 6:00 and shoot a
 * player who stands still. What the enemy does exactly — where it stands, when
 * it fires — is `core/rangedEnemy.test.ts`'s. What only a real run can show is
 * that the wave table brings them in, their shots fly, the player overlap is
 * wired, and a hit goes down the one damage path to the HP the HUD shows.
 *
 * `?enemies=ranged` keeps the melee types out. With them in, the crowd reaches
 * a standing player about when the first shots do, and from then on its
 * touches keep the player inside the 0.5 s immunity window, so no shot can
 * take HP (2026-09-26: 13 shot hits, 0 HP lost, on 3 of 6 local runs). Ranged
 * enemies keep their distance, so every HP lost here is a shot's.
 */

const PICKED: SpellId = 'fire';

/** 6:00, the first row with ranged enemies in it. */
const START_AT_S = 360;

/** Run time sampled after the start; read off the HUD's timer, not wall clock (#187). */
const RUN_MS = 90_000;
/** Sampling gives up after this much wall clock and asserts on what it saw. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

interface Sample {
  elapsedMs: number;
  ranged: number;
  live: number;
  cap: number;
  hits: number;
  hpLost: number;
  clips: string[];
  hudHp: number;
  hudMaxHp: number;
}

/**
 * The run's shot report and the HUD's HP, read in one evaluate so they agree.
 * `paused` when an overlay went up since `answerLevelUp` looked; null once
 * the run has ended.
 */
function sample(page: Page): Promise<Sample | 'paused' | null> {
  return page.evaluate(async (keys) => {
    const { game } = await import('/src/main.ts');
    if (game.scene.isPaused(keys.game)) return 'paused' as const;
    if (!game.scene.isActive(keys.game)) return null;
    const report = (game.scene.getScene(keys.game) as GameScene).enemyShotReport;
    const hud = (game.scene.getScene(keys.hud) as HudScene).view;
    return { ...report, elapsedMs: hud.elapsedMs, hudHp: hud.hp, hudMaxHp: hud.maxHp };
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

test('ranged enemies shoot a standing player and the hits cost HP', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(`/?seed=1&timeScale=10&startAt=${START_AT_S}&enemies=ranged`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);

  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  // Stop once a shot has taken HP and a glob has been seen in flight; the rest
  // of the run proves nothing more. Clips are read per sample, so a shot can
  // fly and land between two of them: the first hit alone came 3 samples in on
  // CI, with no glob seen on one run (#277).
  const trace: Sample[] = [];
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  let runLeft = false;
  let shotSeen = false;
  while (runMs < START_AT_S * 1000 + RUN_MS && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (current === 'paused') continue;
    if (!current) {
      runLeft = true;
      break;
    }
    trace.push(current);
    runMs = current.elapsedMs;
    shotSeen ||= current.clips.includes('ranged.shot');
    if (current.hpLost > 0 && shotSeen) break;
    await page.waitForTimeout(SAMPLE_MS);
  }
  const last = trace[trace.length - 1];
  const most = (pick: (t: Sample) => number): number => Math.max(0, ...trace.map(pick));
  console.log(
    `ranged e2e: ${trace.length} samples to ${Math.round(runMs)} ms; most ranged ${most((t) => t.ranged)}, ` +
      `most shots ${most((t) => t.live)}; hits ${last?.hits}, hp lost ${last?.hpLost}, hud ${last?.hudHp}; ` +
      `clips ${[...new Set(trace.flatMap((t) => t.clips))].join(',')}`,
  );
  expect(runLeft, 'the run was still live when sampling stopped').toBe(false);
  expect(trace.length, 'samples taken while the run was live').toBeGreaterThan(0);

  expect(
    most((t) => t.ranged),
    'ranged enemies on the field',
  ).toBeGreaterThan(0);
  expect(last?.hits, 'shots that touched the player').toBeGreaterThan(0);
  expect(last?.hpLost, 'HP the shots took').toBeGreaterThan(0);
  // Nothing else here deals damage, so the HUD is down by what the shots took,
  // read in the same step as the report.
  expect(last?.hudHp).toBeLessThan(last?.hudMaxHp ?? 0);
  expect((last?.hudMaxHp ?? 0) - (last?.hudHp ?? 0)).toBe(last?.hpLost);
  // Both draw from their own sheet (CO-104): the spitter's clips and the glob's.
  const clips = new Set(trace.flatMap((t) => t.clips));
  expect(
    [...clips].filter((clip) => clip.startsWith('ranged.')),
    'clips drawn',
  ).toEqual(expect.arrayContaining(['ranged.move', 'ranged.shot']));
  // The pool never grows past its cap.
  for (const t of trace) expect(t.live, `shots at ${t.elapsedMs} ms`).toBeLessThanOrEqual(t.cap);
  expect(errors).toEqual([]);
});
