import { expect, test, type Page } from '@playwright/test';
import { SHIELD_GUARD } from '../src/config/enemies';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #126 in the browser: shielded enemies join the waves at 12:00. Which hits a
 * shield takes, and that a player walking round one gets behind it, is
 * `core/shielded.test.ts`'s. What only a real run can show is that the
 * spells' hits reach `damageEnemy` with a direction: a player who stands
 * still meets the shield with their own shots, one who walks lands hits past
 * it, the shield takes its factor off each hit it stops, and the enemy draws
 * from its own sheet.
 *
 * `?enemies=shielded` keeps the type apart from the crowd, and
 * `?invulnerable=1` keeps a mobbed player alive; nothing here reads HP.
 */

const PICKED: SpellId = 'fire';
const START_AT_S = 720;
/** Sampling gives up after this much wall clock and asserts on what it saw. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;
/** One leg of the walked square, in wall ms; at `timeScale=10` about 270 px. */
const LEG_MS = 150;
const LEGS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const;

type Report = GameScene['guardReport'];

interface Sample extends Report {
  elapsedMs: number;
}

/** The run's report and the HUD's clock, read in one evaluate so they agree. */
function sample(page: Page): Promise<Sample | null> {
  return page.evaluate(async (keys) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(keys.game)) return null;
    const report = (game.scene.getScene(keys.game) as GameScene).guardReport;
    const hud = (game.scene.getScene(keys.hud) as HudScene).view;
    return { ...report, elapsedMs: hud.elapsedMs };
  }, SCENE);
}

/** Answer any level-up overlay with its first card, so the run never sits paused. */
async function answerLevelUp(page: Page): Promise<boolean> {
  const paused = await page.evaluate(async (levelUpKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(levelUpKey);
  }, SCENE.levelUp);
  if (paused) await page.keyboard.press('1');
  return paused;
}

/**
 * Sample until `done` holds or the wall clock runs out, walking a square when
 * `walk` is set. `left` is true when the run ended first.
 */
async function watch(
  page: Page,
  walk: boolean,
  until: number,
  done: (last: Sample, trace: readonly Sample[]) => boolean,
): Promise<{ trace: Sample[]; left: boolean }> {
  const trace: Sample[] = [];
  for (let step = 0; Date.now() < until; step += 1) {
    if (await answerLevelUp(page)) continue;
    const current = await sample(page);
    if (!current) return { trace, left: true };
    trace.push(current);
    if (done(current, trace)) break;
    if (walk) {
      const key = LEGS[step % LEGS.length]!;
      await page.keyboard.down(key);
      await page.waitForTimeout(LEG_MS);
      await page.keyboard.up(key);
    } else {
      await page.waitForTimeout(SAMPLE_MS);
    }
  }
  return { trace, left: false };
}

const clipsSeen = (trace: readonly Sample[]): Set<string> => new Set(trace.flatMap((t) => t.clips));
const walkSeen = (trace: readonly Sample[]): boolean =>
  [...clipsSeen(trace)].some((clip) => clip.startsWith('shielded.walk.'));

test('a standing player hits the shield, and a walking one gets past it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/?seed=1&timeScale=10&invulnerable=1&startAt=${START_AT_S}&enemies=shielded`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  const until = Date.now() + WALL_CAP_MS;

  // Standing still: every shielded enemy walks at the player shield first,
  // so the player's own shots meet the shield. Held until one has been seen
  // walking on its own sheet, too.
  const stand = await watch(page, false, until, (last, t) => last.blocked > 0 && walkSeen(t));
  const afterStand = stand.trace[stand.trace.length - 1];
  // Walking a square: the slow turn leaves flanks and backs open.
  const walked = await watch(page, true, until, (last) => last.full > (afterStand?.full ?? 0));
  const last = walked.trace[walked.trace.length - 1] ?? afterStand;
  const trace = [...stand.trace, ...walked.trace];
  console.log(
    `shielded e2e: ${trace.length} samples; most live ${Math.max(0, ...trace.map((s) => s.live))}; ` +
      `standing: blocked ${afterStand?.blocked}, full ${afterStand?.full}; ` +
      `after walking: blocked ${last?.blocked}, full ${last?.full}; ` +
      `raw ${last?.blockedRaw.toFixed(1)} → dealt ${last?.blockedDealt.toFixed(1)}; ` +
      `clips ${[...clipsSeen(trace)].join(',')}`,
  );
  expect(stand.left || walked.left, 'the run was still live when sampling stopped').toBe(false);
  expect(afterStand?.blocked, 'hits on a shield while standing').toBeGreaterThan(0);
  expect(last?.full ?? 0, 'hits past the shield after walking').toBeGreaterThan(
    afterStand?.full ?? 0,
  );
  // Every hit the shield stopped dealt its factor of the hit.
  expect(last?.blockedDealt).toBeCloseTo((last?.blockedRaw ?? 0) * SHIELD_GUARD.factor, 6);
  expect(walkSeen(trace), 'a shielded.walk clip playing').toBe(true);
  expect(errors).toEqual([]);
});
