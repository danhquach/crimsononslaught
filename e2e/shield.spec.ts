import { expect, test, type Page } from '@playwright/test';
import { BASE_SHIELD_STATS, SHIELD_SPELL_IDS } from '../src/config/shields';
import { PROFILE_CLAMPS } from '../src/config/passives';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import {
  cardCenter,
  collectErrors,
  readHud,
  readSounds,
  recordSounds,
  startFromIntro,
  waitForScene,
} from './game';

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

/**
 * The run starts at 2:00 (`?startAt=`), where fast enemies join and the crowd
 * presses a standing player within seconds.
 *
 * On the 20-minute table (#127) a run from 0:00 fills slowly. Steady contact
 * starts around 2:05, so a regrow inside the 150 s window this used came
 * either from one stray enemy touching the player around 1:10, or from a
 * lull in the first seconds of the crowd. On CI neither happened on some runs
 * (2026-09-23: first contact at 2:05, still draining at 2:35). From 2:00,
 * contact lands about 12 s into the window and the first regrow 28-39 s in
 * (native and 10 fps frames, measured 2026-09-23).
 */
const START_AT_S = 120;

/** The Haste clamp: the shortest a ring's recharge can be made. */
const HASTE = PROFILE_CLAMPS.cooldownMul?.min ?? 1;

/**
 * Run time sampled after the start, read off the HUD's timer rather than
 * budgeted in wall clock (#187). It ends at 4:00, before tanks join, with
 * about 3x the regrow time to spare.
 */
const RUN_MS = 120_000;
/** Sampling gives up after this much wall clock and asserts on what it saw. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** The pools as the run holds them and as the HUD was told, read together. */
interface Sample {
  pool: number;
  max: number;
  hudPool: number;
  hudMax: number;
  /** Both shields' running totals so far (#260). */
  absorbed: number;
  regrown: number;
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
      absorbed: report.reduce((total, shield) => total + shield.absorbed, 0),
      regrown: report.reduce((total, shield) => total + shield.regrown, 0),
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

