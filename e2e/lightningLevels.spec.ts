import { expect, test, type Page } from '@playwright/test';
import {
  COMPANION_SWEEP,
  FORK,
  MAX_LIVE_COMPANION_STRIPS,
  MAX_LIVE_STORM_BOLTS,
  MAX_LIVE_SWORD_BURST_STRIPS,
  STORM_CELL,
  SWORD_BURST,
  THUNDERBOLT,
  THUNDERCLAP,
  TORNADO_SPLIT,
} from '../src/config/lightningLevels';
import type { RosterSpellId } from '../src/config/loadout';
import { MAX_LIVE_AREAS, MAX_LIVE_FX } from '../src/config/fx';
import { SPELL_IDS } from '../src/config/spells';
import { MAX_SEGMENTS } from '../src/core/chainLightning';
import type { OfferCard } from '../src/core/levelUp';
import { MAX_LIVE_BOLTS } from '../src/core/lightningBolt';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { BoltLevelReport } from '../src/spells/LightningBoltSpell';
import type { ChainLevelReport } from '../src/spells/ChainLightningSpell';
import type { CompanionLevelReport } from '../src/spells/CompanionSpell';
import type { SwordLevelReport } from '../src/spells/LightningSwordSpell';
import type { TornadoLevelReport } from '../src/spells/TornadoSpell';
import { cardCenter, collectErrors, MIN_FPS, waitForScene } from './game';

/**
 * #329 in the browser: each Lightning spell's level 2 and level 3 rule, seen in
 * a real seeded run started from a `?loadout=` link. This file is the harness
 * the per-spell checks (added with each spell's step) share, copied from
 * `iceLevels.spec.ts`: one evaluate reads everything a check needs from one
 * frame, `until` samples until a predicate on that one reading holds, and a
 * level-up pick never spends the pick on an upgrade card, which would change
 * the level under test.
 *
 * Rules every check follows (the flake lessons of the Fire and Ice suites):
 * - `?loadout=lightning:2,lightning_chain:3` forces the levels; the `lightning`
 *   card is the pick on the spell screen, and `GameScene.extraLevels` levels the
 *   default too.
 * - One evaluate per read. A predicate looks at one reading's cause->effect
 *   entries (`lightningLevelReport`), never at two samples matched against each other.
 * - No sample-count floors: a check samples until its thing is seen, bounded by
 *   the run clock and the wall clock.
 * - `?invulnerable=1` (the default of `startLightningRun`) keeps the run going
 *   while the crowd a level's rule needs gathers.
 */

const SEED_QUERY = 'seed=1&timeScale=10';
/** The window is read off the HUD's run clock, so a slow runner covers the same run (#187, #190). */
const RUN_MS = 100_000;
/** A runner too slow to see a thing before the run clock runs out, or in this much wall clock, fails. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** Pick order at a level-up: never spend the pick on a Lightning upgrade card, which would change the level under test. */
const PICK_ORDER: readonly OfferCard['kind'][] = [
  'passive',
  'relic',
  'charge',
  'active',
  'upgrade',
];

/** What the page notes frame by frame, when `record` asked for it. */
interface Trace {
  /** The most bolts in the air in any one frame. */
  maxBolts: number;
  /** The most chain strips up in any one frame. */
  maxSegments: number;
  /** The most storm-cell bolts in the air in any one frame. */
  maxStormBolts: number;
  /** `clip@scale` of every storm-cell bolt drawn. */
  stormViews: string[];
  /** The most companion arc and Thunderclap strips up in any one frame. */
  maxCompanionStrips: number;
  /** The most sword burst strips up in any one frame. */
  maxBurstStrips: number;
}

/** Everything a check reads, from one evaluate so the values come from one frame. */
interface Read {
  lightning: GameScene['lightningLevelReport'];
  levels: { id: RosterSpellId; level: number }[];
  areas: number;
  /** Effect bursts playing (`FxPool`). */
  fx: number;
  /** What each Lightning spell has out now: bolts in the air, chain strips, funnels, blades. */
  live: { id: RosterSpellId; live: number }[];
  enemies: number;
  fps: number;
  elapsedMs: number;
  /** The kinds of the offer on screen, when a level-up is waiting for a card. */
  offer: OfferCard['kind'][] | null;
  trace: Trace | null;
}

