import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  DRAGON_PIERCE,
  FIRE_TRAIL,
  MAX_LIVE_EMBERS,
  MAX_LIVE_SCORCH_PIECES,
  MAX_LIVE_TRAIL_FLAMES,
  MAX_LIVE_TRAIL_ZONES,
  SCORCH_CLIP,
} from '../src/config/fireLevels';
import { MAX_LIVE_AREAS, MAX_LIVE_TELEGRAPHS } from '../src/config/fx';
import type { RosterSpellId } from '../src/config/loadout';
import { SPELL_IDS } from '../src/config/spells';
import { scorchSlots } from '../src/core/fireTrail';
import { MAX_LIVE_WAVES } from '../src/core/fireWave';
import { MAX_LIVE_DRAGONS } from '../src/core/homing';
import type { OfferCard } from '../src/core/levelUp';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { CompanionLevelReport } from '../src/spells/CompanionSpell';
import type { DragonLevelReport } from '../src/spells/FireDragonSpell';
import type { FireBoltLevelReport } from '../src/spells/FireballSpell';
import type { FireWaveLevelReport } from '../src/spells/FireWaveSpell';
import type { MeteorLevelReport } from '../src/spells/MeteorSpell';
import { cardCenter, collectErrors, MIN_FPS, waitForScene } from './game';

/**
 * #327 in the browser: each Fire spell's level 2 and level 3 rule, seen in a
 * real seeded run started from a `?loadout=` link, and the whole roster at
 * level 3 holding every pool cap and the frame rate.
 *
 * `core/fireLevels.test.ts` and `core/spellLevelStats.test.ts` cover each rule.
 * What only a run can show is that the spell classes apply them, that the level
 * a spell was cast at is the level the link set, and that the drawn things (the
 * embers, the giant meteor, the second wave front) are on screen.
 *
 * Every spell's `levelReport` (through `GameScene.fireLevelReport`) keeps the
 * level each cast ran at in its own record, and cause and effect share a
 * record: the fireball that landed is the one that placed the pond. So each
 * check is a predicate on one reading of the hook, never a match between two
 * samples, and a level-up pick taken mid-run cannot pass a check for a level it
 * did not run at. Nothing is a fixed sample count: a check samples until its
 * thing is seen, bounded by the run clock and by the wall clock.
 *
 * Some things live shorter than a sample (an ember flies 0.3 s of run, a wave
 * front 0.7 s, a pond 1.5 s, and a run at ?timeScale=10 covers that in a few
 * frames). Those few are noted in the page frame by frame (`record`), which
 * costs the run one hook read a frame, so the roster test that reads the frame
 * rate does not use it.
 */

const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read(bytes: Buffer): { width: number; height: number; data: Buffer } } };
};

const SEED_QUERY = 'seed=1&timeScale=10&invulnerable=1';
/** The window is read off the HUD's run clock, so a slow runner covers the same run (#187, #190). */
const RUN_MS = 100_000;
/** A runner too slow to see a thing before the run clock runs out, or in this much wall clock, fails. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;

/** Pick order at a level-up: never spend the pick on a Fire upgrade card, which would change the level under test. */
const PICK_ORDER: readonly OfferCard['kind'][] = [
  'passive',
  'relic',
  'charge',
  'active',
  'upgrade',
];

/** What the page notes frame by frame, when `record` asked for it. */
interface Trace {
  /** The most embers alive in any one frame. */
  maxEmbers: number;
  /** `clip@scale` of every ember drawn. */
  emberViews: string[];
  /** Where every `fire.pond` seen was, and how wide. */
  ponds: { x: number; y: number; radius: number }[];
  /** The most waves alive in any one frame. */
  maxWaves: number;
  /** The angle in degrees between the two fronts of every two-front wave seen. */
  frontGapsDeg: number[];
  /** The most burnt-ground zones, scorch pieces and flames alive in any one frame. */
  maxZones: number;
  maxPieces: number;
  maxFlames: number;
  /** Every scorch frame drawn, and `clip@scale` of every flame. */
  scorchFrames: string[];
  flameViews: string[];
}

