import { expect, test, type Page } from '@playwright/test';
import { ENEMY_ARCHETYPES } from '../src/config/enemies';
import { ELITE_MARK } from '../src/config/fx';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { ELITE_SCHEDULE } from '../src/config/waves';
import { SCENE } from '../src/core/scenePayloads';
import { activeWave } from '../src/core/waveSchedule';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #126 in the browser: elites enter the run on `ELITE_SCHEDULE`. When one is
 * due, how tough it is and that one due at the cap waits are
 * `core/elites.test.ts`'s. What only a real run can show is that the first
 * elite lands on time from a `?startAt=` just before it, carries its mark for
 * as long as it lives, and pays out a chest when it dies.
 *
 * `?enemies=` keeps the crowd to the elite's own type, and `?invulnerable=1`
 * keeps a mobbed player alive; nothing here reads HP.
 */

const PICKED: SpellId = 'fire';
const FIRST = ELITE_SCHEDULE[0]!;
const START_AT_S = FIRST.at - 5;
/** Sampling gives up after this much wall clock and asserts on what it saw. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

interface Sample extends Omit<GameScene['eliteReport'], 'live'> {
  live: number;
  /** HP of the toughest live elite; 0 with none out. */
  topHp: number;
  /** Chests on the floor plus consumables picked up, so a chest dropped at the player's feet counts. */
  chests: number;
  elapsedMs: number;
}

/** The run's reports and the HUD's clock, read in one evaluate so they agree. */
function sample(page: Page): Promise<Sample | null> {
  return page.evaluate(async (keys) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(keys.game)) return null;
    const scene = game.scene.getScene(keys.game) as GameScene;
    const { live, ...elite } = scene.eliteReport;
    const pickups = scene.pickupReport;
    const hud = (game.scene.getScene(keys.hud) as HudScene).view;
    return {
      ...elite,
      live: live.length,
      topHp: Math.max(0, ...live.map((e) => e.hp)),
      chests: pickups.consumablesLive.chest + pickups.consumables,
      elapsedMs: hud.elapsedMs,
    };
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

test('the first elite lands on time, is marked while it lives, and drops a chest', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(
    `/?seed=1&timeScale=10&invulnerable=1&startAt=${START_AT_S}&enemies=${FIRST.type}`,
  );
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const trace: Sample[] = [];
  let left = false;
  const until = Date.now() + WALL_CAP_MS;
  while (Date.now() < until) {
    if (await answerLevelUp(page)) continue;
    const current = await sample(page);
    if (!current) {
      left = true;
      break;
    }
    trace.push(current);
    // Every snapshot-asserted thing seen: the elite out, then killed, then its chest.
    if (current.killed > 0 && current.chests > 0 && trace.some((s) => s.live > 0)) break;
    await page.waitForTimeout(SAMPLE_MS);
  }

  const out = trace.filter((s) => s.live > 0);
  const firstOut = out[0];
  const last = trace[trace.length - 1];
  const clips = new Set(trace.flatMap((s) => s.markClips));
  console.log(
    `elites e2e: ${trace.length} samples, ${out.length} with an elite out; ` +
      `first landed at ${last?.firstAt} s, first seen at ${firstOut?.elapsedMs} ms, hp ${firstOut?.topHp}; ` +
      `marks/live mismatches ${out.filter((s) => s.marks !== s.live).length}; ` +
      `spawned ${last?.spawned}, waiting ${last?.waiting}, killed ${last?.killed}, ` +
      `chests ${last?.chests}; clips ${[...clips].join(',')}`,
  );
  expect(left, 'the run was still live when sampling stopped').toBe(false);
  expect(firstOut, 'an elite out').toBeDefined();
  // It lands on schedule, read off the run clock of the step that placed it:
  // never before its time, and within the step it fell due in (a step is at
  // most 24 ms). Sampling alone cannot tell: at timeScale 10 a sample spans
  // about a second of run time.
  expect(last?.firstAt).not.toBeNull();
  expect(last!.firstAt!).toBeGreaterThanOrEqual(FIRST.at);
  expect(last!.firstAt!).toBeLessThan(FIRST.at + 0.1);
  expect(firstOut!.elapsedMs).toBeGreaterThanOrEqual(FIRST.at * 1000);
  // Far tougher than the crowd it joined: over twice its HP, which leaves room
  // for hits it takes before the first sample reads it at timeScale 10.
  const crowdHp = ENEMY_ARCHETYPES[FIRST.type].hp * activeWave(FIRST.at).hpMul;
  expect(firstOut!.topHp).toBeGreaterThan(crowdHp * 2);
  // Every elite out carries exactly one mark, for as long as it lives.
  for (const s of out) expect(s.marks, `marks at ${s.elapsedMs} ms`).toBe(s.live);
  expect([...clips]).toEqual([ELITE_MARK.clip]);
  expect(last?.spawned).toBe(1);
  expect(last?.killed, 'the elite killed').toBe(1);
  expect(last?.chests, 'its chest dropped').toBeGreaterThan(0);
  // Nothing marked once it is gone.
  expect(last?.live === 0 ? last.marks : 0).toBe(0);
  expect(errors).toEqual([]);
});