/**
 * Start a seeded run from `?loadout=<loadout>` (a query like `lightning:2,lightning_chain:3`,
 * `extra` for more parameters such as `startAt=120`), pick the `lightning` card, and
 * check the link's levels reached the spells.
 */
async function startLightningRun(
  page: Page,
  loadout: string,
  extra = '',
  invulnerable = true,
): Promise<void> {
  const flags = `${SEED_QUERY}${invulnerable ? '&invulnerable=1' : ''}${extra ? `&${extra}` : ''}`;
  await page.goto(`/?${flags}&loadout=${loadout}`);
  await waitForScene(page, SCENE.intro);
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('lightning'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  // The link's levels reached the spells: each `id:level` at that level, a bare id at 1.
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
      const hud = game.scene.getScene(hudKey) as unknown as {
        view: { elapsedMs: number };
      };
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

/**
 * Note in the page, every frame, what a sample every 100 ms would miss: the most
 * of a short-lived thing alive in one frame, and how each was drawn.
 */
async function record(page: Page): Promise<void> {
  await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const run = game.scene.getScene(gameKey) as unknown as GameScene;
    const trace: Trace = {
      maxBolts: 0,
      maxSegments: 0,
      maxStormBolts: 0,
      stormViews: [],
      maxCompanionStrips: 0,
      maxBurstStrips: 0,
    };
    (window as unknown as { lightningTrace: Trace }).lightningTrace = trace;
    run.events.on('postupdate', () => {
      for (const { id, live } of run.lightningReport) {
        if (id === 'lightning') trace.maxBolts = Math.max(trace.maxBolts, live);
        if (id === 'lightning_chain') trace.maxSegments = Math.max(trace.maxSegments, live);
      }
      for (const { id, report } of run.lightningLevelReport) {
        if (id === 'lightning_tornado') {
          const tornado = report as unknown as TornadoLevelReport;
          trace.maxStormBolts = Math.max(trace.maxStormBolts, tornado.liveStormBolts);
          for (const view of tornado.boltViews) {
            if (trace.stormViews.length < 200 && !trace.stormViews.includes(view)) {
              trace.stormViews.push(view);
            }
          }
        }
        if (id === 'lightning_companion') {
          const companion = report as unknown as CompanionLevelReport;
          trace.maxCompanionStrips = Math.max(trace.maxCompanionStrips, companion.liveStrips);
        }
        if (id === 'lightning_sword') {
          const sword = report as unknown as SwordLevelReport;
          trace.maxBurstStrips = Math.max(trace.maxBurstStrips, sword.liveBurstStrips);
        }
      }
    });
  }, SCENE.game);
}

/**
 * Sample the run until `done(read)` holds, answering level-ups (never with an
 * upgrade card) and running `each` on every reading: the rules that must hold at
 * every moment (a cap, a cadence). Fails with the last reading when the run
 * clock or the wall clock runs out first.
 */
