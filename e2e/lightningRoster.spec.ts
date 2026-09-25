import { expect, test, type Page } from '@playwright/test';
import { MAX_LIVE_AREAS } from '../src/config/fx';
import { LIGHTNING_ROSTER_SPELL_IDS } from '../src/config/lightningRoster';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { MAX_BOULDERS } from '../src/core/orbitingBoulders';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { MAX_LIVE_BOLTS } from '../src/core/lightningBolt';
import { MAX_SEGMENTS } from '../src/spells/ChainLightningSpell';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * #142 in the browser: a Lightning run — Lightning Bolt as the default, Chain
 * Lightning, Tornado, Lightning Sword and the Lightning Companion through the
 * `?loadout=` test hook, so the whole kit casts at once the way a full loadout
 * does — in a filling arena so every one of them has a crowd to hit.
 *
 * `core/chainLightning.test.ts`, `core/tornado.test.ts` and
 * `core/lightningSword.test.ts` cover who a cast picks and what a hit leaves.
 * What only a real run can show is that each spell lands hits on live enemies,
 * holds its pool cap in a scaled run, and the frame rate survives the whole kit
 * (spec §11). `lightningArc.spec.ts` is the eye test for the bolt itself.
 */

const PICKED: SpellId = 'lightning';
const EXTRA = [...LIGHTNING_ROSTER_SPELL_IDS, 'lightning_companion'] as const;

/**
 * The window is 180 s of run, read off the HUD's timer rather than budgeted in
 * wall clock (#187), and it is that long for Lightning Sword and Tornado
 * (#190). Both only reach enemies near the player, and a player standing still
 * with this kit sees few: Bolt, Chain Lightning and the companion kill the
 * early waves at range. Over the 100 s this window used to be, the sword landed
 * 0-6 cuts, the first about 70 s in, and on CI none at all.
 *
 * The crowd reaches them from the 120 s wave on, when tanks join it: slow and
 * tough enough to survive the ranged spells, they walk in through the ring the
 * blade sweeps instead of dying short of it. By 180 s the sword had 58-84 cuts
 * and the tornado 204-289 ticks over nine local runs. Four more, with the
 * level-ups answered by the cards worst for them, Expanse (a wider ring) or
 * Haste and Power (ranged spells that thin the crowd more), gave 65-81 and
 * 250-276.
 */
const RUN_MS = 180_000;

/**
 * Run time the window starts at, in seconds (#127). The 20-minute schedule
 * brings tanks in at 4:00 rather than 2:00, so the window starts at 3:00 to
 * face the crowd those close-range spells need; it is measured from here.
 * Over 3:00-6:00 the sword had 138-167 cuts and the tornado 571-630 ticks
 * over four local runs.
 */
const START_AT_S = 180;
/** A runner too slow to reach `RUN_MS` in this much wall clock fails outright. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** The floor the frame rate must hold at, the same one the other roster suites use. */
const MIN_FPS = 20;

/** What `live` counts for each spell, and the cap it may never pass. */
const CAPS: Readonly<Record<string, number>> = {
  lightning: MAX_LIVE_BOLTS,
  lightning_chain: MAX_SEGMENTS,
  lightning_tornado: MAX_LIVE_AREAS,
  lightning_sword: MAX_BOULDERS,
};

type Report = GameScene['lightningReport'];
type AreaViews = GameScene['areaReport']['live'];

/** The patches on the ground, every one a tornado here: the only area spell equipped. */
function sampleAreas(page: Page): Promise<AreaViews> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return [];
    return (game.scene.getScene(scene.game) as GameScene).areaReport.live;
  }, SCENE);
}

async function sample(page: Page): Promise<Report | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    return (game.scene.getScene(scene.game) as GameScene).lightningReport;
  }, SCENE);
}

/** A level-up pauses the run under its overlay; the first card resumes it. */
async function answerLevelUp(page: Page): Promise<void> {
  const paused = await page.evaluate(async (levelUpKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(levelUpKey);
  }, SCENE.levelUp);
  if (paused) await page.keyboard.press('1');
}

test('the Lightning roster lands hits on a live crowd and holds its caps', async ({ page }) => {
  const errors = collectErrors(page);

  // Invulnerable, so the window is spent watching the roster rather than
  // possibly ending early on a player standing still in a filling arena.
  await page.goto(
    `/?seed=1&timeScale=10&invulnerable=1&startAt=${START_AT_S}&loadout=${EXTRA.join(',')}`,
  );
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

  // Sampled through the run rather than only at the end: a pool that briefly
  // exceeded its cap in between would leave no trace in a final reading.
  const trace: Report[] = [];
  const areaTrace: AreaViews[] = [];
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  while (runMs < RUN_MS && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) break;
    trace.push(current);
    areaTrace.push(await sampleAreas(page));
    runMs = (await readHud(page)).elapsedMs - START_AT_S * 1000;
    await page.waitForTimeout(SAMPLE_MS);
  }
  expect(trace.length, 'samples taken while the run was live').toBeGreaterThan(10);
  expect(runMs, 'run time the window covered').toBeGreaterThanOrEqual(RUN_MS);

  for (const [i, report] of trace.entries()) {
    for (const spell of report) {
      expect(spell.live, `${spell.id} live at sample ${i}`).toBeLessThanOrEqual(
        CAPS[spell.id] ?? 0,
      );
    }
  }

  // #179: every tornado wears its own art, sized to the radius it ticks and
  // following the patch as it drifts; since CO-153 the ring is hidden under it.
  const tornadoes = areaTrace.flat();
  expect(tornadoes.length, 'tornado samples').toBeGreaterThan(0);
  for (const [i, area] of tornadoes.entries()) {
    expect(area.clip, `tornado art ${i}`).toBe('lightning.tornado');
    expect(Math.abs(area.drawnRadius - area.radius), `tornado ring ${i}`).toBeLessThan(1);
    expect(Math.abs((area.artRadius ?? 0) - area.radius), `tornado art size ${i}`).toBeLessThan(1);
    expect(area.artOffset, `tornado art on its ring ${i}`).toBeLessThan(1);
    expect(area.ringShown, `tornado hides the ring ${i}`).toBe(false);
  }

  // The sword is always out: one blade on the ring from the first frame (spec §9.4 `count` 1).
  const swordLive = trace.map((report) => report.find((s) => s.id === 'lightning_sword')?.live);
  expect(
    swordLive.every((live) => live === 1),
    'one blade on the ring throughout',
  ).toBe(true);

  const last = trace[trace.length - 1] ?? [];
  for (const id of [PICKED, ...LIGHTNING_ROSTER_SPELL_IDS]) {
    const spell = last.find((entry) => entry.id === id);
    expect(spell, `${id} still equipped at the end`).toBeDefined();
    expect(spell?.hits, `${id} hits landed over the run`).toBeGreaterThan(0);
  }

  const hud = await readHud(page);
  expect(hud.kills, 'kills over the run').toBeGreaterThan(0);

  const arena = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
    const gameScene = game.scene.getScene(scene.game) as GameScene;
    return { fps: game.loop.actualFps, enemies: gameScene.liveEnemyCount };
  }, SCENE);
  expect(arena).not.toBeNull();
  expect(arena?.enemies, 'enemies alive at the reading').toBeGreaterThan(0);
  expect(arena?.fps, `fps over ${arena?.enemies} enemies`).toBeGreaterThan(MIN_FPS);

  expect(errors).toEqual([]);
});
