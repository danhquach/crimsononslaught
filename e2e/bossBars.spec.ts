import { expect, test, type Page } from '@playwright/test';
import { BOSS } from '../src/config/boss';
import { BOSS_BAR_COLORS } from '../src/config/hud';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { BossBarShown, HudScene } from '../src/scenes/HudScene';
import {
  cardCenter,
  collectErrors,
  readSounds,
  recordSounds,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * #387 in the browser: the boss's HP is drawn as `BOSS.bars` bars. The first
 * is violet and the last red; each break plays one cue, flashes the bar and
 * counts down the `×N` beside the label. The run starts a second short of the boss
 * (`?startAt=`), invulnerable, so the boss is on screen at once and nothing
 * but the hooks changes its HP much; every hit is dealt through
 * `damageBossForTest`, the run's one damage path.
 */

const START_AT_S = 1199;
const BAR_HP = BOSS.hp / BOSS.bars;

async function startRun(page: Page): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1&startAt=${START_AT_S}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await recordSounds(page);
}

function readBar(page: Page): Promise<BossBarShown> {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(hudKey) as HudScene).bossBarShown;
  }, SCENE.hud);
}

/** The bar the HUD is showing right now, once it is the boss phase and the boss has published its HP. */
async function waitForBossBar(page: Page): Promise<void> {
  await expect
    .poll(async () => (await readBar(page)).bar, {
      message: 'the boss bar is drawn',
      timeout: 20_000,
    })
    .toBe(0);
}

/**
 * Deal damage so exactly `hpLeft` is left, read and dealt in one `evaluate` so
 * no frame of the fight lands between the read and the hit. A boss already at
 * or under `hpLeft` takes nothing.
 */
function leaveHp(page: Page, hpLeft: number): Promise<{ hp: number; dying: boolean } | null> {
  return page.evaluate(
    async ({ scene, left }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const now = g.damageBossForTest(0);
      if (!now) return null;
      return g.damageBossForTest(Math.max(0, now.hp - left));
    },
    { scene: SCENE, left: hpLeft },
  );
}

function hit(page: Page, amount: number): Promise<{ hp: number; dying: boolean } | null> {
  return page.evaluate(
    async ({ scene, amount }) => {
      const { game } = await import('/src/main.ts');
      return (game.scene.getScene(scene.game) as GameScene).damageBossForTest(amount);
    },
    { scene: SCENE, amount },
  );
}

async function breakCues(page: Page): Promise<number> {
  return (await readSounds(page)).filter((r) => r.key === 'boss.barBreak' && r.started).length;
}

/** The whole fight in order, checked in both looks. */
async function walkBars(page: Page, look: BossBarShown['look']): Promise<void> {
  await waitForBossBar(page);
  const start = await readBar(page);
  expect(start.look).toBe(look);
  expect(start.countText).toBe(`×${BOSS.bars}`);
  expect(start.color).toBe(BOSS_BAR_COLORS.first);
  expect(start.breaks).toBe(0);
  expect(await breakCues(page)).toBe(0);

  // Down to one bar's worth: the first bar breaks, once, and the last is red.
  await leaveHp(page, BAR_HP);
  await expect.poll(async () => (await readBar(page)).breaks).toBe(1);
  const last = await readBar(page);
  expect(last.bar).toBe(BOSS.bars - 1);
  expect(last.color).toBe(BOSS_BAR_COLORS.last);
  expect(last.countText).toBe('×1');
  expect(last.fill01).toBeGreaterThan(0.9);
  expect(await breakCues(page)).toBe(1);

  // A hit inside the last bar breaks nothing.
  await hit(page, 1);
  await expect.poll(async () => (await readBar(page)).fill01).toBeLessThan(last.fill01);
  expect((await readBar(page)).breaks).toBe(1);
  expect(await breakCues(page)).toBe(1);

  // The killing blow is the death cue's, not a break.
  const killed = await hit(page, BOSS.hp);
  expect(killed?.dying).toBe(true);
  await expect
    .poll(async () => (await readSounds(page)).some((r) => r.key === 'boss.death'))
    .toBe(true);
  expect(await breakCues(page)).toBe(1);
}

test('the boss bar peels off one bar at a time, with a cue per break', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await walkBars(page, 'art');
  expect(errors).toEqual([]);
});

test('with the bar frames missing, the flat boss bar breaks the same way', async ({ page }) => {
  await page.route('**/assets/atlas/props11.png', (route) => route.abort());
  // Phaser logs its own error for the aborted file, so errors are not asserted here.
  await startRun(page);
  await walkBars(page, 'flat');
});

test('one hit deep into the last bar breaks once', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await waitForBossBar(page);
  // A zero hit changes nothing.
  await hit(page, 0);
  expect((await readBar(page)).breaks).toBe(0);
  // 1000 HP left, so the running spell cannot finish the boss before the read.
  await leaveHp(page, 1000);
  await expect.poll(async () => (await readBar(page)).breaks).toBe(1);
  const near = await readBar(page);
  expect(near.countText).toBe('\u00d71');
  expect(near.fill01).toBeLessThan(0.2);
  expect(await breakCues(page)).toBe(1);
  expect(errors).toEqual([]);
});
