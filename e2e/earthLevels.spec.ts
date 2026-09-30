import { expect, test, type Page } from '@playwright/test';
import {
  AFTERSHOCK,
  BOULDER_SPLIT,
  EARTH_COMPANION_SWEEP,
  LANDSLIDE,
  MAX_LIVE_RUT_TILES,
  MAX_LIVE_SEISMIC_PATCHES,
  QUAKE_SPLIT,
  SPIKE_FAN,
  TREMOR,
} from '../src/config/earthLevels';
import { BASE_QUAKE_STATS } from '../src/config/areas';
import { BASE_BOULDER_STATS } from '../src/config/earthRoster';
import type { RosterSpellId } from '../src/config/loadout';
import { MAX_LIVE_AREAS, MAX_LIVE_FX } from '../src/config/fx';
import { SPELL_IDS } from '../src/config/spells';
import { MAX_LIVE_SPIKES } from '../src/core/earthSpike';
import type { OfferCard } from '../src/core/levelUp';
import { MAX_LIVE_BOULDERS } from '../src/core/rollingBoulder';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { BoulderLevelReport } from '../src/spells/RollingBoulderSpell';
import type { CompanionLevelReport } from '../src/spells/CompanionSpell';
import type { EarthShieldLevelReport } from '../src/spells/EarthShieldSpell';
import type { QuakeLevelReport } from '../src/spells/GroundAreaSpell';
import type { SpikeLevelReport } from '../src/spells/EarthSpikeSpell';
import { cardCenter, collectErrors, MIN_FPS, waitForScene } from './game';

/**
 * #330 in the browser: each Earth spell's level 2 and level 3 rule, seen in a
 * real seeded run started from a `?loadout=` link. The harness is copied from
 * `lightningLevels.spec.ts`: one evaluate reads everything a check needs from
 * one frame, `until` samples until a predicate on that one reading holds, and a
 * level-up pick never spends the pick on an upgrade card, which would change
 * the level under test.
 *
 * Rules every check follows (the flake lessons of the Fire, Ice and Lightning suites):
 * - `?loadout=earth:2,earth_boulder:3` forces the levels; the `earth` card is
 *   the pick on the spell screen, and `GameScene.extraLevels` levels the
 *   default too.
 * - One evaluate per read. A predicate looks at one reading's cause->effect
 *   entries (`earthLevelReport`), never at two samples matched against each other.
 * - No sample-count floors, and a check keeps sampling until every thing it
 *   asserts has been seen, bounded by the run clock and the wall clock.
 * - `?invulnerable=1` (the default of `startEarthRun`) keeps the run going
 *   while the crowd a level's rule needs gathers.
 */

const SEED_QUERY = 'seed=1&timeScale=10';
/** The window is read off the HUD's run clock, so a slow runner covers the same run (#187, #190). */
const RUN_MS = 100_000;
/** A runner too slow to see a thing before the run clock runs out, or in this much wall clock, fails. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** Pick order at a level-up: never spend the pick on an Earth upgrade card, which would change the level under test. */
const PICK_ORDER: readonly OfferCard['kind'][] = [
  'passive',
  'relic',
  'charge',
  'active',
  'upgrade',
];

/** What the page notes frame by frame, when `record` asked for it. */
interface Trace {
  /** The most spikes in the air in any one frame. */
  maxSpikes: number;
  /** The most boulders in the air in any one frame. */
  maxBoulders: number;
  /** The most seismic patches on the ground in any one frame. */
  maxSeismic: number;
  /** The most enemies staggered in any one frame. */
  maxStaggered: number;
}

/** Everything a check reads, from one evaluate so the values come from one frame. */
interface Read {
  earth: GameScene['earthLevelReport'];
  levels: { id: RosterSpellId; level: number }[];
  areas: number;
  /** Effect bursts playing (`FxPool`). */
  fx: number;
  /** Spikes and boulders in the air now (`earthReport`). */
  live: { id: RosterSpellId; live: number }[];
  enemies: number;
  fps: number;
  elapsedMs: number;
  /** The kinds of the offer on screen, when a level-up is waiting for a card. */
  offer: OfferCard['kind'][] | null;
  trace: Trace | null;
}