  await page.goto(`/?seed=1&timeScale=10&startAt=${START_AT_S}&loadout=${EXTRA.join(',')}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);

  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  // Before the click, so the shields' equip cues (CO-158) are logged.
  await recordSounds(page);
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

  // Sampled through the run so the HUD is checked against it at many points.
  // The run may end inside the window — the player is standing still — so the
  // loop stops when it does and everything below is asserted on what was seen.
  const trace: Sample[] = [];
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  while (runMs < START_AT_S * 1000 + RUN_MS && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) break;
    trace.push(current);
    runMs = (await readHud(page)).elapsedMs;
    await page.waitForTimeout(SAMPLE_MS);
  }
  expect(trace.length, 'samples taken while the run was live').toBeGreaterThan(10);

  // Counted by the shields themselves, so a pool that drained and refilled
  // between two polls still shows: main CI once took 25 samples and saw no
  // regrow among them (#260). The last sample holds the totals for the run.
  const last = trace[trace.length - 1];
  // Contact damage really reached the pools: the arena filled and the player
  // was standing in it, so something must have been absorbed.
  expect(last?.absorbed, 'damage the pools absorbed').toBeGreaterThan(0);
  // And the pools grew back, each time a ring returned.
  expect(last?.regrown, `pool never regrew across ${trace.length} samples`).toBeGreaterThan(0);

  // CO-159: the pools asked for their hit cue. A hit they soaked whole cost no
  // HP, so its step asked for no hurt cue. The break cue is not asserted here:
  // a pool is full for only 5 s of each 8 (#406) and contact on a standing
  // player is sparse, so a run may see no break at all (0 and 2 in two probes of
  // the same seed); the cycle tests below break one with a real hit.
  const log = await readSounds(page);
  const firstHit = log.findIndex((r) => r.key === 'shield.hit');
  expect(firstHit, 'a shield hit cue').toBeGreaterThanOrEqual(0);
  const hurtFrames = new Set(log.filter((r) => r.key === 'player.hurt').map((r) => r.frame));
  const soakedFrames = log.filter((r) => r.key === 'shield.hit' && !hurtFrames.has(r.frame));
  expect(soakedFrames.length, 'steps with a soaked hit and no hurt cue').toBeGreaterThan(0);

  // CO-158: each shield cued as it was equipped, before any hit, and again only
  // as it came back, never per tick. Both rings return every cycle (#406), so
  // the cues are bounded by the cycles the window held, even at the Haste
  // clamp. A pool break ends a ring's uptime early, so a cycle can run shorter
  // than uptime + recharge; each such break (shared `shield.break`) is allowed
  // one extra return on top of the full-uptime bound.
  const windowS = (runMs - START_AT_S * 1000) / 1000;
  const breaks = log.filter((r) => r.key === 'shield.break').length;
  for (const id of EXTRA) {
    const { uptime, recharge } = BASE_SHIELD_STATS[id];
    const fastestCycleS = uptime + recharge * HASTE;
    const cues = log.filter((r) => r.key === `cast.${id}`);
    expect(cues.length, `${id} equip cue`).toBeGreaterThanOrEqual(1);
    const firstCue = log.findIndex((r) => r.key === `cast.${id}`);
    expect(firstCue, `${id} cues before the first hit`).toBeLessThan(firstHit);
    const returns = Math.ceil(windowS / fastestCycleS);
    expect(cues.length, `${id} cues: equip, a return per cycle, one per break`).toBeLessThanOrEqual(
      1 + returns + breaks,
    );
  }

  // The HUD was told, and by the run's own numbers — it never reads GameScene.
  for (const [i, s] of trace.entries()) {
    expect(s.max, `max at sample ${i}`).toBe(TOTAL_POOL);
    expect(s.hudMax, `HUD max at sample ${i}`).toBe(TOTAL_POOL);
    expect(s.hudPool, `HUD pool at sample ${i}`).toBe(s.pool);
  }

  expect(errors).toEqual([]);
});

/** The rings under test: each shield's stats, and which level report and field carries its ring. */
const RINGS = [
  { id: 'earth_shield', piece: 'stones' },
  { id: 'ice_shield', piece: 'diamonds' },
] as const;

/** A shield's ring as the run holds it, read together with the HUD's clock. */
interface RingRead {
  phase: 'out' | 'recharge';
  pieces: number;
  pool: number;
  max: number;
  elapsedMs: number;
}

function readRing(page: Page, id: (typeof RINGS)[number]['id']): Promise<RingRead | null> {
  return page.evaluate(
    async ([scene, shieldId]) => {
      const { game } = await import('/src/main.ts');
      if (!game.scene.isActive(scene.game) && !game.scene.isPaused(scene.game)) return null;
      const run = game.scene.getScene(scene.game) as GameScene;
      const entry = [...run.earthLevelReport, ...run.iceLevelReport].find((e) => e.id === shieldId);
      const shield = run.shieldReport.find((e) => e.id === shieldId);
      const hud = (game.scene.getScene(scene.hud) as HudScene).view;
      if (!entry || !shield) return null;
      const report = entry.report as {
        phase: 'out' | 'recharge';
        stones?: number;
        diamonds?: number;
      };
      return {
        phase: report.phase,
        pieces: report.stones ?? report.diamonds ?? -1,
        pool: shield.pool,
        max: shield.max,
        elapsedMs: hud.elapsedMs,
      };
    },
    [SCENE, id] as const,
  );
}

/**
 * #406: each shield alone, in real time with nothing hitting it. The pieces are
 * out for `uptime` with a full pool and gone for `recharge` with none; they
 * vanish and return on that clock with no break cue; and a pool broken by a real
 * hit ends the uptime early, plays the one break cue, recharges and returns whole.
 */
for (const { id, piece } of RINGS) {
  test(`${id} ${piece} come and go on their cycle, and only a real break plays the break cue`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    const { uptime, recharge, shieldHp, count } = BASE_SHIELD_STATS[id];

    await page.goto(`/?seed=1&loadout=${id}`);
    await startFromIntro(page);
    await waitForScene(page, SCENE.spellSelect);
    await recordSounds(page);
    const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
    await page.mouse.click(x, y);
    await waitForScene(page, SCENE.game);

    const start = await readRing(page, id);
    expect(start?.phase, 'out from the first frame').toBe('out');
    expect(start?.pieces, 'a full ring from the first frame').toBe(count);
    expect(start?.pool, 'a full pool from the first frame').toBe(shieldHp);

    // Watch one vanish and one return: the changes of phase, and the run clock they landed at.
    const changes: RingRead[] = [];
    let previous = start;
    const deadline = Date.now() + 30_000;
    while (changes.length < 2 && Date.now() < deadline) {
      await answerLevelUp(page);
      const now = await readRing(page, id);
      if (!now) break;
      if (now.phase === 'out') {
        expect(now.pieces, `${piece} while out`).toBe(count);
        expect(now.pool, 'pool while out').toBe(shieldHp);
      } else {
        expect(now.pieces, `${piece} while recharging`).toBe(0);
        expect(now.pool, 'pool while recharging').toBe(0);
      }
      if (previous && now.phase !== previous.phase) changes.push(now);
      previous = now;
      await page.waitForTimeout(50);
    }
    expect(
      changes.map((c) => c.phase),
      'vanished, then returned',
    ).toEqual(['recharge', 'out']);
    // Sampled every ~50 ms, and a passive picked on the way (Haste, Persistence) may move either
    // length by a little, so the bounds are loose; the exact lengths are `core/orbitCycle.test.ts`'s.
    const [vanished, returned] = changes;
    expect(vanished?.elapsedMs ?? 0, 'uptime').toBeGreaterThan(uptime * 1000 * 0.8);
    expect(vanished?.elapsedMs ?? 0, 'uptime').toBeLessThan(uptime * 1000 * 1.5);
    const gone = (returned?.elapsedMs ?? 0) - (vanished?.elapsedMs ?? 0);
    expect(gone, 'recharge').toBeGreaterThan(recharge * 1000 * 0.6);
    expect(gone, 'recharge').toBeLessThan(recharge * 1000 * 1.3);

    // A timed vanish is not a break: no break cue so far, and the shield cued as it came back.
    let log = await readSounds(page);
    expect(
      log.filter((r) => r.key === 'shield.break'),
      'break cues after a timed vanish',
    ).toHaveLength(0);
    expect(log.filter((r) => r.key === `cast.${id}`).length, 'equip and return cues').toBe(2);

    // A real break, through the run's own intake path: more than the pool holds.
    await page.evaluate(async (gameKey) => {
      const { game } = await import('/src/main.ts');
      const run = game.scene.getScene(gameKey) as unknown as {
        absorbOnShields(amount: number): number;
      };
      run.absorbOnShields(10_000);
    }, SCENE.game);
    const broken = await readRing(page, id);
    expect(broken?.phase, 'a break starts the recharge').toBe('recharge');
    expect(broken?.pieces, `a break takes the ${piece}`).toBe(0);
    expect(broken?.pool, 'a break empties the pool').toBe(0);
    log = await readSounds(page);
    expect(
      log.filter((r) => r.key === 'shield.break'),
      'one break cue',
    ).toHaveLength(1);

    // It returns whole after the recharge, and the next timed vanish still plays no break cue.
    await expect
      .poll(async () => (await readRing(page, id))?.phase, { timeout: 15_000 })
      .toBe('out');
    const back = await readRing(page, id);
    expect(back?.pieces, `${piece} back`).toBe(count);
    expect(back?.pool, 'pool back to full').toBe(shieldHp);
    await expect
      .poll(async () => (await readRing(page, id))?.phase, { timeout: 15_000 })
      .toBe('recharge');
    log = await readSounds(page);
    expect(
      log.filter((r) => r.key === 'shield.break'),
      'still the one break cue',
    ).toHaveLength(1);

    expect(errors).toEqual([]);
  });
}