async function until(
  page: Page,
  label: string,
  done: (read: Read) => boolean,
  each: (read: Read) => void = () => undefined,
): Promise<Read> {
  const deadline = Date.now() + WALL_CAP_MS;
  let last: Read | null = null;
  // The run clock starts at `startAt` on a crowd link, so the cap is measured from the first reading.
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

test('Lightning Bolt level 2 strikes two different targets a cast', async ({ page }) => {
  const errors = collectErrors(page);
  // startAt=120: a crowd, so two targets are in range on most casts.
  await startLightningRun(page, 'lightning:2', 'startAt=120');
  await record(page);
  // The cause: a level 2 cast. The effect, in the same entry: two bolts, aimed at two different enemies.
  // The second bolt's stun roll is the level's, so the level stream has drawn by the time one lands.
  const seen = await until(
    page,
    'a level 2 cast of 2 bolts at 2 different targets, and a stun roll on the level stream',
    (read) => {
      const bolt = reportOf<BoltLevelReport>(read, 'lightning');
      return (
        bolt.casts.some((c) => c.level === 2 && c.bolts === 2 && c.distinctTargets === 2) &&
        bolt.levelStreamRolls > 0
      );
    },
    (read) => {
      const bolt = reportOf<BoltLevelReport>(read, 'lightning');
      for (const c of bolt.casts.filter((cast) => cast.level === 2)) {
        expect(c.bolts, 'bolts from one cast').toBeLessThanOrEqual(2);
        expect(c.thunderbolt, 'a level 2 cast drops no Thunderbolt').toBe(false);
      }
      expect(bolt.thunderboltCount, 'Thunderbolts at level 2').toBe(0);
      expect(read.trace?.maxBolts ?? 0, 'most bolts in the air in a frame').toBeLessThanOrEqual(
        MAX_LIVE_BOLTS,
      );
    },
  );
  const bolt = reportOf<BoltLevelReport>(seen, 'lightning');
  console.log(
    `bolt lv2 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: casts logged ${bolt.casts.length}, two-target casts ${bolt.casts.filter((c) => c.distinctTargets === 2).length}, level-stream rolls ${bolt.levelStreamRolls}, peak bolts ${seen.trace?.maxBolts}`,
  );
  expect(errors).toEqual([]);
});

test('Lightning Bolt level 3 drops a Thunderbolt on every 5th cast that stuns what it catches for a fixed second', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd thick enough that a Thunderbolt catches more than its own target.
  await startLightningRun(page, 'lightning:3', 'startAt=300');
  await record(page);
  // The cause: a level 3 cast that was a 5th. The effect, in the same entry: an
  // enemy caught and stunned after the stun was applied and before the damage.
  const seen = await until(
    page,
    'a Thunderbolt that caught enemies and left them all stunned, drawn as the sky bolt',
    (read) =>
      reportOf<BoltLevelReport>(read, 'lightning').thunderbolts.some(
        (t) =>
          t.level === 3 &&
          !t.boss &&
          t.caught > 0 &&
          t.stunnedAfter === t.caught &&
          t.look === `lightning.strike@${THUNDERBOLT.strikeScale}`,
      ),
    (read) => {
      const bolt = reportOf<BoltLevelReport>(read, 'lightning');
      // Shape, per entry: a level 3 cast is a Thunderbolt exactly when it is a 5th.
      for (const c of bolt.casts.filter((cast) => cast.level === 3)) {
        expect(c.thunderbolt, `cast ${c.castNumber}`).toBe(c.castNumber % THUNDERBOLT.every === 0);
      }
      for (const t of bolt.thunderbolts) {
        expect(t.caught, 'a Thunderbolt always catches its target').toBeGreaterThanOrEqual(1);
        if (t.bossStunS !== null) {
          expect(
            t.bossStunS,
            'the boss is stunned no longer than the fixed second',
          ).toBeLessThanOrEqual(THUNDERBOLT.stunS + 1e-6);
        }
      }
      expect(read.trace?.maxBolts ?? 0, 'most bolts in the air in a frame').toBeLessThanOrEqual(
        MAX_LIVE_BOLTS,
      );
    },
  );
  const bolt = reportOf<BoltLevelReport>(seen, 'lightning');
  console.log(
    `bolt lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: Thunderbolts ${bolt.thunderboltCount}, caught ${bolt.thunderbolts.map((t) => `${t.stunnedAfter}/${t.caught}`).join(',')}, casts logged ${bolt.casts.length}, level-stream rolls ${bolt.levelStreamRolls}`,
  );
  expect(errors).toEqual([]);
});