/** Where a burnt-ground zone lay on the page, when the look check froze the run on it. */
interface LookShot {
  x: number;
  y: number;
  heading: number;
  halfArc: number;
  range: number;
}

/** The look check's progress: 1 = a zone fully laid and frozen, 3 = its wave gone and the ground alone, frozen; 4 = done. */
interface Look {
  stage: 0 | 1 | 2 | 3 | 4;
  zoneId: number;
  shots: LookShot[];
}

/** Everything a check reads, from one evaluate so the values come from one frame. */
interface Read {
  fire: GameScene['fireLevelReport'];
  levels: { id: RosterSpellId; level: number }[];
  dragonsLive: number;
  telegraphs: number;
  areas: number;
  ponds: { x: number; y: number; radius: number; clip: string | null }[];
  enemies: number;
  fps: number;
  elapsedMs: number;
  /** The kinds of the offer on screen, when a level-up is waiting for a card. */
  offer: OfferCard['kind'][] | null;
  trace: Trace | null;
  look: Look | null;
}

async function startFireRun(page: Page, loadout: string): Promise<void> {
  await page.goto(`/?${SEED_QUERY}&loadout=${loadout}`);
  await waitForScene(page, SCENE.intro);
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
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
      const strike = run.strikeReport;
      return {
        fire: run.fireLevelReport,
        levels: run.spellLevels as { id: RosterSpellId; level: number }[],
        dragonsLive: run.fireReport.find((entry) => entry.id === 'fire_dragon')?.live ?? 0,
        telegraphs: strike.live.length,
        areas: run.areaReport.live.length,
        ponds: strike.ponds.map(({ x, y, radius, clip }) => ({ x, y, radius, clip })),
        enemies: run.liveEnemyCount,
        fps: game.loop.actualFps,
        elapsedMs: hud.view.elapsedMs,
        offer: levelUp ? levelUp.view.cards.map((card) => card.kind) : null,
        trace: (window as unknown as { fireTrace?: Trace }).fireTrace ?? null,
        look: (window as unknown as { fireLook?: Look }).fireLook ?? null,
      };
    },
    [SCENE.game, SCENE.hud, SCENE.levelUp] as const,
  );
}

type Recorded = 'embers' | 'ponds' | 'waves' | 'trail';

/** Note in the page, every frame, what a sample every 100 ms would miss. */
async function record(page: Page, what: readonly Recorded[]): Promise<void> {
  await page.evaluate(
    async ([gameKey, wanted]) => {
      const { game } = await import('/src/main.ts');
      const run = game.scene.getScene(gameKey) as unknown as GameScene;
      const trace: Trace = {
        maxEmbers: 0,
        emberViews: [],
        ponds: [],
        maxWaves: 0,
        frontGapsDeg: [],
        maxZones: 0,
        maxPieces: 0,
        maxFlames: 0,
        scorchFrames: [],
        flameViews: [],
      };
      (window as unknown as { fireTrace: Trace }).fireTrace = trace;
      const note = <T>(list: T[], item: T, same: (a: T) => boolean): void => {
        if (list.length < 200 && !list.some(same)) list.push(item);
      };
      run.events.on('postupdate', () => {
        if (wanted.includes('embers') || wanted.includes('waves') || wanted.includes('trail')) {
          for (const { id, report } of run.fireLevelReport) {
            if (id === 'fire' && wanted.includes('embers')) {
              const bolt = report as unknown as {
                liveEmbers: number;
                emberViews: { clip: string | null; scale: number }[];
              };
              trace.maxEmbers = Math.max(trace.maxEmbers, bolt.liveEmbers);
              for (const view of bolt.emberViews) {
                const key = `${view.clip}@${view.scale}`;
                note(trace.emberViews, key, (k) => k === key);
              }
            }
            if (id === 'fire_column' && wanted.includes('trail')) {
              const { trail } = report as unknown as FireWaveLevelReport;
              trace.maxZones = Math.max(trace.maxZones, trail.zonesLive);
              trace.maxPieces = Math.max(trace.maxPieces, trail.piecesLive);
              trace.maxFlames = Math.max(trace.maxFlames, trail.flamesLive);
              for (const frame of trail.views.frames)
                note(trace.scorchFrames, frame, (f) => f === frame);
              for (const { clip, scale } of trail.views.flames) {
                const key = `${clip}@${scale}`;
                note(trace.flameViews, key, (k) => k === key);
              }
            }
            if (id === 'fire_column' && wanted.includes('waves')) {
              const waves = (report as unknown as FireWaveLevelReport).live;
              trace.maxWaves = Math.max(trace.maxWaves, waves.length);
              for (const wave of waves) {
                const [a, b] = wave.frontRotations;
                if (wave.fronts !== 2 || a === undefined || b === undefined) continue;
                const gap = Math.round(Math.abs(((b - a) * 180) / Math.PI) * 10) / 10;
                note(trace.frontGapsDeg, gap, (g) => g === gap);
              }
            }
          }
        }
        if (wanted.includes('ponds')) {
          for (const { x, y, radius, clip } of run.strikeReport.ponds) {
            if (clip !== 'fire.pond') continue;
            note(
              trace.ponds,
              { x, y, radius },
              (p) => p.x === x && p.y === y && p.radius === radius,
            );
          }
        }
      });
    },
    [SCENE.game, what] as const,
  );
}

