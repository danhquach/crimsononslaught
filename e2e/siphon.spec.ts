import { expect, test, type Page } from '@playwright/test';
import { SIPHON } from '../src/config/passives';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SIM_STEP_MS } from '../src/core/runState';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * CO-235 in the browser: Siphon turns the damage a run's spells land into HP,
 * never faster than its ceiling, and only from spells. What the pacing does
 * exactly is `core/siphon.test.ts`'s; only a real run shows the wiring: the
 * damage closure feeds it, the hero's HP and the HUD move, the cue plays, and
 * the test hooks feed it nothing.
 *
 * The hero stands still among the opening waves and starts 30 HP down, so there
 * is room to heal before any contact lands; the crowd's own bites keep taking
 * HP while the spells kill it.
 */

const PICKED: SpellId = 'fire';
const RUN_MS = 90_000;
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;
/** The longest simulation step is one and a half `SIM_STEP_MS`; a run-second bucket (by step start) may overrun by one. */
const STEP_S = (SIM_STEP_MS * 1.5) / 1000;

interface Sample {
  elapsedMs: number;
  fed: number;
  healed: number;
  cues: number;
  pulses: number;
  peakHealPerS: number;
  peakCuesPerS: number;
  hp: number;
  maxHp: number;
  hudHp: number;
}

async function startRun(page: Page, query = ''): Promise<void> {
  await page.goto(`/?seed=1&timeScale=10${query}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

/** The hero takes `amount` through the one damage path (private, so a cast), before any enemy is near. */
function hurtHero(page: Page, amount: number): Promise<void> {
  return page.evaluate(
    async ([key, hit]) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key) as unknown as { hurtPlayer(n: number): number };
      scene.hurtPlayer(hit);
    },
    [SCENE.game, amount] as const,
  );
}

/** Take each id once, in order. */
function take(page: Page, ids: readonly string[]): Promise<void> {
  return page.evaluate(
    async ([key, taken]) => {
      const { game } = await import('/src/main.ts');
      const { spells } = game.scene.getScene(key) as unknown as {
        spells: { takePassive(id: string): void };
      };
      for (const id of taken) spells.takePassive(id);
    },
    [SCENE.game, ids] as const,
  );
}

/** The siphon report, the hero's HP and the HUD's, read in one evaluate. */
function sample(page: Page): Promise<Sample | 'paused' | null> {
  return page.evaluate(async (keys) => {
    const { game } = await import('/src/main.ts');
    if (game.scene.isPaused(keys.game)) return 'paused' as const;
    if (!game.scene.isActive(keys.game)) return null;
    const scene = game.scene.getScene(keys.game) as unknown as {
      siphonReport: GameScene['siphonReport'];
      player: { hp: number; maxHp: number };
    };
    const hud = (game.scene.getScene(keys.hud) as HudScene).view;
    return {
      ...scene.siphonReport,
      hp: scene.player.hp,
      maxHp: scene.player.maxHp,
      elapsedMs: hud.elapsedMs,
      hudHp: hud.hp,
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

/** Sample until `done` holds of the trace, the run ends, or the wall cap passes. */
async function sampleUntil(
  page: Page,
  done: (trace: Sample[]) => boolean,
): Promise<{ trace: Sample[]; runLeft: boolean }> {
  const trace: Sample[] = [];
  const until = Date.now() + WALL_CAP_MS;
  while (Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (current === 'paused') {
      await page.waitForTimeout(SAMPLE_MS);
      continue;
    }
    if (!current) return { trace, runLeft: true };
    trace.push(current);
    if (current.elapsedMs >= RUN_MS || done(trace)) break;
    await page.waitForTimeout(SAMPLE_MS);
  }
  return { trace, runLeft: false };
}

const lastOf = (trace: Sample[]): Sample => trace[trace.length - 1] as Sample;

/** HP lost to shots so far, as the deepest dip below max the hero has been seen at. */
const hpLost = (trace: Sample[]): number => Math.max(0, ...trace.map((t) => t.maxHp - t.hp));

test('Siphon heals a hero whose spells land damage, within its ceiling, and cues it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await hurtHero(page, 30);
  await take(page, Array(4).fill('passive_siphon'));

  // Stop only once everything asserted from a snapshot has been seen.
  const { trace, runLeft } = await sampleUntil(
    page,
    (t) => hpLost(t) > 0 && lastOf(t).healed > 0 && lastOf(t).pulses > 0,
  );
  const last = lastOf(trace);
  console.log(
    `siphon e2e: ${trace.length} samples to ${Math.round(last.elapsedMs)} ms; fed ${last.fed.toFixed(1)}, ` +
      `healed ${last.healed.toFixed(2)}, cues ${last.cues}, pulses ${last.pulses}, ` +
      `peak ${last.peakHealPerS.toFixed(2)} HP/s, ${last.peakCuesPerS} cue requests/s; hp lost ${hpLost(trace).toFixed(1)}`,
  );
  expect(runLeft, 'the run was still live when sampling stopped').toBe(false);
  expect(hpLost(trace), 'HP the hero lost, so there was room to heal').toBeGreaterThan(0);
  expect(last.fed, 'spell damage fed to Siphon').toBeGreaterThan(0);
  expect(last.healed, 'HP healed').toBeGreaterThan(0);
  expect(last.pulses, 'cues played').toBeGreaterThan(0);

  // Never faster than the ceiling, over any whole run-second, with a step of slack.
  expect(last.peakHealPerS).toBeLessThanOrEqual(SIPHON.maxHealPerS * (1 + STEP_S) + 1e-9);
  // The cue rate is held by the heal ceiling, not by the clip: count `drainSiphon`'s
  // requests, which do not depend on how long a clip plays. At timeScale 1 the
  // clip (about 333 ms) then bounds the plays to 3 a second; at timeScale 10 the
  // clip spans several sim-seconds, so only the requests can be bounded here.
  expect(last.peakCuesPerS).toBeLessThanOrEqual(
    Math.ceil((SIPHON.maxHealPerS * (1 + STEP_S)) / SIPHON.cueEveryHp),
  );
  // The HUD draws the HP the hero has, read in the same step.
  for (const t of trace)
    expect(Math.ceil(t.hudHp), `HUD at ${t.elapsedMs} ms`).toBe(Math.ceil(t.hp));
  expect(errors).toEqual([]);
});

test('without Siphon nothing is fed, healed or cued', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await hurtHero(page, 30);

  const { trace, runLeft } = await sampleUntil(page, (t) => t.length >= 25);
  const last = lastOf(trace);
  console.log(`siphon e2e (none): ${trace.length} samples; fed ${last.fed}, healed ${last.healed}`);
  expect(runLeft, 'the run was still live when sampling stopped').toBe(false);
  expect(last.fed).toBe(0);
  expect(last.healed).toBe(0);
  expect(last.cues).toBe(0);
  expect(last.pulses).toBe(0);
  expect(errors).toEqual([]);
});

test('damage from a test hook is not fed to Siphon', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, '&invulnerable=1');
  await take(page, Array(4).fill('passive_siphon'));

  const fed = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(key) as GameScene;
    const before = scene.siphonReport.fed;
    const first = scene.damageBossForTest(50);
    const second = scene.damageBossForTest(50);
    scene.damageBossCappedForTest(50);
    return { before, after: scene.siphonReport.fed, first, second };
  }, SCENE.game);
  expect(fed.first, 'the hook found a boss to hit').not.toBeNull();
  expect(fed.second?.hp, 'the hook really took boss HP').toBeLessThan(fed.first?.hp ?? 0);
  expect(fed.after).toBe(fed.before);
  expect(errors).toEqual([]);
});