test('Chain Lightning level 2 chains to four enemies, five in all', async ({ page }) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd, so five enemies stand within reach of one another.
  await startLightningRun(page, 'lightning_chain:2', 'startAt=300');
  await record(page);
  // The cause: a level 2 bolt. The effect, in the same entry: five enemies struck, and no fork.
  const seen = await until(
    page,
    'a level 2 bolt that struck 5 enemies',
    (read) =>
      reportOf<ChainLevelReport>(read, 'lightning_chain').bolts.some(
        (b) => b.level === 2 && b.hits === 5 && !b.forked,
      ),
    (read) => {
      const chain = reportOf<ChainLevelReport>(read, 'lightning_chain');
      for (const b of chain.bolts.filter((bolt) => bolt.level === 2)) {
        expect(b.hits, 'enemies struck by one bolt').toBeLessThanOrEqual(5);
        expect(b.forked, 'a level 2 bolt forks').toBe(false);
      }
      expect(chain.forks, 'forks at level 2').toBe(0);
      expect(read.trace?.maxSegments ?? 0, 'most chain strips up in a frame').toBeLessThanOrEqual(
        MAX_SEGMENTS,
      );
    },
  );
  const chain = reportOf<ChainLevelReport>(seen, 'lightning_chain');
  console.log(
    `chain lv2 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: bolts logged ${chain.bolts.length}, hits ${chain.bolts.map((b) => b.hits).join(',')}, level-stream rolls ${chain.levelStreamRolls}, peak strips ${seen.trace?.maxSegments}`,
  );
  expect(errors).toEqual([]);
});

test('Chain Lightning level 3 forks at the first hit, seven enemies at most', async ({ page }) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd, so a branch has something to jump to on both sides.
  await startLightningRun(page, 'lightning_chain:3', 'startAt=300');
  await record(page);
  // The cause: a level 3 bolt. The effect, in the same entry: two branches that
  // each jumped, and no more than seven enemies struck in all.
  const seen = await until(
    page,
    'a level 3 bolt that forked, with a jump on both branches',
    (read) =>
      reportOf<ChainLevelReport>(read, 'lightning_chain').bolts.some(
        (b) => b.level === 3 && b.forked && b.branchA > 0 && b.branchB > 0,
      ),
    (read) => {
      const chain = reportOf<ChainLevelReport>(read, 'lightning_chain');
      for (const b of chain.bolts.filter((bolt) => bolt.level === 3)) {
        expect(b.hits, 'enemies struck by one bolt').toBeLessThanOrEqual(FORK.maxHits);
        expect(b.hits, 'the first target and each branch').toBe(1 + b.branchA + b.branchB);
        expect(b.forked, 'forked means a second branch').toBe(b.branchB > 0);
      }
      expect(read.trace?.maxSegments ?? 0, 'most chain strips up in a frame').toBeLessThanOrEqual(
        MAX_SEGMENTS,
      );
    },
  );
  const chain = reportOf<ChainLevelReport>(seen, 'lightning_chain');
  console.log(
    `chain lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: bolts logged ${chain.bolts.length}, forks ${chain.forks}, hits ${chain.bolts.map((b) => b.hits).join(',')}, level-stream rolls ${chain.levelStreamRolls}, peak strips ${seen.trace?.maxSegments}`,
  );
  expect(errors).toEqual([]);
});

test('Tornado level 2 sends two funnels a cast', async ({ page }) => {
  const errors = collectErrors(page);
  // startAt=120: a crowd, so the second funnel has a second enemy to head for.
  await startLightningRun(page, 'lightning_tornado:2', 'startAt=120');
  // The cause: a level 2 cast. The effect, in the same entry: two funnels sent.
  const seen = await until(
    page,
    'a level 2 cast that sent 2 funnels',
    (read) =>
      reportOf<TornadoLevelReport>(read, 'lightning_tornado').casts.some(
        (c) => c.level === 2 && c.sent === TORNADO_SPLIT.count,
      ),
    (read) => {
      const tornado = reportOf<TornadoLevelReport>(read, 'lightning_tornado');
      for (const c of tornado.casts.filter((cast) => cast.level === 2)) {
        expect(c.sent, 'funnels from one cast').toBeLessThanOrEqual(TORNADO_SPLIT.count);
      }
      expect(tornado.stormBolts, 'a level 2 funnel throws no storm bolt').toEqual([]);
    },
  );
  const tornado = reportOf<TornadoLevelReport>(seen, 'lightning_tornado');
  console.log(
    `tornado lv2 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: casts ${tornado.casts.map((c) => `${c.sent}@${c.spreadDeg}deg`).join(',')}, areas ${seen.areas}`,
  );
  expect(errors).toEqual([]);
});