/**
 * Sample until `done` holds for one reading. `each` runs on every reading, for
 * the rules that must hold at every moment (a cap, a cadence). Fails with the
 * last reading when the run clock or the wall clock runs out first.
 */
async function until(
  page: Page,
  label: string,
  done: (read: Read) => boolean,
  each: (read: Read) => void = () => undefined,
): Promise<Read> {
  const deadline = Date.now() + WALL_CAP_MS;
  let last: Read | null = null;
  while (Date.now() < deadline) {
    const read = await readRun(page);
    if (!read) break;
    last = read;
    // A level-up pauses the run under its overlay; answer it, but never with an upgrade card.
    if (read.offer) {
      const best = read.offer
        .map((kind, index) => ({ index, rank: PICK_ORDER.indexOf(kind) }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)[0];
      await page.keyboard.press(`${(best?.index ?? 0) + 1}`);
    }
    each(read);
    if (done(read)) return read;
    if (read.elapsedMs >= RUN_MS) break;
    await page.waitForTimeout(SAMPLE_MS);
  }
  throw new Error(
    `${label}: not seen by run clock ${last?.elapsedMs ?? '?'} ms. Last reading: ${JSON.stringify(last).slice(0, 3000)}`,
  );
}

function reportOf<T>(read: Read, id: RosterSpellId): T {
  const entry = read.fire.find((f) => f.id === id);
  if (!entry) throw new Error(`${id} is not casting`);
  return entry.report as unknown as T;
}

test('Fire Bolt level 2 fires two bolts at two different enemies', async ({ page }) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire:2');
  await until(page, 'a level 2 volley of 2 shots at 2 targets', (read) =>
    reportOf<FireBoltLevelReport>(read, 'fire').volleys.some(
      (v) => v.level === 2 && v.shots === 2 && v.distinctTargets === 2,
    ),
  );
  expect(errors).toEqual([]);
});

test('Fire Bolt level 3 throws three half-size embers from every blast, inside its pool cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire:3');
  await record(page, ['embers']);
  // The cause: a level 3 blast that threw three. The effect: embers drawn as the
  // bolt's own clip at half its size, seen in flight, never more alive than the pool holds.
  const seen = await until(
    page,
    'a level 3 blast of 3 embers, with embers drawn in flight',
    (read) =>
      reportOf<FireBoltLevelReport>(read, 'fire').explosions.some(
        (e) => e.level === 3 && e.embers === 3,
      ) &&
      (read.trace?.emberViews.includes('fire.ball@0.5') ?? false),
    (read) => {
      const bolt = reportOf<FireBoltLevelReport>(read, 'fire');
      expect(bolt.liveEmbers, 'embers alive').toBeLessThanOrEqual(MAX_LIVE_EMBERS);
      expect(read.trace?.maxEmbers ?? 0, 'most embers alive in a frame').toBeLessThanOrEqual(
        MAX_LIVE_EMBERS,
      );
    },
  );
  const bolt = reportOf<FireBoltLevelReport>(seen, 'fire');
  console.log(
    `bolt lv3: explosions ${bolt.explosions.length}, ember hits ${bolt.emberHits}, dropped ${bolt.embersDropped}, peak embers ${seen.trace?.maxEmbers}`,
  );
  expect(seen.trace?.emberViews).toEqual(['fire.ball@0.5']);
  expect(errors).toEqual([]);
});

