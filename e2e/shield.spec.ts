import { expect, test, type Page } from '@playwright/test';
import { BASE_SHIELD_STATS, SHIELD_SPELL_IDS } from '../src/config/shields';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, waitForScene } from './game';

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

/** Run time is 10x wall time, so this window is about 100 s of run. */
const WINDOW_MS = 10_000;
const SAMPLE_MS = 100;

/** The pools as the run holds them and as the HUD was told, read together. */
interface Sample {
  pool: number;
  max: number;
  hudPool: number;
  hudMax: number;
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

  await page.goto(`/?seed=1&timeScale=10&loadout=${EXTRA.join(',')}`);
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

  // Sampled through the run rather than only at the end: a pool that drained
  // and refilled would look untouched from either end alone. The run may end
  // inside the window — the player is standing still — so the loop stops when
  // it does and everything below is asserted on what was actually seen.
  const trace: Sample[] = [];
  const until = Date.now() + WINDOW_MS;
  while (Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) break;
    trace.push(current);
    await page.waitForTimeout(SAMPLE_MS);
  }
  expect(trace.length, 'samples taken while the run was live').toBeGreaterThan(10);

  const pools = trace.map((s) => s.pool);
  // Contact damage really reached the pools: the arena filled and the player
  // was standing in it, so something must have been absorbed.
  expect(Math.min(...pools), 'lowest pool seen').toBeLessThan(TOTAL_POOL);

  // And the pools grew back: a sample above the one before it is something only
  // a recharge, or a broken shield returning, can produce.
  const regrew = pools.some((pool, i) => i > 0 && pool > (pools[i - 1] ?? pool));
  expect(regrew, `pool never regrew across ${pools.length} samples`).toBe(true);

  // The HUD was told, and by the run's own numbers — it never reads GameScene.
  for (const [i, s] of trace.entries()) {
    expect(s.max, `max at sample ${i}`).toBe(TOTAL_POOL);
    expect(s.hudMax, `HUD max at sample ${i}`).toBe(TOTAL_POOL);
    expect(s.hudPool, `HUD pool at sample ${i}`).toBe(s.pool);
  }

  expect(errors).toEqual([]);
});
