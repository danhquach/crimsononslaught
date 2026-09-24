import { expect, test, type Page } from '@playwright/test';
import {
  CHEST_EMBERS,
  HEAL_AMOUNT,
  MAGNET_DURATION_MS,
  type ConsumableKind,
} from '../src/config/pickups';
import { PLAYER_MAX_HP } from '../src/config/player';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { Player } from '../src/entities/Player';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #128 in the browser: each consumable, dropped at the player's feet through
 * the pool by the `dropConsumable` test hook, is collected by the overlap and
 * does what it says. What drops and how often is `core/pickups.test.ts`'s; a
 * 0.3 % roll is no way to reach one here.
 *
 * Every run is invulnerable, so nothing but the test moves the player's HP.
 */

const PICKED: SpellId = 'fire';
const SAMPLE_MS = 100;

type Report = GameScene['pickupReport'];

interface Sample {
  report: Report;
  hudHp: number;
  hudEmbers: number;
  elapsedMs: number;
}

async function startRun(page: Page, query: string): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1&${query}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

/** The run's report and the HUD in one `evaluate`, so they are the same instant. */
async function sample(page: Page): Promise<Sample> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const report = (game.scene.getScene(scene.game) as GameScene).pickupReport;
    const hud = (game.scene.getScene(scene.hud) as HudScene).view;
    return { report, hudHp: hud.hp, hudEmbers: hud.embers, elapsedMs: hud.elapsedMs };
  }, SCENE);
}

/**
 * Drop `kind` at the player's feet and return the report from the same
 * instant, before the overlap can have taken it. `hurt` first takes that
 * much HP straight off the player, round the invulnerability hook.
 */
async function drop(page: Page, kind: ConsumableKind, hurt = 0): Promise<Report> {
  return page.evaluate(
    async ({ key, kind, hurt }) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key) as GameScene;
      if (hurt > 0) (scene as unknown as { player: Player }).player.takeDamage(hurt);
      const report = scene.pickupReport;
      if (!scene.dropConsumable(kind)) throw new Error(`no room to drop ${kind}`);
      return report;
    },
    { key: SCENE.game, kind, hurt },
  );
}

/** Wait until the run has picked up `count` consumables in all, answering level-ups on the way. */
async function waitForPickups(page: Page, count: number): Promise<Sample> {
  let last: Sample | null = null;
  await expect
    .poll(
      async () => {
        await answerLevelUp(page);
        last = await sample(page);
        return last.report.consumables;
      },
      { message: `${count} consumables picked up`, timeout: 10_000 },
    )
    .toBe(count);
  return last as unknown as Sample;
}

/** A level-up pauses the run under its overlay; the first card resumes it. */
async function answerLevelUp(page: Page): Promise<void> {
  const paused = await page.evaluate(async (levelUpKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(levelUpKey);
  }, SCENE.levelUp);
  if (paused) await page.keyboard.press('1');
}

test('a health pickup heals, capped at the maximum, and a chest pays Embers', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, 'timeScale=1');

  const hurt = 50;
  const before = await drop(page, 'health', hurt);
  expect(before.hp, 'HP after the test’s hit').toBe(PLAYER_MAX_HP - hurt);
  const healed = await waitForPickups(page, 1);
  expect(healed.report.hp).toBe(PLAYER_MAX_HP - hurt + HEAL_AMOUNT);
  expect(healed.hudHp, 'the HUD shows the healed HP').toBe(healed.report.hp);
  expect(healed.report.consumablesLive.health, 'the pickup left the floor').toBe(0);

  // A second one heals the rest of the way and stops at the maximum.
  await drop(page, 'health');
  const full = await waitForPickups(page, 2);
  expect(full.report.hp).toBe(PLAYER_MAX_HP);
  expect(full.hudHp).toBe(PLAYER_MAX_HP);

  // No elite drops one yet (#126), so a chest only comes from the hook.
  const beforeChest = await drop(page, 'chest');
  const paid = await waitForPickups(page, 3);
  // A crowd kill at the player's feet may bank an Ember in the same window.
  expect(paid.report.embers - beforeChest.embers).toBeGreaterThanOrEqual(CHEST_EMBERS);
  expect(paid.report.embers - beforeChest.embers).toBeLessThan(CHEST_EMBERS + 10);
  expect(paid.hudEmbers).toBe(paid.report.embers);
  expect(errors).toEqual([]);
});

test('a magnet pulls in the gems lying round the arena', async ({ page }) => {
  const errors = collectErrors(page);
  // 4:00, the crowd thick enough that Fire leaves gems lying outside the
  // pickup radius; nobody steers, so they stay there.
  await startRun(page, 'timeScale=4&startAt=240');
  await expect
    .poll(
      async () => {
        await answerLevelUp(page);
        return (await sample(page)).report.gems;
      },
      { message: 'gems lying in the arena', timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(15);

  const before = await drop(page, 'magnet');
  await waitForPickups(page, 1);
  const trace: Sample[] = [];
  const until = Date.now() + 10_000;
  let magnetSeen = false;
  while (Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    trace.push(current);
    if (current.report.magnetMsLeft > 0) magnetSeen = true;
    if (magnetSeen && current.report.magnetMsLeft === 0) break;
    await page.waitForTimeout(SAMPLE_MS);
  }
  const live = trace.filter((t) => t.report.magnetMsLeft > 0);
  expect(live.length, 'samples while the magnet ran').toBeGreaterThan(0);
  expect(Math.max(...live.map((t) => t.report.magnetMsLeft))).toBeLessThanOrEqual(
    MAGNET_DURATION_MS,
  );
  // Gems still drop while it runs, but they no longer lie there: the floor
  // empties to what is in flight.
  const fewest = Math.min(...live.map((t) => t.report.gems));
  expect(fewest, `gems left of ${before.gems}`).toBeLessThanOrEqual(before.gems / 4);
  expect(trace[trace.length - 1]?.report.magnetMsLeft, 'the magnet ran out').toBe(0);
  expect(errors).toEqual([]);
});

test('a bomb kills every regular enemy on screen', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, 'timeScale=4&startAt=240');
  await expect
    .poll(
      async () => {
        await answerLevelUp(page);
        return (await sample(page)).report.onScreen;
      },
      { message: 'enemies on screen', timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(15);

  const before = await drop(page, 'bomb');
  const after = await waitForPickups(page, 1);
  // The bomb lands a step after the drop; spells kill on top of it, and an
  // enemy may walk off the edge in that step, so allow a little either way.
  expect(after.report.kills - before.kills).toBeGreaterThanOrEqual(before.onScreen - 2);
  expect(after.report.onScreen, 'the screen after the blast').toBeLessThan(before.onScreen / 2);
  expect(errors).toEqual([]);
});