test('Meteor level 2 drops two meteors per cast on two different enemies', async ({ page }) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_meteor:2');
  await until(page, 'a level 2 cast of 2 strikes on 2 targets', (read) =>
    reportOf<MeteorLevelReport>(read, 'fire_meteor').casts.some(
      (c) => c.level === 2 && c.strikes === 2 && c.distinctTargets === 2 && !c.giant,
    ),
  );
  expect(errors).toEqual([]);
});

test('Meteor level 3 drops a giant meteor every third cast: wider blast, wider pond, drawn bigger', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_meteor:3');
  await record(page, ['ponds']);
  // Cataclysm is the FIRST strike of a cast, so the last landing is usually a
  // normal one: search the whole log for each kind.
  const seen = await until(page, 'a giant landing and a normal one, both at level 3', (read) => {
    const { landings, casts } = reportOf<MeteorLevelReport>(read, 'fire_meteor');
    const giant = landings.find((l) => l.level === 3 && l.giant && l.pondPlaced);
    return (
      giant !== undefined &&
      landings.some((l) => l.level === 3 && !l.giant && l.pondPlaced) &&
      casts.some((c) => c.level === 3 && c.giant) &&
      casts.some((c) => c.level === 3 && !c.giant) &&
      (read.trace?.ponds.some(
        (p) => Math.abs(p.x - giant.x) < 0.5 && Math.abs(p.y - giant.y) < 0.5,
      ) ??
        false)
    );
  });
  const { landings, casts } = reportOf<MeteorLevelReport>(seen, 'fire_meteor');
  const giant = landings.find((l) => l.level === 3 && l.giant && l.pondPlaced)!;
  const normal = landings.find((l) => l.level === 3 && !l.giant && l.pondPlaced)!;
  console.log(`meteor lv3: giant ${JSON.stringify(giant)} normal ${JSON.stringify(normal)}`);
  expect(Math.abs(giant.radius - normal.radius * 2)).toBeLessThan(0.5);
  expect(Math.abs(giant.pondRadius - normal.pondRadius * 1.6)).toBeLessThan(0.5);
  expect(giant.blast).toBeGreaterThan(normal.blast);

  // Cadence: a giant cast is a third one, and only the first strike of it.
  const giantCast = casts.find((c) => c.level === 3 && c.giant)!;
  const normalCast = casts.find((c) => c.level === 3 && !c.giant)!;
  expect(giantCast.castNumber % 3, 'giant cast number').toBe(0);
  for (const cast of casts.filter((c) => c.level === 3)) {
    expect(cast.giant, `cast ${cast.castNumber} giant`).toBe(cast.castNumber % 3 === 0);
  }
  // Bigger at a glance: the sprite is drawn at least 1.8x wider than a normal meteor's.
  expect(giantCast.drawnWidths[0]).toBeGreaterThanOrEqual(1.8 * normalCast.drawnWidths[0]!);

  // The pond the giant left is in the area pool, at the landing, at the giant's width.
  const pond = seen.trace?.ponds.find(
    (p) => Math.abs(p.x - giant.x) < 0.5 && Math.abs(p.y - giant.y) < 0.5,
  );
  expect(pond?.radius, 'pond radius at the giant landing').toBeCloseTo(giant.pondRadius, 0);
  expect(errors).toEqual([]);
});

