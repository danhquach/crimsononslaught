import { expect, test, type Page } from '@playwright/test';
import { MAX_COMPANION_SHOTS } from '../src/config/companions';
import { MAX_LIVE_AREAS, MAX_LIVE_FX } from '../src/config/fx';
import {
  FORK,
  MAX_LIVE_STORM_BOLTS,
  MAX_SWORD_ARC_SPRITES,
  MAX_THUNDERCLAP_ARC_SPRITES,
  STORM_CELL,
  SWORD_ARC,
  THUNDERBOLT,
  THUNDERCLAP,
  TWIN_TORNADO,
} from '../src/config/lightningLevels';
import { BASE_CHAIN_LIGHTNING_STATS } from '../src/config/lightningRoster';
import type { RosterSpellId } from '../src/config/loadout';
import { SPELL_IDS } from '../src/config/spells';
import type { OfferCard } from '../src/core/levelUp';
import { MAX_LIVE_BOLTS } from '../src/core/lightningBolt';
import { MAX_BOULDERS } from '../src/core/orbitingBoulders';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import { MAX_SEGMENTS, type ChainLevelReport } from '../src/spells/ChainLightningSpell';
import type { CompanionLevelReport } from '../src/spells/CompanionSpell';
import type { LightningBoltLevelReport } from '../src/spells/LightningBoltSpell';
import type { SwordLevelReport } from '../src/spells/LightningSwordSpell';
import type { TornadoLevelReport } from '../src/spells/TornadoSpell';
import { cardCenter, collectErrors, MIN_FPS, waitForScene } from './game';

/**
 * #329 in the browser: each Lightning spell's level 2 and level 3 rule, seen in
 * a real seeded run started from a `?loadout=` link. The harness is
 * `iceLevels.spec.ts`'s: one evaluate reads everything a check needs from one
 * frame, `until` samples until a predicate on that one reading holds, and a
 * level-up pick never spends the pick on an upgrade card, which would change
 * the level under test.
 *
 * Rules every check follows (the flake lessons of the Fire and Ice suites):
 * - `?loadout=lightning:2,lightning_sword:3` forces the levels; the `lightning`
 *   card is the pick on the spell screen, and `GameScene.extraLevels` levels
 *   the default too.
 * - One evaluate per read. A predicate looks at one reading's cause->effect
 *   entries (`lightningLevelReport`), never at two samples matched against each other.
 * - "Has happened" facts are running counts, which a 16-entry log window cannot lose.
 * - No sample-count floors: a check samples until its thing is seen, bounded by
 *   the run clock and the wall clock. What only lives a frame or two (a storm
 *   cell bolt's look) is noted every frame in the page by `record` (8401456).
 */

const SEED_QUERY = 'seed=1&timeScale=10';
/** The window is read off the HUD's run clock, so a slow runner covers the same run (#187, #190). */
const RUN_MS = 100_000;
/** A runner too slow to see a thing before the run clock runs out, or in this much wall clock, fails. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** Pick order at a level-up: never spend the pick on an upgrade card, which would change the level under test. */
const PICK_ORDER: readonly OfferCard['kind'][] = [
  'passive',
  'relic',
  'charge',
  'active',
  'upgrade',
];

/** What the page notes frame by frame, when `record` asked for it. */
interface Trace {
  /** The most storm cell bolts alive in any one frame. */
  maxStormBolts: number;
  /** `clip@scale` of every storm cell bolt drawn. */
  stormBoltViews: string[];
}

/** Everything a check reads, from one evaluate so the values come from one frame. */
interface Read {
  lightning: GameScene['lightningLevelReport'];
  levels: { id: RosterSpellId; level: number }[];
  areas: number;
  fx: number;
  /** What each Lightning spell has out: bolts in the air, chain strips, tornadoes, blades. */
  live: { id: RosterSpellId; live: number }[];
  enemies: number;
  fps: number;
  elapsedMs: number;
  offer: OfferCard['kind'][] | null;
  trace: Trace | null;
}

/**
 * Start a seeded run from `?loadout=<loadout>` (`extra` for more parameters
 * such as `startAt=120`), invulnerable, pick the `lightning` card, and check
 * the link's levels reached the spells.
 */
