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
import type { EnemyPool } from '../src/systems/EnemyPool';
import type { GemPool } from '../src/systems/GemPool';
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
 *
 * The bomb and the magnet stage what they act on — a crowd in view, gems far
 * off — in the same `evaluate` that drops them, rather than waiting for the run
 * to pile them up: how crowded the screen gets depends on the level-up offers,
 * and those differ between machines, so a wait for 15 enemies on screen held
 * locally and timed out at 12 on CI.
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

/** What to set up in the arena, in the same instant, before a drop. */
interface Stage {
  /** HP taken straight off the player, round the invulnerability hook. */
  hurt?: number;
  /** Tanks placed on a grid inside the camera's view. */
  crowd?: number;
  /** Gems placed on a ring 400–1300 px out, far outside the pickup radius. */
  farGems?: number;
}

/**
 * Stage the arena, drop `kind` at the player's feet, and return the report
 * from the same instant, before the overlap can have taken it.
 */
async function drop(page: Page, kind: ConsumableKind, stage: Stage = {}): Promise<Report> {
  return page.evaluate(
    async ({ key, kind, stage }) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key) as GameScene;
      const inner = scene as unknown as { player: Player; enemies: EnemyPool; gems: GemPool };
      const { player } = inner;
      if (stage.hurt) player.takeDamage(stage.hurt);
      const view = scene.cameras.main.worldView;
      for (let i = 0; i < (stage.crowd ?? 0); i++) {
        // Six across, inset from the edges and clear of the player.
        const x = view.x + 120 + (i % 6) * ((view.width - 240) / 5);
        const y = view.y + 90 + (Math.floor(i / 6) % 4) * ((view.height - 180) / 3);
        if (Math.hypot(x - player.x, y - player.y) < 100) continue;
        inner.enemies.spawn('tank', x, y);
      }
      for (let i = 0; i < (stage.farGems ?? 0); i++) {
        const angle = (i / (stage.farGems ?? 1)) * Math.PI * 2;
        const r = 400 + (i % 10) * 100;
        inner.gems.spawn(player.x + Math.cos(angle) * r, player.y + Math.sin(angle) * r);
      }
      const report = scene.pickupReport;
      if (!scene.dropConsumable(kind)) throw new Error(`no room to drop ${kind}`);
      return report;
    },
    { key: SCENE.game, kind, stage },
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
  const before = await drop(page, 'health', { hurt });
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
  await startRun(page, 'timeScale=4');
  const before = await drop(page, 'magnet', { farGems: 40 });
  expect(before.gems, 'gems lying far off at the drop').toBeGreaterThanOrEqual(40);
  await waitForPickups(page, 1);
  const trace: Sample[] = [];
  // 11 s of run time; a runner drawing 10 fps covers it in well under 30 s.
  const until = Date.now() + 30_000;
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
  await startRun(page, 'timeScale=1');
  const before = await drop(page, 'bomb', { crowd: 24 });
  expect(before.onScreen, 'enemies on screen at the drop').toBeGreaterThanOrEqual(15);
  const after = await waitForPickups(page, 1);
  // The bomb lands a step after the drop; spells kill on top of it, and an
  // enemy may walk off the edge in that step, so allow a little either way.
  expect(after.report.kills - before.kills).toBeGreaterThanOrEqual(before.onScreen - 2);
  expect(after.report.onScreen, 'the screen after the blast').toBeLessThan(before.onScreen / 2);
  expect(errors).toEqual([]);
});