test('Fire Wave level 2 widens the arc to 150 degrees and draws it with two fronts', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_column:2');
  await record(page, ['waves']);
  const seen = await until(
    page,
    'a level 2 cast of arc 150 with 2 fronts, seen in flight 55 degrees apart',
    (read) =>
      reportOf<FireWaveLevelReport>(read, 'fire_column').casts.some(
        (c) => c.level === 2 && c.arc === 150 && c.fronts === 2,
      ) &&
      (read.trace?.frontGapsDeg.some((gap) => Math.abs(gap - 55) <= 1) ?? false),
  );
  console.log(`wave lv2: front gaps seen ${JSON.stringify(seen.trace?.frontGapsDeg)}`);
  // Burnt ground is level 3's: a level 2 wave has none and lays nothing.
  const report = reportOf<FireWaveLevelReport>(seen, 'fire_column');
  for (const cast of report.casts.filter((c) => c.level === 2)) {
    expect(cast.trail, 'level 2 cast leaves burnt ground').toBe(false);
  }
  expect(report.trail.zones, 'zones a level 2 wave opened').toEqual([]);
  expect(errors).toEqual([]);
});

test('Fire Wave level 3 leaves burnt ground that burns enemies who walk in, in its own capped pools', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_column:3');
  await record(page, ['trail', 'waves']);
  const slots = scorchSlots(150).length;
  // The cause: a level 3 cast that opened a zone, which laid every piece and its
  // flames and then burned someone after the wave was gone. The effect drawn:
  // more than one scorch frame and the tiny flame, seen in the pool.
  const seen = await until(
    page,
    'a level 3 zone that laid all its pieces and burned an enemy after its wave, drawn',
    (read) => {
      const { casts, trail } = reportOf<FireWaveLevelReport>(read, 'fire_column');
      return (
        casts.some((c) => c.level === 3 && c.arc === 150 && c.trail) &&
        trail.zones.some(
          (z) =>
            z.level === 3 &&
            z.slots === slots &&
            z.laid === slots &&
            z.flames === FIRE_TRAIL.flames &&
            z.dropped === 0 &&
            z.burnedAfterWave >= 1,
        ) &&
        (read.trace?.scorchFrames.filter((f) => f.startsWith(`${SCORCH_CLIP}.`)).length ?? 0) >=
          2 &&
        (read.trace?.flameViews.includes(`${FIRE_TRAIL.flameClip}@${FIRE_TRAIL.flameScale}`) ??
          false)
      );
    },
    (read) => {
      const { trail, live } = reportOf<FireWaveLevelReport>(read, 'fire_column');
      expect(trail.zonesLive, 'zones alive').toBeLessThanOrEqual(MAX_LIVE_TRAIL_ZONES);
      expect(trail.piecesLive, 'scorch pieces alive').toBeLessThanOrEqual(MAX_LIVE_SCORCH_PIECES);
      expect(trail.flamesLive, 'trail flames alive').toBeLessThanOrEqual(MAX_LIVE_TRAIL_FLAMES);
      expect(live.length, 'waves alive').toBeLessThanOrEqual(MAX_LIVE_WAVES);
      expect(read.trace?.maxZones ?? 0, 'most zones in a frame').toBeLessThanOrEqual(
        MAX_LIVE_TRAIL_ZONES,
      );
      expect(read.trace?.maxPieces ?? 0, 'most pieces in a frame').toBeLessThanOrEqual(
        MAX_LIVE_SCORCH_PIECES,
      );
      expect(read.trace?.maxFlames ?? 0, 'most flames in a frame').toBeLessThanOrEqual(
        MAX_LIVE_TRAIL_FLAMES,
      );
      expect(read.trace?.maxWaves ?? 0, 'most waves in a frame').toBeLessThanOrEqual(
        MAX_LIVE_WAVES,
      );
    },
  );
  const { trail } = reportOf<FireWaveLevelReport>(seen, 'fire_column');
  const zone = trail.zones.find((z) => z.laid === slots && z.burnedAfterWave >= 1);
  console.log(
    `wave lv3 trail: zones ${trail.zones.length}, refused ${trail.refused}, most zones ${trail.mostZonesLive}, pieces ${trail.mostPiecesLive}, flames ${trail.mostFlamesLive}, fresh ${zone?.fresh}, burned ${zone?.burned}, after wave ${zone?.burnedAfterWave}`,
  );
  expect(errors).toEqual([]);
});

