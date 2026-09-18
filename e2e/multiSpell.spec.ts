import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, readHud, waitForScene } from './game';

/**
 * CO-109 in the browser: a run casting three actives at once, each on its own
 * cooldown, through the `?loadout=` test hook (the level-up rework that offers
 * a second active is #132).
 *
 * That three spells cast independently is checked exactly in
 * `core/spellbook.test.ts`; what only a real run can show is that three of them
 * firing into a full arena still draws — all three FX streams share one
 * `FxPool`, and a frame rate that collapsed there would be the regression.
 */

/** The picked spell plus the two the hook equips; fire is the reach spell CO-061 is built around. */
const PICKED: SpellId = 'fire';
const EXTRA = ['ice', 'lightning'] as const;

/** Run time is 10x wall time, so this window is 150 s of run: past the level 7 slot unlock. */
const WINDOW_MS = 15_000;

/**
 * The floor the frame rate must hold at with all three casting. Measured
 * headless at seed 1 over a whole run: 60 fps with three actives as with one,
 * at `?timeScale=10` and at the ceiling, peaking around 45 live enemies. The
 * floor is set far below that because a CI runner is slower than a desktop and
 * the check is for a collapse — a pool thrashing, a leak — not a tuned number.
 */
const MIN_FPS = 20;

/** Answer any level-up overlay with its first card, so the run never sits paused. */
async function playFor(page: Page, durationMs: number): Promise<void> {
  const until = Date.now() + durationMs;
  while (Date.now() < until) {
    const paused = await page.evaluate(async (levelUpKey) => {
      const { game } = await import('/src/main.ts');
      return game.scene.isActive(levelUpKey);
    }, SCENE.levelUp);
    if (paused) await page.keyboard.press('1');
    else await page.waitForTimeout(100);
  }
}

test('three actives cast in one run and the arena still draws', async ({ page }) => {
  const errors = collectErrors(page);

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

  await playFor(page, WINDOW_MS);

  const hud = await readHud(page);
  expect(hud.kills).toBeGreaterThan(0);

  const arena = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    const gameScene = game.scene.getScene(scene.game) as GameScene;
    return {
      fps: game.loop.actualFps,
      enemies: gameScene.liveEnemyCount,
      overlays: gameScene.overlayCount,
      spells: gameScene.equippedSpellIds,
      elapsedMs: (game.scene.getScene(scene.hud) as HudScene).view.elapsedMs,
    };
  }, SCENE);

  expect(arena).not.toBeNull();
  if (!arena) return;
  // All three survived the run; nothing dropped one on the way. A level-up may
  // have equipped a fourth on top — companions are offerable now (#133) — so
  // this is a superset check rather than an equality one.
  expect(arena.spells.slice(0, 3)).toEqual([PICKED, ...EXTRA]);
  // The arena filled: an fps reading on an empty one would prove nothing.
  expect(arena.enemies).toBeGreaterThan(0);
  expect(arena.overlays).toBeLessThanOrEqual(arena.enemies);
  expect(arena.fps, `fps with ${arena.enemies} enemies alive`).toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