async function startLightningRun(page: Page, loadout: string, extra = ''): Promise<void> {
  await page.goto(`/?${SEED_QUERY}&invulnerable=1${extra ? `&${extra}` : ''}&loadout=${loadout}`);
  await waitForScene(page, SCENE.intro);
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('lightning'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const asked = loadout.split(',').map((token) => {
    const [id, level] = token.split(':');
    return { id, level: level === undefined ? 1 : Number(level) };
  });
  const run = await readRun(page);
  for (const { id, level } of asked) {
    expect(
      run?.levels.find((l) => l.id === id)?.level,
      `${id} level from ?loadout=${loadout}`,
    ).toBe(level);
  }
}

async function readRun(page: Page): Promise<Read | null> {
  return page.evaluate(
    async ([gameKey, hudKey, levelUpKey]) => {
      const { game } = await import('/src/main.ts');
      if (!game.scene.isActive(gameKey) && !game.scene.isPaused(gameKey)) return null;
      const run = game.scene.getScene(gameKey) as unknown as GameScene;
      const hud = game.scene.getScene(hudKey) as unknown as { view: { elapsedMs: number } };
      const levelUp = game.scene.isActive(levelUpKey)
        ? (game.scene.getScene(levelUpKey) as unknown as LevelUpScene)
        : null;
      return {
        lightning: run.lightningLevelReport,
        levels: run.spellLevels as { id: RosterSpellId; level: number }[],
        areas: run.areaReport.live.length,
        fx: (run as unknown as { fx: { count: number } }).fx.count,
        live: run.lightningReport.map(({ id, live }) => ({ id, live })),
        enemies: run.liveEnemyCount,
        fps: game.loop.actualFps,
        elapsedMs: hud.view.elapsedMs,
        offer: levelUp ? levelUp.view.cards.map((card) => card.kind) : null,
        trace: (window as unknown as { lightningTrace?: Trace }).lightningTrace ?? null,
      };
    },
    [SCENE.game, SCENE.hud, SCENE.levelUp] as const,
  );
}

/** Note in the page, every frame, the storm cell bolts a sample every 100 ms would miss. */
async function recordStormBolts(page: Page): Promise<void> {
  await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const run = game.scene.getScene(gameKey) as unknown as GameScene;
    const trace: Trace = { maxStormBolts: 0, stormBoltViews: [] };
    (window as unknown as { lightningTrace: Trace }).lightningTrace = trace;
    run.events.on('postupdate', () => {
      for (const { id, report } of run.lightningLevelReport) {
        if (id !== 'lightning_tornado') continue;
        const tornado = report as unknown as TornadoLevelReport;
        trace.maxStormBolts = Math.max(trace.maxStormBolts, tornado.liveBolts);
        for (const { clip, scale } of tornado.boltViews) {
          const key = `${clip}@${scale}`;
          if (trace.stormBoltViews.length < 200 && !trace.stormBoltViews.includes(key)) {
            trace.stormBoltViews.push(key);
          }
        }
      }
    });
  }, SCENE.game);
}

/**
 * Sample the run until `done(read)` holds, answering level-ups (never with an
 * upgrade card) and running `each` on every reading: the rules that must hold at
 * every moment. Fails with the last reading when the run clock or the wall
 * clock runs out first.
 */