/**
 * Start a seeded run from `?loadout=<loadout>` (a query like `earth:2,earth_boulder:3`,
 * `extra` for more parameters such as `startAt=120`), pick the `earth` card, and
 * check the link's levels reached the spells.
 */
async function startEarthRun(
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
  const { x, y } = cardCenter(SPELL_IDS.indexOf('earth'));
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
        earth: run.earthLevelReport,
        levels: run.spellLevels as { id: RosterSpellId; level: number }[],
        areas: run.areaReport.live.length,
        fx: (run as unknown as { fx: { count: number } }).fx.count,
        live: run.earthReport.map(({ id, live }) => ({ id, live })),
        enemies: run.liveEnemyCount,
        fps: game.loop.actualFps,
        elapsedMs: hud.view.elapsedMs,
        offer: levelUp ? levelUp.view.cards.map((card) => card.kind) : null,
        trace: (window as unknown as { earthTrace?: Trace }).earthTrace ?? null,
      };
    },
    [SCENE.game, SCENE.hud, SCENE.levelUp] as const,
  );
}

/**
 * Note in the page, every frame, what a sample every 100 ms would miss: the most
 * of a short-lived thing alive in one frame.
 */
async function record(page: Page): Promise<void> {
  await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const run = game.scene.getScene(gameKey) as unknown as GameScene;
    const trace: Trace = { maxSpikes: 0, maxBoulders: 0, maxSeismic: 0, maxStaggered: 0 };
    (window as unknown as { earthTrace: Trace }).earthTrace = trace;
    run.events.on('postupdate', () => {
      for (const { id, live } of run.earthReport) {
        if (id === 'earth') trace.maxSpikes = Math.max(trace.maxSpikes, live);
        if (id === 'earth_boulder') trace.maxBoulders = Math.max(trace.maxBoulders, live);
      }
      for (const { id, report } of run.earthLevelReport) {
        if (id === 'earth_companion') {
          const companion = report as unknown as CompanionLevelReport;
          trace.maxSeismic = Math.max(trace.maxSeismic, companion.liveSeismicPatches);
        }
      }
      const staggered = run.areaReport.tints.filter((t) => t.staggered).length;
      trace.maxStaggered = Math.max(trace.maxStaggered, staggered);
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

/** The level report of the Earth spell `id`, typed by the caller; throws when it is not casting. */
function reportOf<T>(read: Read, id: RosterSpellId): T {
  const entry = read.earth.find((f) => f.id === id);
  if (!entry) throw new Error(`${id} is not casting`);
  return entry.report as unknown as T;
}

/** Spikes or boulders in the air now. */
function liveOf(read: Read, id: RosterSpellId): number {
  return read.live.find((l) => l.id === id)?.live ?? 0;
}

/** Ticks a quake pays in all. */
const QUAKE_TICKS = BASE_QUAKE_STATS.duration / BASE_QUAKE_STATS.tickRate;

test('Earth Spike level 2 flings two spikes in a fan a cast', async ({ page }) => {
  const errors = collectErrors(page);
  // startAt=120: a crowd, so there is always something to aim at.
  await startEarthRun(page, 'earth:2', 'startAt=120');
  await record(page);
  // The cause: a level 2 cast. The effect, in the same entry: two spikes, the fan wide.
  // The second spike's bleed roll is the level's, so the level stream has drawn by the time one lands.
  const seen = await until(
    page,
    'a level 2 cast of 2 spikes in a 20 degree fan, and a bleed roll on the level stream',
    (read) => {
      const spike = reportOf<SpikeLevelReport>(read, 'earth');
      return (
        spike.casts.some(
          (c) =>
            c.level === 2 && c.spikes === 2 && Math.abs(c.spreadDeg - SPIKE_FAN.spreadDeg) < 0.5,
        ) && spike.levelStreamRolls > 0
      );
    },
    (read) => {
      const spike = reportOf<SpikeLevelReport>(read, 'earth');
      for (const c of spike.casts.filter((cast) => cast.level === 2)) {
        expect(c.spikes, 'spikes from one cast').toBeLessThanOrEqual(2);
        if (c.spikes === 2) expect(c.spreadDeg, 'fan').toBeCloseTo(SPIKE_FAN.spreadDeg, 0);
      }
      expect(spike.splinterCount, 'splinters at level 2').toBe(0);
      expect(liveOf(read, 'earth'), 'spikes in the air').toBeLessThanOrEqual(MAX_LIVE_SPIKES);
      expect(read.trace?.maxSpikes ?? 0, 'most spikes in the air in a frame').toBeLessThanOrEqual(
        MAX_LIVE_SPIKES,
      );
    },
  );
  const spike = reportOf<SpikeLevelReport>(seen, 'earth');
  console.log(
    `spike lv2 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: casts logged ${spike.casts.length}, spikes ${spike.casts.map((c) => c.spikes).join(',')}, level-stream rolls ${spike.levelStreamRolls}, peak spikes ${seen.trace?.maxSpikes}`,
  );
  expect(errors).toEqual([]);
});

test('Earth Spike level 3 breaks on its first hit and splinters over the enemies round it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd, so a splinter has enemies round the one struck (at 120 few catch anybody).
  await startEarthRun(page, 'earth:3', 'startAt=300');
  await record(page);
  // The cause: a level 3 spike struck an enemy. The effect, in the same entry:
  // shards caught other enemies and hit them, and no spike struck a second.
  const seen = await until(
    page,
    'a splinter that caught enemies and hit them, with no spike having struck more than one',
    (read) => {
      const spike = reportOf<SpikeLevelReport>(read, 'earth');
      return (
        spike.splinters.some((e) => e.level === 3 && e.caught > 0 && e.hit > 0) &&
        spike.maxStruck[3] === 1
      );
    },
    (read) => {
      const spike = reportOf<SpikeLevelReport>(read, 'earth');
      for (const e of spike.splinters.filter((splinter) => splinter.level === 3)) {
        expect(e.hit, 'enemies hit are enemies caught').toBeLessThanOrEqual(e.caught);
      }
      expect(spike.maxStruck[3], 'enemies one level 3 spike struck').toBeLessThanOrEqual(1);
      expect(liveOf(read, 'earth'), 'spikes in the air').toBeLessThanOrEqual(MAX_LIVE_SPIKES);
      expect(read.trace?.maxSpikes ?? 0, 'most spikes in the air in a frame').toBeLessThanOrEqual(
        MAX_LIVE_SPIKES,
      );
    },
  );
  const spike = reportOf<SpikeLevelReport>(seen, 'earth');
  console.log(
    `spike lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: splinters ${spike.splinterCount}, logged hit/caught ${spike.splinters.map((e) => `${e.hit}/${e.caught}`).join(',')}, most struck by one spike ${spike.maxStruck[3]}, level-stream rolls ${spike.levelStreamRolls}, peak spikes ${seen.trace?.maxSpikes}`,
  );
  expect(errors).toEqual([]);
});

test('Boulder level 2 throws two boulders a cast, at two different enemies', async ({ page }) => {
  const errors = collectErrors(page);
  // startAt=120: a crowd, so the second boulder has a second enemy to head for.
  await startEarthRun(page, 'earth_boulder:2', 'startAt=120');
  await record(page);
  const seen = await until(
    page,
    'a level 2 throw of 2 boulders at 2 different enemies',
    (read) =>
      reportOf<BoulderLevelReport>(read, 'earth_boulder').throws.some(
        (t) => t.level === 2 && t.boulders === BOULDER_SPLIT.count && t.distinctTargets === 2,
      ),
    (read) => {
      const boulder = reportOf<BoulderLevelReport>(read, 'earth_boulder');
      for (const t of boulder.throws.filter((throwing) => throwing.level === 2)) {
        expect(t.boulders, 'boulders from one throw').toBeLessThanOrEqual(BOULDER_SPLIT.count);
        expect(t.distinctTargets, 'targets are boulders').toBeLessThanOrEqual(t.boulders);
      }
      expect(boulder.rutTileCount, 'a level 2 boulder lays no rut').toBe(0);
      expect(boulder.rut, 'a level 2 boulder logs no rut').toEqual([]);
      expect(boulder.liveBoulders, 'boulders in the air').toBeLessThanOrEqual(MAX_LIVE_BOULDERS);
      expect(
        read.trace?.maxBoulders ?? 0,
        'most boulders in the air in a frame',
      ).toBeLessThanOrEqual(MAX_LIVE_BOULDERS);
    },
  );
  const boulder = reportOf<BoulderLevelReport>(seen, 'earth_boulder');
  console.log(
    `boulder lv2 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: throws logged ${boulder.throws.length}, boulders ${boulder.throws.map((t) => t.boulders).join(',')}, distinct ${boulder.throws.map((t) => t.distinctTargets).join(',')}, peak boulders ${seen.trace?.maxBoulders}`,
  );
  expect(errors).toEqual([]);
});

test('Boulder level 3 ploughs a rut that staggers, inside the tile cap', async ({ page }) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd, so boulders roll through enemies and the rut has someone to catch.
  // No level 1 spike or other spell staggers, so a stagger here is the rut's.
  await startEarthRun(page, 'earth:1,earth_boulder:3', 'startAt=300');
  await record(page);
  // The cause: a level 3 boulder rolling. The effect, in the same entry: tiles
  // laid along its roll, and, with them on the ground, an enemy staggered and hurt.
  // More tiles laid than the cap holds shows tiles expire (a tile is laid only
  // below the cap), and a reading with tiles down and no boulder in the air shows
  // a tile outlives the boulder that laid it.
  let outlived = false;
  const seen = await until(
    page,
    'rut tiles laid past the cap, a tile outliving its boulder, and an enemy staggered and hurt by the rut',
    (read) => {
      const boulder = reportOf<BoulderLevelReport>(read, 'earth_boulder');
      outlived ||= boulder.liveRutTiles > 0 && boulder.liveBoulders === 0;
      return (
        boulder.rutTileCount > MAX_LIVE_RUT_TILES &&
        outlived &&
        boulder.rut.some((t) => t.level === 3 && t.tiles > 0) &&
        boulder.rutStaggers > 0 &&
        boulder.rutHits > 0 &&
        boulder.rutDamage > 0
      );
    },
    (read) => {
      const boulder = reportOf<BoulderLevelReport>(read, 'earth_boulder');
      const perBoulder = Math.floor(BASE_BOULDER_STATS.range / LANDSLIDE.spacingPx) + 1;
      for (const t of boulder.rut) {
        expect(t.level, 'only level 3 boulders log a rut').toBe(3);
        expect(t.tiles, 'tiles from one boulder').toBeLessThanOrEqual(perBoulder);
        expect(t.tiles + t.dropped, 'tiles due of one boulder').toBeLessThanOrEqual(perBoulder);
      }
      expect(boulder.liveRutTiles, 'rut tiles on the ground').toBeLessThanOrEqual(
        MAX_LIVE_RUT_TILES,
      );
      // The rut has its own pool: it never takes room from the shared area pool.
      expect(read.areas, 'ground areas').toBeLessThanOrEqual(MAX_LIVE_AREAS);
      // Per-boulder entries are dropped on every despawn path: never more than boulders in the air.
      expect(boulder.tracked, 'boulders tracked').toBeLessThanOrEqual(boulder.liveBoulders);
      expect(boulder.liveBoulders, 'boulders in the air').toBeLessThanOrEqual(MAX_LIVE_BOULDERS);
      expect(read.trace?.maxBoulders ?? 0, 'most boulders in a frame').toBeLessThanOrEqual(
        MAX_LIVE_BOULDERS,
      );
    },
  );
  const boulder = reportOf<BoulderLevelReport>(seen, 'earth_boulder');
  console.log(
    `boulder lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: rut tiles laid ${boulder.rutTileCount}, dropped ${boulder.rut.reduce((n, t) => n + t.dropped, 0)}, boulders logged ${boulder.rut.length}, per boulder ${boulder.rut.map((t) => t.tiles).join(',')}, live ${boulder.liveRutTiles}, rut ticks ${boulder.rutTicks}, rut staggers ${boulder.rutStaggers}, rut hits ${boulder.rutHits} (${boulder.rutDamage.toFixed(0)} dmg), outlived ${outlived}, peak staggered ${seen.trace?.maxStaggered}, areas ${seen.areas}, peak boulders ${seen.trace?.maxBoulders}`,
  );
  expect(errors).toEqual([]);
});

test('Earth Shield level 2 has four stones on the ring', async ({ page }) => {
  const errors = collectErrors(page);
  await startEarthRun(page, 'earth_shield:2', 'startAt=120');
  const seen = await until(
    page,
    'a ring of 4 stones',
    (read) => reportOf<EarthShieldLevelReport>(read, 'earth_shield').stones === 4,
    (read) => {
      const shield = reportOf<EarthShieldLevelReport>(read, 'earth_shield');
      expect(shield.stones, 'stones on the ring').toBeLessThanOrEqual(4);
      expect(shield.tremorCount, 'tremors at level 2').toBe(0);
    },
  );
  const shield = reportOf<EarthShieldLevelReport>(seen, 'earth_shield');
  console.log(`shield lv2: stones ${shield.stones}, tremors ${shield.tremorCount}`);
  expect(errors).toEqual([]);
});

test('Earth Shield level 3 sends a tremor every 2 s that staggers the enemies it reaches', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd, so enemies stand within reach of the ring.
  await startEarthRun(page, 'earth_shield:3', 'startAt=300');
  const seen = await until(
    page,
    'a tremor that reached enemies and staggered them, after a second one',
    (read) => {
      const shield = reportOf<EarthShieldLevelReport>(read, 'earth_shield');
      return (
        shield.tremorCount >= 2 &&
        shield.tremors.some((t) => t.level === 3 && t.caught > 0 && t.staggered > 0)
      );
    },
    (read) => {
      const shield = reportOf<EarthShieldLevelReport>(read, 'earth_shield');
      expect(shield.stones, 'stones on the ring').toBeLessThanOrEqual(4);
      // The ring never falls under `invulnerable`, so every tremor is on the fixed cadence; `atS` is the
      // frame it struck on, so a gap can read a frame (0.2 s at this time scale) short.
      const at = shield.tremors.map((t) => t.atS);
      for (let i = 1; i < at.length; i++) {
        const gap = (at[i] ?? 0) - (at[i - 1] ?? 0);
        expect(gap, 'seconds between tremors').toBeGreaterThanOrEqual(TREMOR.everyS - 0.2);
        expect(gap, 'seconds between tremors').toBeLessThanOrEqual(TREMOR.everyS + 0.5);
      }
      for (const t of shield.tremors) {
        expect(t.staggered, 'staggered are caught').toBeLessThanOrEqual(t.caught);
        if (t.bossStaggerS !== null) {
          expect(t.bossStaggerS, 'boss stagger').toBeLessThanOrEqual(TREMOR.staggerS + 1e-6);
        }
      }
    },
  );
  const shield = reportOf<EarthShieldLevelReport>(seen, 'earth_shield');
  console.log(
    `shield lv3: tremors ${shield.tremorCount}, at ${shield.tremors.map((t) => t.atS.toFixed(2)).join(',')}, staggered/caught ${shield.tremors.map((t) => `${t.staggered}/${t.caught}`).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('Earthquake level 2 opens two quakes a cast, apart, each paying every tick', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd in two groups, so the second quake has a group of its own.
  await startEarthRun(page, 'earth_quake:2', 'startAt=300');
  const seen = await until(
    page,
    'a level 2 cast of 2 quakes apart, and a quake that paid all its ticks',
    (read) => {
      const quake = reportOf<QuakeLevelReport>(read, 'earth_quake');
      return (
        quake.casts.some(
          (c) =>
            c.level === 2 &&
            c.patches === QUAKE_SPLIT.count &&
            c.gapPx !== null &&
            c.gapPx >= QUAKE_SPLIT.minGapFactor * BASE_QUAKE_STATS.radius - 1e-6,
        ) && quake.patchTicks.some((p) => p.ticks === QUAKE_TICKS)
      );
    },
    (read) => {
      const quake = reportOf<QuakeLevelReport>(read, 'earth_quake');
      for (const c of quake.casts.filter((cast) => cast.level === 2)) {
        expect(c.patches, 'quakes from one cast').toBeLessThanOrEqual(QUAKE_SPLIT.count);
        if (c.patches === 1) expect(c.gapPx, 'one quake has no gap').toBeNull();
        if (c.gapPx !== null) {
          expect(c.gapPx, 'gap between the two centres').toBeGreaterThanOrEqual(
            QUAKE_SPLIT.minGapFactor * BASE_QUAKE_STATS.radius - 1e-6,
          );
        }
      }
      for (const p of quake.patchTicks) {
        expect(p.ticks, `ticks of quake ${p.patch}`).toBeLessThanOrEqual(QUAKE_TICKS);
      }
      // With no quake on the ground every one has ended, and each paid all its ticks.
      if (read.areas === 0) {
        for (const p of quake.patchTicks) {
          expect(p.ticks, `ticks of ended quake ${p.patch}`).toBe(QUAKE_TICKS);
        }
      }
      expect(quake.aftershockCount, 'aftershocks at level 2').toBe(0);
      expect(read.areas, 'ground areas').toBeLessThanOrEqual(MAX_LIVE_AREAS);
    },
  );
  const quake = reportOf<QuakeLevelReport>(seen, 'earth_quake');
  console.log(
    `quake lv2 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: casts ${quake.casts.map((c) => `${c.patches}@${c.gapPx === null ? '-' : c.gapPx.toFixed(0)}`).join(',')}, ticks ${quake.patchTicks.map((p) => p.ticks).join(',')}, areas ${seen.areas}`,
  );
  expect(errors).toEqual([]);
});

test('Earthquake level 3 ends in an aftershock that hits and throws out whatever stood inside', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd, so a quake ends with enemies still inside it.
  await startEarthRun(page, 'earth_quake:3', 'startAt=300');
  // The cause: a level 3 quake ending. The effect, in the same entry: enemies that stood
  // inside, hit, and thrown clear of the rim (a wall or the boss can hold one).
  const seen = await until(
    page,
    'an aftershock that hit enemies and threw them out of the quake',
    (read) =>
      reportOf<QuakeLevelReport>(read, 'earth_quake').aftershocks.some(
        (a) => a.level === 3 && a.inside > 0 && a.hit > 0 && a.insideAfter === 0,
      ),
    (read) => {
      const quake = reportOf<QuakeLevelReport>(read, 'earth_quake');
      for (const a of quake.aftershocks) {
        expect(a.hit, 'hit are inside').toBeLessThanOrEqual(a.inside);
        expect(a.insideAfter, 'still inside after the throw').toBeLessThanOrEqual(a.inside);
        if (a.bossThrowPx !== null) {
          expect(a.bossThrowPx, 'boss throw').toBeLessThanOrEqual(AFTERSHOCK.bossMaxThrowPx + 1e-6);
        }
      }
      expect(quake.aftershockCount, 'aftershocks so far').toBeGreaterThanOrEqual(
        quake.aftershocks.length,
      );
      // Two quakes a cast, each on its own clock: each ends in one aftershock, never two.
      const patches = quake.aftershocks.map((a) => a.patch);
      expect(new Set(patches).size, 'one aftershock per quake').toBe(patches.length);
      expect(read.areas, 'ground areas').toBeLessThanOrEqual(MAX_LIVE_AREAS);
    },
  );
  const quake = reportOf<QuakeLevelReport>(seen, 'earth_quake');
  console.log(
    `quake lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: aftershocks ${quake.aftershockCount}, hit/inside/after ${quake.aftershocks.map((a) => `${a.hit}/${a.inside}/${a.insideAfter}`).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('Earth Companion level 2 attacks twice as fast and its swing sweeps the enemies in front', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd, so a swing has other enemies in its arc.
  await startEarthRun(page, 'earth_companion:2', 'startAt=300');
  // The cause: a landed level 2 swing. The effect, in the same entry: other enemies
  // in the arc and hit, on the halved cadence.
  const seen = await until(
    page,
    'a level 2 swing that swept other enemies and hit them, on the halved cadence',
    (read) =>
      reportOf<CompanionLevelReport>(read, 'earth_companion').slams.some(
        (s) =>
          s.level === 2 &&
          s.swept > 0 &&
          s.sweptHit > 0 &&
          Math.abs(s.cadenceS - s.attackCooldownS * EARTH_COMPANION_SWEEP.cooldownFactor) < 1e-9,
      ),
    (read) => {
      const companion = reportOf<CompanionLevelReport>(read, 'earth_companion');
      for (const s of companion.slams.filter((slam) => slam.level === 2)) {
        expect(s.cadenceS, 'attack cadence').toBeCloseTo(
          s.attackCooldownS * EARTH_COMPANION_SWEEP.cooldownFactor,
          9,
        );
        expect(s.swept, 'enemies in the arc').toBeLessThanOrEqual(EARTH_COMPANION_SWEEP.maxTargets);
        expect(s.sweptHit, 'swept are hit').toBeLessThanOrEqual(s.swept);
        expect(s.patchPlaced, 'a level 2 swing leaves no patch').toBe(false);
      }
      expect(companion.liveSeismicPatches, 'seismic patches at level 2').toBe(0);
    },
  );
  const companion = reportOf<CompanionLevelReport>(seen, 'earth_companion');
  console.log(
    `earth companion lv2 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: slams ${companion.slams.length}, swept ${companion.slams.map((s) => `${s.sweptHit}/${s.swept}`).join(',')}, cadence ${companion.slams.at(-1)?.cadenceS}`,
  );
  expect(errors).toEqual([]);
});

test('Earth Companion level 3 leaves a seismic patch under each swing that staggers, inside the patch cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startEarthRun(page, 'earth_companion:3', 'startAt=300');
  await record(page);
  // The cause: a landed level 3 swing. The effect, in the same entry: a patch placed
  // (or skipped for the cap), and, with it on the ground, enemies staggered. The
  // companion is the run's only stagger source here.
  const seen = await until(
    page,
    'a level 3 swing that placed a patch, and an enemy staggered by one',
    (read) =>
      reportOf<CompanionLevelReport>(read, 'earth_companion').slams.some(
        (s) => s.level === 3 && s.patchPlaced,
      ) && (read.trace?.maxStaggered ?? 0) > 0,
    (read) => {
      const companion = reportOf<CompanionLevelReport>(read, 'earth_companion');
      for (const s of companion.slams.filter((slam) => slam.level === 3)) {
        expect(s.patchPlaced && s.patchSkipped, 'placed and skipped are exclusive').toBe(false);
      }
      expect(companion.liveSeismicPatches, 'seismic patches').toBeLessThanOrEqual(
        MAX_LIVE_SEISMIC_PATCHES,
      );
      expect(read.trace?.maxSeismic ?? 0, 'most patches in a frame').toBeLessThanOrEqual(
        MAX_LIVE_SEISMIC_PATCHES,
      );
      expect(read.areas, 'ground areas').toBeLessThanOrEqual(MAX_LIVE_AREAS);
    },
  );
  const companion = reportOf<CompanionLevelReport>(seen, 'earth_companion');
  console.log(
    `earth companion lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: slams ${companion.slams.length}, placed ${companion.slams.filter((s) => s.patchPlaced).length}, skipped ${companion.slams.filter((s) => s.patchSkipped).length}, peak patches ${seen.trace?.maxSeismic}, peak staggered ${seen.trace?.maxStaggered}`,
  );
  expect(errors).toEqual([]);
});

test('the whole Earth roster at level 3 holds every pool cap for 100 s and keeps its frame rate', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const all = [
    'earth:3',
    'earth_boulder:3',
    'earth_shield:3',
    'earth_quake:3',
    'earth_companion:3',
  ];
  // startAt=600: the thickest crowd of the window. No per-frame record hook: this
  // check is about the frame rate, which a listener on every frame would cost.
  await startEarthRun(page, all.join(','), 'startAt=600');
  let startMs: number | null = null;
  let worst = { fx: 0, areas: 0, spikes: 0, boulders: 0, seismic: 0, rut: 0 };
  const seen = await until(
    page,
    'the roster held its caps to the end of the window',
    (read) => {
      startMs ??= read.elapsedMs;
      return read.elapsedMs - startMs >= RUN_MS;
    },
    (read) => {
      const spikes = liveOf(read, 'earth');
      const boulders = liveOf(read, 'earth_boulder');
      const seismic = reportOf<CompanionLevelReport>(read, 'earth_companion').liveSeismicPatches;
      const rut = reportOf<BoulderLevelReport>(read, 'earth_boulder').liveRutTiles;
      expect(spikes, 'spikes in the air').toBeLessThanOrEqual(MAX_LIVE_SPIKES);
      expect(boulders, 'boulders in the air').toBeLessThanOrEqual(MAX_LIVE_BOULDERS);
      expect(
        reportOf<EarthShieldLevelReport>(read, 'earth_shield').stones,
        'stones on the ring',
      ).toBeLessThanOrEqual(4);
      expect(seismic, 'seismic patches').toBeLessThanOrEqual(MAX_LIVE_SEISMIC_PATCHES);
      expect(rut, 'rut tiles').toBeLessThanOrEqual(MAX_LIVE_RUT_TILES);
      expect(read.areas, 'ground areas').toBeLessThanOrEqual(MAX_LIVE_AREAS);
      expect(read.fx, 'effect bursts').toBeLessThanOrEqual(MAX_LIVE_FX);
      worst = {
        fx: Math.max(worst.fx, read.fx),
        areas: Math.max(worst.areas, read.areas),
        spikes: Math.max(worst.spikes, spikes),
        boulders: Math.max(worst.boulders, boulders),
        seismic: Math.max(worst.seismic, seismic),
        rut: Math.max(worst.rut, rut),
      };
    },
  );
  console.log(
    `roster lv3 over ${((seen.elapsedMs - (startMs ?? 0)) / 1000).toFixed(0)} s: fps ${seen.fps.toFixed(0)}, enemies ${seen.enemies}, peaks ${JSON.stringify(worst)}, splinters ${reportOf<SpikeLevelReport>(seen, 'earth').splinterCount}, tremors ${reportOf<EarthShieldLevelReport>(seen, 'earth_shield').tremorCount}, aftershocks ${reportOf<QuakeLevelReport>(seen, 'earth_quake').aftershockCount}`,
  );
  for (const id of ['earth', 'earth_boulder', 'earth_shield', 'earth_quake', 'earth_companion']) {
    expect(seen.levels.find((l) => l.id === id)?.level, `${id} level`).toBe(3);
  }
  expect(seen.enemies, 'a crowd to the end').toBeGreaterThan(0);
  expect(seen.fps, 'frame rate').toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
