import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #126 in the browser: exploders join the waves at 8:00 and splitters at
 * 10:00. What each does exactly — where a blast reaches, where the children
 * land, what the cap drops — is `core/exploder.test.ts`'s and
 * `core/splitter.test.ts`'s. What only a real run can show is that a blast
 * goes down the one damage path to the HP the HUD shows, that a splitter's
 * death really leaves children in the arena, and that all three draw from
 * their own sheets.
 *
 * `?enemies=` keeps each type apart from the crowd. With melee enemies in,
 * their touches keep a standing player inside the 0.5 s immunity window and
 * no blast can take HP (the ranged suite hit the same thing, #277).
 */

const PICKED: SpellId = 'fire';

/** Run time sampled after the start; read off the HUD's timer, not wall clock (#187). */
const RUN_MS = 120_000;
/** Sampling gives up after this much wall clock and asserts on what it saw. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

type Report = GameScene['blastSplitReport'];

interface Sample extends Report {
  elapsedMs: number;
  hudHp: number;
  hudMaxHp: number;
}

/** The run's report and the HUD's HP, read in one evaluate so they agree. */
function sample(page: Page): Promise<Sample | null> {
  return page.evaluate(async (keys) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(keys.game)) return null;
    const report = (game.scene.getScene(keys.game) as GameScene).blastSplitReport;
    const hud = (game.scene.getScene(keys.hud) as HudScene).view;
    return { ...report, elapsedMs: hud.elapsedMs, hudHp: hud.hp, hudMaxHp: hud.maxHp };
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

/**
 * Start a run at `startAt` with only `enemies` spawning, then sample until
 * `done` holds or the window runs out. `left` is true when the run ended first.
 */
async function watch(
  page: Page,
  startAt: number,
  enemies: string,
  done: (trace: readonly Sample[]) => boolean,
): Promise<{ trace: Sample[]; left: boolean }> {
  await page.goto(`/?seed=1&timeScale=10&startAt=${startAt}&enemies=${enemies}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const trace: Sample[] = [];
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  while (runMs < startAt * 1000 + RUN_MS && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) return { trace, left: true };
    trace.push(current);
    runMs = current.elapsedMs;
    if (done(trace)) break;
    await page.waitForTimeout(SAMPLE_MS);
  }
  return { trace, left: false };
}

const clipsSeen = (trace: readonly Sample[]): Set<string> => new Set(trace.flatMap((t) => t.clips));

test('exploders go off on a standing player and the blasts cost HP', async ({ page }) => {
  const errors = collectErrors(page);
  // 8:00, the first row with exploders in it. Stop once a blast has taken HP
  // and an exploder has been seen on its own sheet.
  const { trace, left } = await watch(page, 480, 'exploder', (t) => {
    const last = t[t.length - 1];
    return (last?.blastHpLost ?? 0) > 0 && clipsSeen(t).has('exploder.move');
  });
  const last = trace[trace.length - 1];
  console.log(
    `exploder e2e: ${trace.length} samples; blasts ${last?.blasts}, hits ${last?.blastHits}, ` +
      `hp lost ${last?.blastHpLost}, hud ${last?.hudHp}; clips ${[...clipsSeen(trace)].join(',')}`,
  );
  expect(left, 'the run was still live when sampling stopped').toBe(false);
  expect(last?.blastHits, 'blasts that reached the player').toBeGreaterThan(0);
  expect(last?.blastHpLost, 'HP the blasts took').toBeGreaterThan(0);
  // An exploder never bites, it goes off: every HP lost here is a blast's.
  // At most, not exactly: a regen card or a health pickup taken on the way
  // can give some of it back.
  const down = (last?.hudMaxHp ?? 0) - (last?.hudHp ?? 0);
  expect(down, 'HP down on the HUD').toBeGreaterThan(0);
  expect(down).toBeLessThanOrEqual(last?.blastHpLost ?? 0);
  expect([...clipsSeen(trace)]).toEqual(expect.arrayContaining(['exploder.move']));
  expect(errors).toEqual([]);
});

test('a splitter killed in the arena leaves splitlings behind', async ({ page }) => {
  const errors = collectErrors(page);
  // 10:00, the first row with splitters in it. Stop once children have landed
  // and both the splitter and a splitling have been seen on their own sheets.
  const { trace, left } = await watch(page, 600, 'splitter', (t) => {
    const clips = clipsSeen(t);
    const last = t[t.length - 1];
    return (last?.children ?? 0) > 0 && clips.has('splitter.move') && clips.has('splitling.move');
  });
  const last = trace[trace.length - 1];
  const most = (pick: (s: Sample) => number): number => Math.max(0, ...trace.map(pick));
  console.log(
    `splitter e2e: ${trace.length} samples; most splitters ${most((s) => s.live.splitter)}, ` +
      `most splitlings ${most((s) => s.live.splitling)}; children ${last?.children}, ` +
      `dropped ${last?.dropped}; clips ${[...clipsSeen(trace)].join(',')}`,
  );
  expect(left, 'the run was still live when sampling stopped').toBe(false);
  expect(last?.children, 'splitlings spawned by splits').toBeGreaterThan(0);
  // Far under the cap, so every child owed landed.
  expect(last?.dropped).toBe(0);
  expect(
    most((s) => s.live.splitling),
    'splitlings in the arena',
  ).toBeGreaterThan(0);
  expect([...clipsSeen(trace)]).toEqual(
    expect.arrayContaining(['splitter.move', 'splitling.move']),
  );
  expect(errors).toEqual([]);
});
