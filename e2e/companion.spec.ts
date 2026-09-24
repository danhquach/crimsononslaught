import { expect, test, type Page } from '@playwright/test';
import { COMPANION_FX, isCompanionSpellId } from '../src/config/companions';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * #133 in the browser: a run with all four companions — two ranged allies that
 * hover and shoot, two melee ones that charge and swing — equipped through the
 * `?loadout=` test hook, each drawn from its own sheet (#184).
 *
 * What the leash, the targeting and the reach do exactly is checked in
 * `core/companion.test.ts`. What only a real run can show is that the ally
 * stays on its leash across a whole run rather than drifting off over
 * thousands of frames, that it is really fighting and animating from its
 * own clips, and that four of them in a full arena still draw.
 */

const PICKED: SpellId = 'fire';
/** All four; the hook equips across elements, as `multiSpell` does. */
const EXTRA = [
  'fire_companion',
  'ice_companion',
  'lightning_companion',
  'earth_companion',
] as const;

/**
 * The window is 150 s of run, read off the HUD's timer rather than budgeted in
 * wall clock (#187, #190), so a slow runner covers the same stretch of run as a
 * fast one.
 */
const RUN_MS = 150_000;
/** A runner too slow to reach `RUN_MS` in this much wall clock fails outright. */
const WALL_CAP_MS = 40_000;

/**
 * How far past its leash an ally may be found. It is a dead zone, not a spring:
 * a companion only corrects once it is outside, so it can sit a fraction of a
 * frame's travel beyond the line — 240 px/s over a ~16 ms step is 4 px. The
 * allowance is well above that and far below a companion that had come loose.
 */
const LEASH_SLACK = 40;

/** The floor the frame rate must hold at, as `multiSpell.spec.ts` sets it. */
const MIN_FPS = 20;

/**
 * Play until the HUD's timer reads `runMs` or the wall clock reaches `until`,
 * answering any level-up overlay with its first card so the run never sits
 * paused. The hero paces left and right, so a ranged ally — which only moves to
 * keep up — has to walk as well as idle (#184). Returns the run time reached.
 */
async function playUntil(page: Page, runMs: number, until: number): Promise<number> {
  for (let step = 0; ; step += 1) {
    const reached = (await readHud(page)).elapsedMs;
    if (reached >= runMs || Date.now() >= until) return reached;
    const paused = await page.evaluate(async (levelUpKey) => {
      const { game } = await import('/src/main.ts');
      return game.scene.isActive(levelUpKey);
    }, SCENE.levelUp);
    if (paused) {
      await page.keyboard.press('1');
      continue;
    }
    const key = step % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(key);
    await page.waitForTimeout(100);
    await page.keyboard.up(key);
  }
}

function readCompanions(page: Page): Promise<GameScene['companionReport'] | null> {
  return page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(gameKey) && !game.scene.isPaused(gameKey)) return null;
    return (game.scene.getScene(gameKey) as GameScene).companionReport;
  }, SCENE.game);
}

test('four companions hold their leash, fight and animate for a whole run', async ({ page }) => {
  const errors = collectErrors(page);

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

  // Both are on their leash from the first frame, before anything has moved.
  const atStart = await readCompanions(page);
  expect(atStart?.map((companion) => companion.id)).toEqual([...EXTRA]);
  for (const companion of atStart ?? []) {
    expect(companion.distance, `${companion.id} at spawn`).toBeLessThanOrEqual(
      companion.leashRadius + LEASH_SLACK,
    );
  }

  // Sampled through the run, not only at the end: a companion that came loose
  // and was later pulled back would pass an end-of-run check alone.
  const seen: number[] = [];
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  for (let i = 0; i < 5; i += 1) {
    runMs = await playUntil(page, (RUN_MS * (i + 1)) / 5, until);
    const report = await readCompanions(page);
    if (!report) break;
    for (const companion of report) {
      expect(companion.distance, `${companion.id} at sample ${i}`).toBeLessThanOrEqual(
        companion.leashRadius + LEASH_SLACK,
      );
    }
    seen.push(report.length);
  }
  // Neither was dropped on the way: they are not damageable and the run cannot
  // take one off the board.
  expect(seen).toEqual(seen.map(() => EXTRA.length));
  expect(runMs, 'run time the window covered').toBeGreaterThanOrEqual(RUN_MS);

  const arena = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    const gameScene = game.scene.getScene(scene.game) as GameScene;
    return {
      fps: game.loop.actualFps,
      enemies: gameScene.liveEnemyCount,
      companions: gameScene.companionReport,
    };
  }, SCENE);

  expect(arena).not.toBeNull();
  if (!arena) return;
  // The arena filled: an fps reading on an empty one would prove nothing, and
  // neither would a companion that had nothing to shoot at.
  expect(arena.enemies).toBeGreaterThan(0);
  for (const companion of arena.companions) {
    expect(companion.hits, `${companion.id} landed attacks`).toBeGreaterThan(0);
    // Its own sheet and nobody else's (#184): the clip keys, never pixels,
    // since each atlas page is quantised to its own palette.
    if (!isCompanionSpellId(companion.id)) throw new Error(`${companion.id} is no companion`);
    const sprite = COMPANION_FX[companion.id].sprite;
    const shown = companion.clipsShown;
    for (const clip of shown) expect(clip, companion.id).toMatch(new RegExp(`^${sprite}\\.`));
    expect(
      shown.some((clip) => clip.startsWith(`${sprite}.move.`)),
      `${companion.id} moved`,
    ).toBe(true);
    expect(
      shown.some((clip) => clip.startsWith(`${sprite}.attack.`)),
      `${companion.id} attacked`,
    ).toBe(true);
    expect(companion.attacksShown, `${companion.id} attack clips`).toBeGreaterThan(0);
    expect(companion.clip, `${companion.id} on screen`).toMatch(new RegExp(`^${sprite}\\.`));
  }
  expect(arena.fps, `fps with ${arena.enemies} enemies alive`).toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