test('Tornado level 3 throws a bolt from each funnel every half second, drawn small, inside the pool cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_tornado:3', 'startAt=120');
  await record(page);
  // The cause: a funnel cast at level 3. The effect, in the same entries: bolts
  // numbered in order along its life, each thrown at an enemy within reach of its
  // eye; and a bolt that landed, drawn as the small bolt clip.
  const seen = await until(
    page,
    'a storm bolt that landed, drawn as lightning.bolt at 0.6',
    (read) =>
      reportOf<TornadoLevelReport>(read, 'lightning_tornado').stormBoltHits > 0 &&
      (read.trace?.stormViews.length ?? 0) > 0,
    (read) => {
      const tornado = reportOf<TornadoLevelReport>(read, 'lightning_tornado');
      const last = new Map<number, number>();
      for (const b of tornado.stormBolts) {
        expect(b.level, 'storm bolts come from level 3 funnels').toBe(3);
        expect(b.targetDistance, 'target distance from the eye').toBeLessThanOrEqual(
          STORM_CELL.range + 1e-6,
        );
        expect(b.dueIndex, `funnel ${b.patch}'s bolt order`).toBeGreaterThan(
          last.get(b.patch) ?? 0,
        );
        last.set(b.patch, b.dueIndex);
      }
      expect(tornado.liveStormBolts, 'storm bolts alive').toBeLessThanOrEqual(MAX_LIVE_STORM_BOLTS);
      expect(
        read.trace?.maxStormBolts ?? 0,
        'most storm bolts alive in a frame',
      ).toBeLessThanOrEqual(MAX_LIVE_STORM_BOLTS);
    },
  );
  const tornado = reportOf<TornadoLevelReport>(seen, 'lightning_tornado');
  console.log(
    `tornado lv3 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: casts ${tornado.casts.length}, bolts logged ${tornado.stormBolts.length}, hits ${tornado.stormBoltHits}, dropped ${tornado.stormBoltsDropped}, peak ${seen.trace?.maxStormBolts}`,
  );
  expect(seen.trace?.stormViews).toEqual([`${STORM_CELL.clip}@${STORM_CELL.drawScale}`]);
  expect(errors).toEqual([]);
});

test('Lightning Companion level 2 attacks twice as fast and its swing arcs across the enemies in front', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_companion:2', 'startAt=120');
  await record(page);
  // The cause: a landed level 2 swing. The effect, in the same entry: other
  // enemies caught by the arc and all of them hit, on the halved cadence.
  const seen = await until(
    page,
    'a level 2 swing that arced to other enemies and hit them all',
    (read) =>
      reportOf<CompanionLevelReport>(read, 'lightning_companion').swings.some(
        (w) =>
          w.level === 2 &&
          w.swept > 0 &&
          w.sweptHit === w.swept &&
          Math.abs(w.cadenceS - w.attackCooldownS * COMPANION_SWEEP.cooldownFactor) < 1e-9,
      ),
    (read) => {
      const companion = reportOf<CompanionLevelReport>(read, 'lightning_companion');
      for (const w of companion.swings.filter((swing) => swing.level === 2)) {
        expect(w.cadenceS, 'attack cadence').toBeCloseTo(
          w.attackCooldownS * COMPANION_SWEEP.cooldownFactor,
          9,
        );
        expect(w.swept, 'enemies in the arc').toBeLessThanOrEqual(COMPANION_SWEEP.maxTargets);
        expect(w.thunderclapHits, 'a level 2 swing has no Thunderclap').toBe(0);
      }
      expect(companion.liveStrips, 'strips up').toBeLessThanOrEqual(MAX_LIVE_COMPANION_STRIPS);
    },
  );
  const companion = reportOf<CompanionLevelReport>(seen, 'lightning_companion');
  console.log(
    `companion lv2 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: swings ${companion.swings.length}, swept ${companion.swings.map((w) => w.swept).join(',')}, cadence ${companion.swings.at(-1)?.cadenceS}, peak strips ${seen.trace?.maxCompanionStrips}`,
  );
  expect(errors).toEqual([]);
});

