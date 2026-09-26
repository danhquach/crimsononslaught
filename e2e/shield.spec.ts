import { expect, test, type Page } from '@playwright/test';
import { BASE_SHIELD_STATS, SHIELD_SPELL_IDS } from '../src/config/shields';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * #134 in the browser: a run carrying both shields, equipped through the
 * `?loadout=` test hook, with the player standing in a filling arena so real
 * contact damage lands on the pools rather than on their HP.
 *
 * What the pool does exactly — the split on an over-sized hit, the single
 * break, the return at the cooldown — is `core/shield.test.ts`'s. What only a
 * real run can show is that the one player-intake path really routes through
 * the shields, that they refill while the run goes on, and that the HUD is told
 * the same numbers the run holds.
 */

const PICKED: SpellId = 'ice';
/** One of each shield; the hook equips across elements, as `multiSpell` does. */
const EXTRA = SHIELD_SPELL_IDS;

/** What both pools hold together, straight from the spec's blocks. */
const TOTAL_POOL = BASE_SHIELD_STATS.ice_shield.shieldHp + BASE_SHIELD_STATS.earth_shield.shieldHp;

/**
 * The run starts at 2:00 (`?startAt=`), where fast enemies join and the crowd
 * presses a standing player within seconds.
 *
 * On the 20-minute table (#127) a run from 0:00 fills slowly. Steady contact
 * starts around 2:05, so a regrow inside the 150 s window this used came
 * either from one stray enemy touching the player around 1:10, or from a
 * lull in the first seconds of the crowd. On CI neither happened on some runs
 * (2026-09-23: first contact at 2:05, still draining at 2:35). From 2:00,
 * contact lands about 12 s into the window and the first regrow 28-39 s in
 * (native and 10 fps frames, measured 2026-09-23).
 */
const START_AT_S = 120;

/**
 * Run time sampled after the start, read off the HUD's timer rather than
 * budgeted in wall clock (#187). It ends at 4:00, before tanks join, with
 * about 3x the regrow time to spare.
 */
const RUN_MS = 120_000;
/** Sampling gives up after this much wall clock and asserts on what it saw. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** The pools as the run holds them and as the HUD was told, read together. */
interface Sample {
  pool: number;
  max: number;
  hudPool: number;
  hudMax: number;
  /** Both shields' running totals so far (#260). */
  absorbed: number;
  regrown: number;
}

/**
 * Both are read in one `evaluate`, so they are the same instant: the run
 * publishes the pool at the end of its own `update` and the HUD applies it
 * there and then, which is what makes comparing them exactly meaningful.
 */
function sample(page: Page): Promise<Sample | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    const report = (game.scene.getScene(scene.game) as GameScene).shieldReport;
    const hud = (game.scene.getScene(scene.hud) as HudScene).view;
    return {
      pool: report.reduce((total, shield) => total + shield.pool, 0),
      max: report.reduce((total, shield) => total + shield.max, 0),
      hudPool: hud.shield,
      hudMax: hud.shieldMax,
      absorbed: report.reduce((total, shield) => total + shield.absorbed, 0),
      regrown: report.reduce((total, shield) => total + shield.regrown, 0),
    };
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

test('shields soak real contact damage and grow back over a run', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(`/?seed=1&timeScale=10&startAt=${START_AT_S}&loadout=${EXTRA.join(',')}`);
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

  // Both are up at full pool from the first frame, before anything has hit.
  const atStart = await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(gameKey) as GameScene).shieldReport;
  }, SCENE.game);
  expect(atStart.map((shield) => shield.id)).toEqual([...EXTRA]);
  for (const shield of atStart) {
    expect(shield.up, `${shield.id} at spawn`).toBe(true);
    expect(shield.pool, `${shield.id} at spawn`).toBe(shield.max);
  }
  expect(atStart.reduce((total, shield) => total + shield.max, 0)).toBe(TOTAL_POOL);

  // Sampled through the run so the HUD is checked against it at many points.
  // The run may end inside the window — the player is standing still — so the
  // loop stops when it does and everything below is asserted on what was seen.
  const trace: Sample[] = [];
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  while (runMs < START_AT_S * 1000 + RUN_MS && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) break;
    trace.push(current);
    runMs = (await readHud(page)).elapsedMs;
    await page.waitForTimeout(SAMPLE_MS);
  }
  expect(trace.length, 'samples taken while the run was live').toBeGreaterThan(10);

  // Counted by the shields themselves, so a pool that drained and refilled
  // between two polls still shows: main CI once took 25 samples and saw no
  // regrow among them (#260). The last sample holds the totals for the run.
  const last = trace[trace.length - 1];
  // Contact damage really reached the pools: the arena filled and the player
  // was standing in it, so something must have been absorbed.
  expect(last?.absorbed, 'damage the pools absorbed').toBeGreaterThan(0);
  // And the pools grew back, by a recharge or a broken shield returning.
  expect(last?.regrown, `pool never regrew across ${trace.length} samples`).toBeGreaterThan(0);

  // The HUD was told, and by the run's own numbers — it never reads GameScene.
  for (const [i, s] of trace.entries()) {
    expect(s.max, `max at sample ${i}`).toBe(TOTAL_POOL);
    expect(s.hudMax, `HUD max at sample ${i}`).toBe(TOTAL_POOL);
    expect(s.hudPool, `HUD pool at sample ${i}`).toBe(s.pool);
  }

  expect(errors).toEqual([]);
});