/** The luma of one screenshot pixel. */
const lumaAt = (data: Buffer, i: number): number =>
  0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;

/** Luma of the pixels of the band `0.3-0.8 range` out and within `0.8 halfArc` of `heading + turn`. */
function bandStats(
  shot: { width: number; height: number; data: Buffer },
  at: LookShot,
  turn: number,
): { n: number; ember: number; mean: number } {
  const [r0, r1, half] = [0.3 * at.range, 0.8 * at.range, 0.8 * at.halfArc];
  let [n, ember, sum] = [0, 0, 0];
  for (let y = Math.max(0, Math.floor(at.y - r1)); y < Math.min(shot.height, at.y + r1); y += 1) {
    for (let x = Math.max(0, Math.floor(at.x - r1)); x < Math.min(shot.width, at.x + r1); x += 1) {
      const d = Math.hypot(x - at.x, y - at.y);
      if (d < r0 || d > r1) continue;
      const off = Math.atan2(y - at.y, x - at.x) - (at.heading + turn);
      if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > half) continue;
      const luma = lumaAt(shot.data, (y * shot.width + x) * 4);
      n += 1;
      sum += luma;
      if (luma >= 96) ember += 1;
    }
  }
  return { n, ember: ember / n, mean: sum / n };
}

/** Freeze the run on the first fully laid zone, then on its ground alone once its wave is gone. */
async function armLook(page: Page): Promise<void> {
  await page.evaluate(
    async ([gameKey]) => {
      const { game } = await import('/src/main.ts');
      const run = game.scene.getScene(gameKey) as unknown as GameScene;
      const look: Look = { stage: 0, zoneId: 0, shots: [] };
      (window as unknown as { fireLook: Look }).fireLook = look;
      run.events.on('postupdate', () => {
        const entry = run.fireLevelReport.find((f) => f.id === 'fire_column');
        if (!entry || (look.stage !== 0 && look.stage !== 2)) return;
        const { trail, live } = entry.report as unknown as FireWaveLevelReport;
        const zone =
          look.stage === 0
            ? trail.zones.find((z) => z.level === 3 && z.slots > 0 && z.laid === z.slots)
            : live.length === 0 && trail.zonesLive > 0
              ? trail.zones.find((z) => z.id === look.zoneId)
              : undefined;
        if (!zone) return;
        const cam = run.cameras.main;
        const rect = game.canvas.getBoundingClientRect();
        const k = rect.width / game.scale.gameSize.width;
        look.zoneId = zone.id;
        look.shots.push({
          x: rect.left + (zone.x - cam.worldView.x) * cam.zoom * k,
          y: rect.top + (zone.y - cam.worldView.y) * cam.zoom * k,
          heading: zone.heading,
          halfArc: (zone.arc / 2) * (Math.PI / 180),
          range: zone.range * cam.zoom * k,
        });
        look.stage = look.stage === 0 ? 1 : 3;
        run.scene.pause();
      });
    },
    [SCENE.game] as const,
  );
}

/** Resume the frozen run and move the look check on to its next stage. */
async function resumeLook(page: Page): Promise<void> {
  await page.evaluate(
    async ([gameKey]) => {
      const { game } = await import('/src/main.ts');
      const look = (window as unknown as { fireLook: Look }).fireLook;
      look.stage = look.stage === 1 ? 2 : 4;
      game.scene.resume(gameKey);
    },
    [SCENE.game] as const,
  );
}