test('Lightning Companion level 3 chains a Thunderclap from each swing, three enemies at most, inside the strip cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_companion:3', 'startAt=300');
  await record(page);
  // The cause: a landed level 3 swing. The effect, in the same entry: enemies
  // reached by the Thunderclap, and one strip drawn for each.
  const seen = await until(
    page,
    'a level 3 swing whose Thunderclap reached enemies and drew a strip for each',
    (read) =>
      reportOf<CompanionLevelReport>(read, 'lightning_companion').swings.some(
        (w) =>
          w.level === 3 &&
          w.thunderclapHits >= 1 &&
          w.thunderclapHits <= THUNDERCLAP.jumps &&
          w.thunderclapStrips === w.thunderclapHits,
      ),
    (read) => {
      const companion = reportOf<CompanionLevelReport>(read, 'lightning_companion');
      for (const w of companion.swings.filter((swing) => swing.level === 3)) {
        expect(w.thunderclapHits, 'enemies from one Thunderclap').toBeLessThanOrEqual(
          THUNDERCLAP.jumps,
        );
        expect(w.thunderclapStrips, 'strips for one Thunderclap').toBeLessThanOrEqual(
          w.thunderclapHits,
        );
      }
      expect(companion.liveStrips, 'strips up').toBeLessThanOrEqual(MAX_LIVE_COMPANION_STRIPS);
      expect(read.trace?.maxCompanionStrips ?? 0, 'most strips up in a frame').toBeLessThanOrEqual(
        MAX_LIVE_COMPANION_STRIPS,
      );
    },
  );
  const companion = reportOf<CompanionLevelReport>(seen, 'lightning_companion');
  console.log(
    `companion lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: swings ${companion.swings.length}, claps ${companion.swings.map((w) => w.thunderclapHits).join(',')}, peak strips ${seen.trace?.maxCompanionStrips}`,
  );
  expect(errors).toEqual([]);
});