async function until(
  page: Page,
  label: string,
  done: (read: Read) => boolean,
  each: (read: Read) => void = () => undefined,
): Promise<Read> {
  const deadline = Date.now() + WALL_CAP_MS;
  let last: Read | null = null;
  let startMs: number | null = null;
  while (Date.now() < deadline) {
    const read = await readRun(page);
    if (!read) break;
    last = read;
    startMs ??= read.elapsedMs;
    if (read.offer) {
      const best = read.offer
        .map((kind, index) => ({ index, rank: PICK_ORDER.indexOf(kind) }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)[0];
      await page.keyboard.press(`${(best?.index ?? 0) + 1}`);
    }
    each(read);
    if (done(read)) return read;
    if (read.elapsedMs - startMs >= RUN_MS) break;
    await page.waitForTimeout(SAMPLE_MS);
  }
  throw new Error(
    `${label}: not seen by run clock ${last?.elapsedMs ?? '?'} ms. Last reading: ${JSON.stringify(last).slice(0, 3000)}`,
  );
}

/** The level report of the Lightning spell `id`, typed by the caller; throws when it is not casting. */
function reportOf<T>(read: Read, id: RosterSpellId): T {
  const entry = read.lightning.find((f) => f.id === id);
  if (!entry) throw new Error(`${id} is not casting`);
  return entry.report as unknown as T;
}

test('Lightning Bolt level 2 strikes two targets a cast', async ({ page }) => {
  const errors = collectErrors(page);
  // startAt=120: a crowd, so two enemies stand in reach.
  await startLightningRun(page, 'lightning:2', 'startAt=120');
  const seen = await until(
    page,
    'a level 2 cast that sent 2 bolts',
    (read) =>
      reportOf<LightningBoltLevelReport>(read, 'lightning').casts.some(
        (c) => c.level === 2 && c.bolts === 2,
      ),
    (read) => {
      for (const c of reportOf<LightningBoltLevelReport>(read, 'lightning').casts) {
        expect(c.bolts, 'bolts from one cast').toBeLessThanOrEqual(2);
        expect(c.thunderbolt, 'no Thunderbolt below level 3').toBe(false);
      }
    },
  );
  const bolt = reportOf<LightningBoltLevelReport>(seen, 'lightning');
  console.log(`bolt lv2: casts ${bolt.casts.map((c) => c.bolts).join(',')}`);
  expect(errors).toEqual([]);
});

test('Lightning Bolt level 3 calls a Thunderbolt every 5th cast that stuns all it catches', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning:3', 'startAt=120');
  // The cause: the 5th, 10th ... cast. The effect, in the same entry: a sky
  // strike that caught enemies and left every one of them stunned.
  const seen = await until(
    page,
    'a Thunderbolt on a cast divisible by 5 that stunned everything it caught',
    (read) => {
      const bolt = reportOf<LightningBoltLevelReport>(read, 'lightning');
      return bolt.thunderbolts.some(
        (t) =>
          t.level === 3 &&
          t.castNumber % THUNDERBOLT.every === 0 &&
          t.caught > 0 &&
          t.stunnedAfter === t.caught,
      );
    },
    (read) => {
      const bolt = reportOf<LightningBoltLevelReport>(read, 'lightning');
      for (const c of bolt.casts) {
        expect(c.thunderbolt, `cast ${c.castNumber} Thunderbolt`).toBe(
          c.castNumber % THUNDERBOLT.every === 0,
        );
      }
      for (const t of bolt.thunderbolts) {
        expect(t.stunnedAfter, 'enemies stunned by one Thunderbolt').toBe(t.caught);
        // A boss's stun goes through its diminishing returns and is never longer than the strike's own.
        if (t.bossStunS !== null) expect(t.bossStunS).toBeLessThanOrEqual(THUNDERBOLT.stunS + 1e-6);
      }
    },
  );
  const bolt = reportOf<LightningBoltLevelReport>(seen, 'lightning');
  console.log(
    `bolt lv3 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: casts ${bolt.casts.length}, thunderbolts ${bolt.thunderboltCount} (caught ${bolt.thunderbolts.map((t) => t.caught).join(',')})`,
  );
  expect(errors).toEqual([]);
});

test('Chain Lightning level 2 chains to four enemies', async ({ page }) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_chain:2', 'startAt=120');
  const chains = BASE_CHAIN_LIGHTNING_STATS.chains + 2;
  const seen = await until(
    page,
    'a level 2 bolt that struck its first target and chained 4 times',
    (read) =>
      reportOf<ChainLevelReport>(read, 'lightning_chain').casts.some(
        (c) => c.level === 2 && c.hits.some((h) => h === 1 + chains),
      ),
    (read) => {
      for (const c of reportOf<ChainLevelReport>(read, 'lightning_chain').casts) {
        expect(c.forked, 'no fork below level 3').toBe(false);
        for (const h of c.hits) expect(h, 'hits of one bolt').toBeLessThanOrEqual(1 + chains);
      }
    },
  );
  const chain = reportOf<ChainLevelReport>(seen, 'lightning_chain');
  console.log(`chain lv2: casts ${chain.casts.map((c) => c.hits.join('+')).join(',')}`);
  expect(errors).toEqual([]);
});

