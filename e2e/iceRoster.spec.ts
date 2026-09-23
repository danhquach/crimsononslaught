import { expect, test, type Page } from '@playwright/test';
import { ICE_ROSTER_SPELL_IDS } from '../src/config/iceRoster';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { MAX_LIVE_BOMBS } from '../src/core/frostNova';
import { MAX_LIVE_ARROWS } from '../src/core/iceArrow';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, readHud, waitForScene } from './game';

/**
 * #141 in the browser: an Ice run — Ice Arrow as the default, Frost Nova Bomb
 * and Blizzard through the `?loadout=` test hook, so three actives cast at once
 * the way a full loadout does — in a filling arena so every one of them has a
 * crowd to hit.
 *
 * `core/iceArrow.test.ts` and `core/frostNova.test.ts` cover what a hit leaves
 * behind and where a throw is aimed. What only a real run can show is that
 * arrows and bombs reach their pools, land on live enemies, hold their caps in
 * a scaled run, and the frame rate survives the whole kit (spec §11).
 */

const PICKED: SpellId = 'ice';
const EXTRA = [...ICE_ROSTER_SPELL_IDS, 'ice_blizzard'] as const;

/**
 * The window is 100 s of run, read off the HUD's timer rather than budgeted in
 * wall clock (#187, #190), so a slow runner covers the same stretch of run as a
 * fast one.
 */
const RUN_MS = 100_000;
/** A runner too slow to reach `RUN_MS` in this much wall clock fails outright. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** The floor the frame rate must hold at, the same one the other roster suites use. */
const MIN_FPS = 20;

const CAPS: Readonly<Record<string, number>> = {
  ice: MAX_LIVE_ARROWS,
  ice_nova_bomb: MAX_LIVE_BOMBS,
};

type Report = GameScene['iceReport'];

async function sample(page: Page): Promise<Report | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    return (game.scene.getScene(scene.game) as GameScene).iceReport;
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

test('Ice Arrow and Frost Nova Bomb land hits on a live crowd and hold their caps', async ({
  page,
}) => {
  const errors = collectErrors(page);

  // Invulnerable, so the window is spent watching the roster rather than
  // possibly ending early on a player standing still in a filling arena.
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

  // Sampled through the run rather than only at the end: a pool that briefly
  // exceeded its cap in between would leave no trace in a final reading.
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

  for (const [i, report] of trace.entries()) {
    for (const spell of report) {
      expect(spell.live, `${spell.id} live shots at sample ${i}`).toBeLessThanOrEqual(
        CAPS[spell.id] ?? 0,
      );
    }
  }

  const last = trace[trace.length - 1] ?? [];
  for (const id of [PICKED, ...ICE_ROSTER_SPELL_IDS]) {
    const spell = last.find((entry) => entry.id === id);
    expect(spell, `${id} still equipped at the end`).toBeDefined();
    expect(spell?.hits, `${id} hits landed over the run`).toBeGreaterThan(0);
  }

  const hud = await readHud(page);
  expect(hud.kills, 'kills over the run').toBeGreaterThan(0);

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