test('Lightning Sword level 2 has four blades on the ring, and its cuts are logged at level 2', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startLightningRun(page, 'lightning_sword:2', 'startAt=120');
  // The cause: a level 2 cut. The effect, in the same entry: four blades on the ring.
  const seen = await until(
    page,
    'a level 2 cut with 4 blades on the ring',
    (read) =>
      reportOf<SwordLevelReport>(read, 'lightning_sword').cuts.some(
        (c) => c.level === 2 && c.blades === 4,
      ),
    (read) => {
      const sword = reportOf<SwordLevelReport>(read, 'lightning_sword');
      // Four blades while they are out, none while they recharge (#406).
      expect(sword.blades, `blades on the ring while ${sword.phase}`).toBe(
        sword.phase === 'out' ? 4 : 0,
      );
      expect(sword.burstCount, 'a level 2 blade bursts').toBe(0);
    },
  );
  const sword = reportOf<SwordLevelReport>(seen, 'lightning_sword');
  console.log(
    `sword lv2 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: cuts logged ${sword.cuts.length}, blades ${sword.cuts.map((c) => c.blades).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('Lightning Sword level 3 ends its uptime with each blade firing a chain burst of up to three enemies', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd, so a blade has an enemy within 60 px when the blades vanish.
  await startLightningRun(page, 'lightning_sword:3', 'startAt=300');
  await record(page);
  // The cause: the blades vanishing at level 3. The effect, in the same entry: a burst that left
  // a blade's own position and reached one to three enemies, each link within 60 px.
  const seen = await until(
    page,
    'a level 3 burst from a blade to 1 to 3 enemies',
    (read) =>
      reportOf<SwordLevelReport>(read, 'lightning_sword').bursts.some(
        (b) => b.level === 3 && b.targets >= 1 && b.targets <= 1 + SWORD_BURST.jumps,
      ),
    (read) => {
      const sword = reportOf<SwordLevelReport>(read, 'lightning_sword');
      expect(sword.blades, `blades on the ring while ${sword.phase}`).toBe(
        sword.phase === 'out' ? 4 : 0,
      );
      for (const b of sword.bursts) {
        expect(b.targets, 'enemies from one burst').toBeLessThanOrEqual(1 + SWORD_BURST.jumps);
        expect(Math.abs(b.casterDistance - b.orbitRadius), 'blade on the ring').toBeLessThanOrEqual(
          1,
        );
        expect(b.linkDistances, 'one link per enemy').toHaveLength(b.targets);
        for (const d of b.linkDistances)
          expect(d, 'link length').toBeLessThanOrEqual(SWORD_BURST.range + 1e-6);
      }
      expect(sword.liveBurstStrips, 'burst strips up').toBeLessThanOrEqual(
        MAX_LIVE_SWORD_BURST_STRIPS,
      );
      expect(
        read.trace?.maxBurstStrips ?? 0,
        'most burst strips up in a frame',
      ).toBeLessThanOrEqual(MAX_LIVE_SWORD_BURST_STRIPS);
    },
  );
  const sword = reportOf<SwordLevelReport>(seen, 'lightning_sword');
  console.log(
    `sword lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: cuts logged ${sword.cuts.length}, bursts ${sword.burstCount}, targets ${sword.bursts.map((b) => b.targets).join(',')}, peak strips ${seen.trace?.maxBurstStrips}`,
  );
  expect(errors).toEqual([]);
});

test('the whole Lightning roster at level 3 holds every pool cap for 100 s and keeps its frame rate', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const all = [
    'lightning:3',
    'lightning_chain:3',
    'lightning_tornado:3',
    'lightning_companion:3',
    'lightning_sword:3',
  ];
  // startAt=600: the thickest crowd of the window. No per-frame record hook: this
  // check is about the frame rate, which a listener on every frame would cost.
  await startLightningRun(page, all.join(','), 'startAt=600');
  let startMs: number | null = null;
  let worst = { fx: 0, areas: 0 };
  const seen = await until(
    page,
    'the roster held its caps to the end of the window',
    (read) => {
      startMs ??= read.elapsedMs;
      return read.elapsedMs - startMs >= RUN_MS;
    },
    (read) => {
      const live = (id: RosterSpellId): number => read.live.find((l) => l.id === id)?.live ?? 0;
      expect(live('lightning'), 'bolts in the air').toBeLessThanOrEqual(MAX_LIVE_BOLTS);
      expect(live('lightning_chain'), 'chain strips').toBeLessThanOrEqual(MAX_SEGMENTS);
      expect(live('lightning_sword'), 'blades').toBeLessThanOrEqual(4);
      const tornado = reportOf<TornadoLevelReport>(read, 'lightning_tornado');
      expect(tornado.liveStormBolts, 'storm bolts').toBeLessThanOrEqual(MAX_LIVE_STORM_BOLTS);
      const companion = reportOf<CompanionLevelReport>(read, 'lightning_companion');
      expect(companion.liveStrips, 'companion strips').toBeLessThanOrEqual(
        MAX_LIVE_COMPANION_STRIPS,
      );
      const sword = reportOf<SwordLevelReport>(read, 'lightning_sword');
      expect(sword.liveBurstStrips, 'sword burst strips').toBeLessThanOrEqual(
        MAX_LIVE_SWORD_BURST_STRIPS,
      );
      expect(read.areas, 'ground areas').toBeLessThanOrEqual(MAX_LIVE_AREAS);
      expect(read.fx, 'effect bursts').toBeLessThanOrEqual(MAX_LIVE_FX);
      worst = { fx: Math.max(worst.fx, read.fx), areas: Math.max(worst.areas, read.areas) };
    },
  );
  console.log(
    `roster lv3 over ${((seen.elapsedMs - (startMs ?? 0)) / 1000).toFixed(0)} s: fps ${seen.fps.toFixed(0)}, enemies ${seen.enemies}, peak fx ${worst.fx}, peak areas ${worst.areas}, storm dropped ${reportOf<TornadoLevelReport>(seen, 'lightning_tornado').stormBoltsDropped}, bursts ${reportOf<SwordLevelReport>(seen, 'lightning_sword').burstCount}`,
  );
  for (const id of [
    'lightning',
    'lightning_chain',
    'lightning_tornado',
    'lightning_companion',
    'lightning_sword',
  ]) {
    expect(seen.levels.find((l) => l.id === id)?.level, `${id} level`).toBe(3);
  }
  expect(seen.enemies, 'a crowd to the end').toBeGreaterThan(0);
  expect(seen.fps, 'frame rate').toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