test('Chain Lightning level 3 forks at its first target, capped in total hits', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_chain:3', 'startAt=120');
  const chains = BASE_CHAIN_LIGHTNING_STATS.chains + 2;
  const seen = await until(
    page,
    'a forked cast whose two branches both struck',
    (read) => reportOf<ChainLevelReport>(read, 'lightning_chain').fullForks > 0,
    (read) => {
      const chain = reportOf<ChainLevelReport>(read, 'lightning_chain');
      for (const c of chain.casts) {
        expect(c.forked, 'every level 3 cast forks').toBe(c.level === 3);
        for (const h of c.hits) expect(h, 'hits of one bolt').toBeLessThanOrEqual(FORK.maxHits);
        c.branches.forEach(([a, b], i) => {
          expect(a, 'first branch jumps').toBeLessThanOrEqual(chains);
          expect(b, 'second branch jumps').toBeLessThanOrEqual(chains);
          expect(1 + a + b, 'a bolt is its first target and its two branches').toBe(c.hits[i]);
        });
      }
      expect(chain.liveStrips, 'chain strips up').toBeLessThanOrEqual(MAX_SEGMENTS);
    },
  );
  const chain = reportOf<ChainLevelReport>(seen, 'lightning_chain');
  console.log(
    `chain lv3: full forks ${chain.fullForks}, branches ${chain.casts.map((c) => c.branches.map((b) => b.join('/')).join(' ')).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('Tornado level 2 sends two tornadoes a cast', async ({ page }) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_tornado:2');
  const seen = await until(
    page,
    'a level 2 cast of 2 tornadoes fanned apart',
    (read) =>
      reportOf<TornadoLevelReport>(read, 'lightning_tornado').casts.some(
        (c) => c.level === 2 && c.tornadoes === 2 && c.spreadDeg === TWIN_TORNADO.spreadDeg,
      ),
    (read) => {
      const tornado = reportOf<TornadoLevelReport>(read, 'lightning_tornado');
      for (const c of tornado.casts) expect(c.tornadoes, 'tornadoes a cast').toBeLessThanOrEqual(2);
      expect(tornado.boltsThrown, 'no storm cell below level 3').toBe(0);
    },
  );
  const tornado = reportOf<TornadoLevelReport>(seen, 'lightning_tornado');
  console.log(`tornado lv2: casts ${tornado.casts.map((c) => c.tornadoes).join(',')}`);
  expect(errors).toEqual([]);
});

test('Tornado level 3 funnels throw a small bolt every 0.5 s at an enemy near them, inside the pool cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_tornado:3', 'startAt=120');
  await recordStormBolts(page);
  // The cause: a funnel's life. The effect, in the same entry: one bolt due for
  // every 0.5 s of it, and bolts thrown; and a bolt that landed, drawn small.
  const seen = await until(
    page,
    'a spent funnel that fell due one bolt per 0.5 s and threw some, a bolt that landed, bolts drawn in flight',
    (read) => {
      const tornado = reportOf<TornadoLevelReport>(read, 'lightning_tornado');
      return (
        tornado.funnels.some(
          (f) =>
            f.level === 3 &&
            f.due === Math.floor(f.lifeS / STORM_CELL.everyS + 1e-6) &&
            f.due > 0 &&
            f.thrown > 0,
        ) &&
        tornado.boltHits > 0 &&
        (read.trace?.stormBoltViews.length ?? 0) > 0
      );
    },
    (read) => {
      const tornado = reportOf<TornadoLevelReport>(read, 'lightning_tornado');
      for (const f of tornado.funnels) {
        expect(f.due, 'bolts due over a funnel life').toBe(
          Math.floor(f.lifeS / STORM_CELL.everyS + 1e-6),
        );
        expect(f.thrown, 'bolts thrown').toBeLessThanOrEqual(f.due);
      }
      expect(tornado.liveBolts, 'storm bolts alive').toBeLessThanOrEqual(MAX_LIVE_STORM_BOLTS);
      expect(read.trace?.maxStormBolts ?? 0, 'most storm bolts in a frame').toBeLessThanOrEqual(
        MAX_LIVE_STORM_BOLTS,
      );
      // Level 3 keeps level 2's second tornado.
      for (const c of tornado.casts.filter((c) => c.level === 3)) {
        expect(c.tornadoes).toBeLessThanOrEqual(2);
      }
    },
  );
  const tornado = reportOf<TornadoLevelReport>(seen, 'lightning_tornado');
  console.log(
    `tornado lv3 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: funnels ${tornado.funnels.map((f) => `${f.thrown}/${f.due}`).join(',')}, thrown ${tornado.boltsThrown}, hits ${tornado.boltHits}, dropped ${tornado.boltsDropped}, peak ${seen.trace?.maxStormBolts}`,
  );
  expect(seen.trace?.stormBoltViews).toEqual([`${STORM_CELL.clip}@${STORM_CELL.drawScale}`]);
  expect(errors).toEqual([]);
});

test('Lightning Companion level 2 attacks twice as fast and strikes an arc in front of it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_companion:2', 'startAt=120');
  const seen = await until(
    page,
    'a level 2 swing on half the attack cooldown whose arc struck enemies',
    (read) =>
      reportOf<CompanionLevelReport>(read, 'lightning_companion').swings.some(
        (s) => s.level === 2 && s.arcHits > 0,
      ),
    (read) => {
      for (const s of reportOf<CompanionLevelReport>(read, 'lightning_companion').swings) {
        expect(s.cadenceS * 2, 'twice as fast').toBeCloseTo(s.attackCooldownS, 6);
        // The scheduler never pays a swing sooner than its cadence (a stalled frame may pay late).
        if (s.sinceLastS !== null) {
          expect(s.sinceLastS, 'run time between swings').toBeGreaterThanOrEqual(s.cadenceS - 0.05);
        }
        expect(s.chainHits, 'no Thunderclap below level 3').toBe(0);
      }
    },
  );
  const companion = reportOf<CompanionLevelReport>(seen, 'lightning_companion');
  console.log(
    `companion lv2: swings ${companion.swings.length}, cadence ${companion.swings[0]?.cadenceS}, arc hits ${companion.arcHits}, gaps ${companion.swings.map((s) => s.sinceLastS?.toFixed(2)).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('Lightning Companion level 3 ends each charge in a Thunderclap chain to three enemies', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_companion:3', 'startAt=120');
  const seen = await until(
    page,
    'a level 3 swing whose Thunderclap chained to 3 enemies',
    (read) => reportOf<CompanionLevelReport>(read, 'lightning_companion').fullThunderclaps > 0,
    (read) => {
      const companion = reportOf<CompanionLevelReport>(read, 'lightning_companion');
      for (const s of companion.swings) {
        expect(s.chainHits, 'chain hits from one swing').toBeLessThanOrEqual(THUNDERCLAP.chains);
        expect(s.cadenceS * 2, 'level 3 keeps the frenzy').toBeCloseTo(s.attackCooldownS, 6);
      }
      expect(companion.liveArcSprites, 'Thunderclap strips up').toBeLessThanOrEqual(
        MAX_THUNDERCLAP_ARC_SPRITES,
      );
      expect(companion.liveShots, 'a melee ally has no shots').toBe(0);
    },
  );
  const companion = reportOf<CompanionLevelReport>(seen, 'lightning_companion');
  console.log(
    `companion lv3: swings ${companion.swings.length}, chains ${companion.swings.map((s) => s.chainHits).join(',')}, full ${companion.fullThunderclaps}`,
  );
  expect(errors).toEqual([]);
});

test('Lightning Sword level 2 turns four blades', async ({ page }) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_sword:2');
  const seen = await until(
    page,
    'four blades on the ring',
    (read) => {
      const sword = reportOf<SwordLevelReport>(read, 'lightning_sword');
      return sword.count === 4 && sword.blades === 4;
    },
    (read) => {
      const sword = reportOf<SwordLevelReport>(read, 'lightning_sword');
      expect(sword.arcs, 'no arc below level 3').toEqual([]);
      expect(sword.blades).toBeLessThanOrEqual(4);
    },
  );
  console.log(`sword lv2: blades ${reportOf<SwordLevelReport>(seen, 'lightning_sword').blades}`);
  expect(errors).toEqual([]);
});

test('Lightning Sword level 3 turns five blades and each cut arcs from its blade to 1-2 enemies near it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd packed round the ring, so a cut has neighbours within the
  // arc's 60 px (at 120 a cut arced about 1 time in 15, and rarely twice).
  await startLightningRun(page, 'lightning_sword:3', 'startAt=300');
  const seen = await until(
    page,
    'five blades, and a cut whose arc left its blade for an enemy within reach',
    (read) => {
      const sword = reportOf<SwordLevelReport>(read, 'lightning_sword');
      return sword.blades === 5 && sword.arcedCuts > 0 && sword.fullArcs > 0;
    },
    (read) => {
      const sword = reportOf<SwordLevelReport>(read, 'lightning_sword');
      expect(sword.count).toBe(5);
      for (const a of sword.arcs) {
        expect(a.hits, 'enemies one arc strikes').toBeGreaterThanOrEqual(1);
        expect(a.hits, 'enemies one arc strikes').toBeLessThanOrEqual(SWORD_ARC.maxTargets);
        // Measured from the blade that cut: the arc starts there, each hop within reach of the enemy's edge.
        expect(a.firstGapPx, 'blade to first arc target').toBeLessThanOrEqual(
          (a.reachPx[0] ?? SWORD_ARC.range) + 0.1,
        );
        a.hopGapsPx.forEach((gap, i) =>
          expect(gap, 'arc hop').toBeLessThanOrEqual((a.reachPx[i + 1] ?? SWORD_ARC.range) + 0.1),
        );
      }
      expect(sword.liveArcSprites, 'arc strips up').toBeLessThanOrEqual(MAX_SWORD_ARC_SPRITES);
    },
  );
  const sword = reportOf<SwordLevelReport>(seen, 'lightning_sword');
  console.log(
    `sword lv3: cuts ${sword.levelThreeCuts}, arced ${sword.arcedCuts} (full ${sword.fullArcs}), arc hits ${sword.arcHits}, gaps ${sword.arcs.map((a) => a.firstGapPx).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('the whole Lightning roster at level 3 holds every pool cap and the frame rate over 100 s', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=600: the crowd of ten minutes in, the densest the pools will meet.
  await startLightningRun(
    page,
    'lightning:3,lightning_chain:3,lightning_tornado:3,lightning_companion:3,lightning_sword:3',
    'startAt=600',
  );
  // Sampled through the run, not only at the end. No per-frame hook: it would
  // weigh on the run whose frame rate is under test.
  let samples = 0;
  let peakEnemies = 0;
  let startMs: number | null = null;
  const last = await until(
    page,
    '100 s of run clock',
    (read) => {
      startMs ??= read.elapsedMs;
      return read.elapsedMs - startMs >= RUN_MS;
    },
    (read) => {
      samples += 1;
      peakEnemies = Math.max(peakEnemies, read.enemies);
      const liveOf = (id: RosterSpellId): number => read.live.find((l) => l.id === id)?.live ?? 0;
      expect(liveOf('lightning'), 'bolts in the air').toBeLessThanOrEqual(MAX_LIVE_BOLTS);
      expect(liveOf('lightning_chain'), 'chain strips').toBeLessThanOrEqual(MAX_SEGMENTS);
      expect(liveOf('lightning_sword'), 'blades').toBeLessThanOrEqual(MAX_BOULDERS);
      expect(
        reportOf<TornadoLevelReport>(read, 'lightning_tornado').liveBolts,
        'storm cell bolts',
      ).toBeLessThanOrEqual(MAX_LIVE_STORM_BOLTS);
      const companion = reportOf<CompanionLevelReport>(read, 'lightning_companion');
      expect(companion.liveArcSprites, 'Thunderclap strips').toBeLessThanOrEqual(
        MAX_THUNDERCLAP_ARC_SPRITES,
      );
      expect(companion.liveShots, 'companion shots').toBeLessThanOrEqual(MAX_COMPANION_SHOTS);
      expect(
        reportOf<SwordLevelReport>(read, 'lightning_sword').liveArcSprites,
        'sword arc strips',
      ).toBeLessThanOrEqual(MAX_SWORD_ARC_SPRITES);
      expect(read.areas, 'ground areas alive').toBeLessThanOrEqual(MAX_LIVE_AREAS);
      expect(read.fx, 'effect bursts alive').toBeLessThanOrEqual(MAX_LIVE_FX);
    },
  );
  console.log(
    `lightning roster lv3: ${samples} samples, peak enemies ${peakEnemies}, enemies ${last.enemies}, fps ${last.fps.toFixed(1)}`,
  );
  expect(last.levels.map((l) => l.level)).toEqual([3, 3, 3, 3, 3]);
  expect(last.enemies, 'enemies alive at the reading').toBeGreaterThan(0);
  expect(last.fps, `fps over ${last.enemies} enemies`).toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