test('Fire Wave level 3 burnt ground reads on the arena floor', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_column:3');
  await armLook(page);
  const shots: { width: number; height: number; data: Buffer }[] = [];
  for (const [stage, name] of [
    [1, '14-firewave-lv3-trail'],
    [3, '15-firewave-lv3-trail-after'],
  ] as const) {
    await until(
      page,
      `the run frozen at look stage ${stage}`,
      (read) => read.look?.stage === stage,
    );
    const png = await page.screenshot();
    await testInfo.attach(name, { body: png, contentType: 'image/png' });
    // FIRE_LOOK_DIR, when set, is where the pictures are kept for a person to look at.
    const dir = process.env.FIRE_LOOK_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.png`), png);
    }
    shots.push(PNG.sync.read(png));
    await resumeLook(page);
  }
  const look = (await readRun(page))?.look;
  const at = look?.shots[0];
  expect(at, 'the frozen zone').toBeDefined();
  // The burnt ground against the same band on the far side of the caster, where
  // nothing was laid: more ember pixels, or a darker floor, by a margin.
  const stain = bandStats(shots[0]!, at!, 0);
  const bare = bandStats(shots[0]!, at!, Math.PI);
  const after = bandStats(shots[1]!, look!.shots[1]!, 0);
  console.log(
    `trail look: stain ember ${(stain.ember * 100).toFixed(2)}% mean ${stain.mean.toFixed(1)} (${stain.n} px); bare ember ${(bare.ember * 100).toFixed(2)}% mean ${bare.mean.toFixed(1)} (${bare.n} px); after wave ember ${(after.ember * 100).toFixed(2)}% mean ${after.mean.toFixed(1)}`,
  );
  expect(stain.n, 'pixels in the stain band').toBeGreaterThan(500);
  expect(bare.n, 'pixels in the mirror band').toBeGreaterThan(500);
  expect(
    stain.ember - bare.ember >= 0.01 || bare.mean - stain.mean >= 4,
    'burnt ground shows against the bare floor',
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('Fire Companion level 2 fires two projectiles per attack', async ({ page }) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_companion:2');
  await until(page, 'a level 2 volley of 2 shots', (read) =>
    reportOf<CompanionLevelReport>(read, 'fire_companion').volleys.some(
      (v) => v.level === 2 && v.shots === 2 && !v.fireball,
    ),
  );
  expect(errors).toEqual([]);
});

test('Fire Companion level 3 throws a fireball on every 4th attack that explodes and burns', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_companion:3');
  await until(
    page,
    'a level 3 fireball on an attack divisible by 4, and one that placed its pond',
    (read) => {
      const report = reportOf<CompanionLevelReport>(read, 'fire_companion');
      return (
        report.volleys.some((v) => v.level === 3 && v.fireball && v.attackNumber % 4 === 0) &&
        report.fireballs.some((f) => f.level === 3 && f.pondPlaced)
      );
    },
    (read) => {
      // On every reading: only every 4th attack carries the fireball.
      for (const v of reportOf<CompanionLevelReport>(read, 'fire_companion').volleys) {
        if (v.level === 3) {
          expect(v.fireball, `attack ${v.attackNumber} fireball`).toBe(v.attackNumber % 4 === 0);
        }
      }
    },
  );
  expect(errors).toEqual([]);
});

test('Fire Dragon level 2 sends two dragons at two different enemies', async ({ page }) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_dragon:2');
  await until(
    page,
    'a level 2 cast of 2 dragons at 2 targets',
    (read) =>
      reportOf<DragonLevelReport>(read, 'fire_dragon').casts.some(
        (c) => c.level === 2 && c.dragons === 2 && c.distinctTargets === 2,
      ),
    (read) => {
      expect(read.dragonsLive, 'dragons alive').toBeLessThanOrEqual(MAX_LIVE_DRAGONS);
      for (const flight of reportOf<DragonLevelReport>(read, 'fire_dragon').flights) {
        if (flight.level === 2) expect(flight.hits, 'hits in one flight').toBeLessThanOrEqual(1);
      }
    },
  );
  expect(errors).toEqual([]);
});

test('Fire Dragon level 3 sends three dragons that each strike two different enemies', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire_dragon:3');
  const seen = await until(
    page,
    'a level 3 cast of 3 dragons, and a flight that struck 2 different enemies',
    (read) => {
      const report = reportOf<DragonLevelReport>(read, 'fire_dragon');
      return (
        // Three dragons, not three targets: fewer enemies in range than dragons wraps onto the nearest.
        report.casts.some((c) => c.level === 3 && c.dragons === 3) &&
        report.flights.some(
          (f) => f.level === 3 && f.allowed === 2 && f.hits === 2 && f.distinct === 2,
        )
      );
    },
    (read) => {
      const report = reportOf<DragonLevelReport>(read, 'fire_dragon');
      expect(report.mostHitsOneFlight, 'most hits in one flight').toBeLessThanOrEqual(
        DRAGON_PIERCE.hitsPerFlight,
      );
      expect(read.dragonsLive, 'dragons alive').toBeLessThanOrEqual(MAX_LIVE_DRAGONS);
      for (const f of report.flights) {
        expect(f.hits, 'hits in one flight').toBeLessThanOrEqual(f.allowed);
        expect(f.distinct, 'distinct enemies struck').toBe(f.hits);
      }
    },
  );
  const report = reportOf<DragonLevelReport>(seen, 'fire_dragon');
  console.log(
    `dragon lv3: flights ${report.flights.length}, most hits in one flight ${report.mostHitsOneFlight}, repeats refused ${report.refusedRepeats}`,
  );
  expect(errors).toEqual([]);
});

test('the whole Fire roster at level 3 holds every pool cap and the frame rate over 100 s', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startFireRun(page, 'fire:3,fire_meteor:3,fire_column:3,fire_companion:3,fire_dragon:3');
  // Sampled through the run, not only at the end: a pool that briefly exceeded
  // its cap in between would leave no trace in a final reading.
  let samples = 0;
  let peakEnemies = 0;
  const last = await until(
    page,
    'the run clock reaching 100 s',
    (read) => read.elapsedMs >= RUN_MS,
    (read) => {
      samples += 1;
      peakEnemies = Math.max(peakEnemies, read.enemies);
      expect(
        reportOf<FireBoltLevelReport>(read, 'fire').liveEmbers,
        'embers alive',
      ).toBeLessThanOrEqual(MAX_LIVE_EMBERS);
      expect(
        reportOf<FireWaveLevelReport>(read, 'fire_column').live.length,
        'waves alive',
      ).toBeLessThanOrEqual(MAX_LIVE_WAVES);
      const { trail } = reportOf<FireWaveLevelReport>(read, 'fire_column');
      expect(trail.zonesLive, 'trail zones alive').toBeLessThanOrEqual(MAX_LIVE_TRAIL_ZONES);
      expect(trail.piecesLive, 'scorch pieces alive').toBeLessThanOrEqual(MAX_LIVE_SCORCH_PIECES);
      expect(trail.flamesLive, 'trail flames alive').toBeLessThanOrEqual(MAX_LIVE_TRAIL_FLAMES);
      expect(read.dragonsLive, 'dragons alive').toBeLessThanOrEqual(MAX_LIVE_DRAGONS);
      expect(read.telegraphs, 'meteors falling').toBeLessThanOrEqual(MAX_LIVE_TELEGRAPHS);
      expect(read.areas, 'ground areas alive').toBeLessThanOrEqual(MAX_LIVE_AREAS);
      expect(
        reportOf<DragonLevelReport>(read, 'fire_dragon').mostHitsOneFlight,
        'most hits in one flight',
      ).toBeLessThanOrEqual(DRAGON_PIERCE.hitsPerFlight);
    },
  );
  console.log(
    `roster lv3: ${samples} samples, peak enemies ${peakEnemies}, enemies ${last.enemies}, fps ${last.fps.toFixed(1)}`,
  );
  expect(last.levels.map((l) => l.level)).toEqual([3, 3, 3, 3, 3]);
  expect(last.enemies, 'enemies alive at the reading').toBeGreaterThan(0);
  expect(last.fps, `fps over ${last.enemies} enemies`).toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
