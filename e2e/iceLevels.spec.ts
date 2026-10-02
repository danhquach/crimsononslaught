import { expect, test, type Page } from '@playwright/test';
import {
  FROST_ORB,
  MAX_LIVE_MINI_URCHINS,
  MAX_LIVE_SHARDS,
  MAX_LIVE_SHIELD_ICICLES,
  SHATTER_RING,
} from '../src/config/iceLevels';
import { MAX_COMPANION_SHOTS } from '../src/config/companions';
import { MAX_LIVE_AREAS, MAX_LIVE_FX } from '../src/config/fx';
import type { RosterSpellId } from '../src/config/loadout';
import { SPELL_IDS } from '../src/config/spells';
import { MAX_LIVE_BOMBS, MAX_LIVE_ICICLES } from '../src/core/frostNova';
import { MAX_LIVE_ARROWS } from '../src/core/iceArrow';
import type { OfferCard } from '../src/core/levelUp';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { CompanionLevelReport } from '../src/spells/CompanionSpell';
import type { IceStormLevelReport } from '../src/spells/GroundAreaSpell';
import type { IceArrowLevelReport } from '../src/spells/IceArrowSpell';
import type { IceShieldLevelReport } from '../src/spells/IceShieldSpell';
import type { NovaLevelReport } from '../src/spells/NovaBombSpell';
import { cardCenter, collectErrors, MIN_FPS, waitForScene } from './game';

/**
 * #328 in the browser: each Ice spell's level 2 and level 3 rule, seen in a
 * real seeded run started from a `?loadout=` link. This file is the harness the
 * per-spell checks (added with each spell's step) share, copied from
 * `fireLevels.spec.ts`: one evaluate reads everything a check needs from one
 * frame, `until` samples until a predicate on that one reading holds, and a
 * level-up pick never spends the pick on an upgrade card, which would change
 * the level under test.
 *
 * Rules every check follows (the flake lessons of the Fire suite):
 * - `?loadout=ice:2,ice_shield:3` forces the levels; the `ice` card is the pick
 *   on the spell screen, and `GameScene.extraLevels` levels the default too.
 * - One evaluate per read. A predicate looks at one reading's cause->effect
 *   entries (`iceLevelReport`), never at two samples matched against each other.
 * - No sample-count floors: a check samples until its thing is seen, bounded by
 *   the run clock and the wall clock.
 * - `?invulnerable=1` (the default of `startIceRun`) returns before the shield
 *   absorbs anything, so a shield never breaks under it: the aura checks use it,
 *   the break checks do not (`invulnerable = false`: real contact, `startAt=120`
 *   for a crowd).
 */

export const SEED_QUERY = 'seed=1&timeScale=10';
/** The window is read off the HUD's run clock, so a slow runner covers the same run (#187, #190). */
export const RUN_MS = 100_000;
/** A runner too slow to see a thing before the run clock runs out, or in this much wall clock, fails. */
export const WALL_CAP_MS = 40_000;
export const SAMPLE_MS = 100;

/** Pick order at a level-up: never spend the pick on an Ice upgrade card, which would change the level under test. */
export const PICK_ORDER: readonly OfferCard['kind'][] = [
  'passive',
  'relic',
  'charge',
  'active',
  'upgrade',
];

/** What the page notes frame by frame, when `record` asked for it. */
export interface Trace {
  /** The most shards alive in any one frame. */
  maxShards: number;
  /** `clip@scale` of every shard drawn. */
  shardViews: string[];
  /** The most small urchins alive in any one frame. */
  maxMinis: number;
  /** `clip@scale` of every small urchin drawn. */
  miniViews: string[];
  /** The most shield icicles alive in any one frame. */
  maxShieldIcicles: number;
}

/** Everything a check reads, from one evaluate so the values come from one frame. */
export interface Read {
  ice: GameScene['iceLevelReport'];
  levels: { id: RosterSpellId; level: number }[];
  telegraphs: number;
  areas: number;
  /** Effect bursts playing (`FxPool`). */
  fx: number;
  /** Shots in the air per spell: arrows, and bombs plus icicles. */
  live: { id: RosterSpellId; live: number }[];
  enemies: number;
  fps: number;
  elapsedMs: number;
  /** The kinds of the offer on screen, when a level-up is waiting for a card. */
  offer: OfferCard['kind'][] | null;
  trace: Trace | null;
}

/**
 * Start a seeded run from `?loadout=<loadout>` (a query like `ice:2,ice_shield:3`,
 * `extra` for more parameters such as `startAt=120`), pick the `ice` card, and
 * check the link's levels reached the spells. `invulnerable: false` lets real
 * contact reach the player, which is what breaks a shield.
 */
export async function startIceRun(
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
  const { x, y } = cardCenter(SPELL_IDS.indexOf('ice'));
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

export async function readRun(page: Page): Promise<Read | null> {
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
        ice: run.iceLevelReport,
        levels: run.spellLevels as { id: RosterSpellId; level: number }[],
        telegraphs: strike.live.length,
        areas: run.areaReport.live.length,
        fx: (run as unknown as { fx: { count: number } }).fx.count,
        live: run.iceReport.map(({ id, live }) => ({ id, live })),
        enemies: run.liveEnemyCount,
        fps: game.loop.actualFps,
        elapsedMs: hud.view.elapsedMs,
        offer: levelUp ? levelUp.view.cards.map((card) => card.kind) : null,
        trace: (window as unknown as { iceTrace?: Trace }).iceTrace ?? null,
      };
    },
    [SCENE.game, SCENE.hud, SCENE.levelUp] as const,
  );
}

export type Recorded = 'shards' | 'minis' | 'icicles';

/**
 * Note in the page, every frame, what a sample every 100 ms would miss: the
 * most of a short-lived thing alive in one frame, and how each was drawn.
 */
export async function record(page: Page, what: readonly Recorded[]): Promise<void> {
  await page.evaluate(
    async ([gameKey, wanted]) => {
      const { game } = await import('/src/main.ts');
      const run = game.scene.getScene(gameKey) as unknown as GameScene;
      const trace: Trace = {
        maxShards: 0,
        shardViews: [],
        maxMinis: 0,
        miniViews: [],
        maxShieldIcicles: 0,
      };
      (window as unknown as { iceTrace: Trace }).iceTrace = trace;
      const note = (list: string[], key: string): void => {
        if (list.length < 200 && !list.includes(key)) list.push(key);
      };
      run.events.on('postupdate', () => {
        for (const { id, report } of run.iceLevelReport) {
          if (id === 'ice' && wanted.includes('shards')) {
            const arrow = report as unknown as IceArrowLevelReport;
            trace.maxShards = Math.max(trace.maxShards, arrow.liveShards);
            for (const { clip, scale } of arrow.shardViews)
              note(trace.shardViews, `${clip}@${scale}`);
          }
          if (id === 'ice_nova_bomb' && wanted.includes('minis')) {
            const nova = report as unknown as NovaLevelReport;
            trace.maxMinis = Math.max(trace.maxMinis, nova.liveMinis);
            for (const { clip, scale } of nova.miniViews) note(trace.miniViews, `${clip}@${scale}`);
          }
          if (id === 'ice_shield' && wanted.includes('icicles')) {
            const shield = report as unknown as IceShieldLevelReport;
            trace.maxShieldIcicles = Math.max(trace.maxShieldIcicles, shield.liveIcicles);
          }
        }
      });
    },
    [SCENE.game, what] as const,
  );
}

/**
 * Sample the run until `done(read)` holds, answering level-ups (never with an
 * upgrade card) and running `each` on every reading: the rules that must hold at
 * every moment (a cap, a cadence). Fails with the last reading when the run
 * clock or the wall clock runs out first.
 */
export async function until(
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

/** The level report of the Ice spell `id`, typed by the caller; throws when it is not casting. */
export function reportOf<T>(read: Read, id: RosterSpellId): T {
  const entry = read.ice.find((f) => f.id === id);
  if (!entry) throw new Error(`${id} is not casting`);
  return entry.report as unknown as T;
}

test('Ice Arrow level 2 fires two arrows in a 12 degree fan', async ({ page }) => {
  const errors = collectErrors(page);
  await startIceRun(page, 'ice:2');
  const seen = await until(page, 'a level 2 volley of 2 arrows fanned 12 degrees', (read) =>
    reportOf<IceArrowLevelReport>(read, 'ice').volleys.some(
      (v) => v.level === 2 && v.shots === 2 && Math.abs(v.fanDeg - 12) < 0.11,
    ),
  );
  const arrow = reportOf<IceArrowLevelReport>(seen, 'ice');
  console.log(
    `arrow lv2: volleys ${arrow.volleys.length}, fans ${arrow.volleys.map((v) => v.fanDeg).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('Ice Arrow level 3 shatters only on an enemy already slowed: three shards, small arrows, inside the pool cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=120: a crowd thick enough that a shard has something to hit.
  await startIceRun(page, 'ice:3', 'startAt=120');
  await record(page, ['shards']);
  // The cause: a level 3 arrow that found its enemy already slowed. The effect,
  // in the same entry: three shards thrown. An arrow that found it unslowed threw none.
  const seen = await until(
    page,
    'a shatter of 3 shards on a slowed enemy, a shard hit and shards drawn in flight',
    (read) => {
      const arrow = reportOf<IceArrowLevelReport>(read, 'ice');
      return (
        arrow.shatters.some((h) => h.level === 3 && h.shards === 3) &&
        arrow.shardHits > 0 &&
        (read.trace?.shardViews.length ?? 0) > 0
      );
    },
    (read) => {
      const arrow = reportOf<IceArrowLevelReport>(read, 'ice');
      for (const hit of arrow.hits) {
        if (!hit.wasSlowed) expect(hit.shards, 'an arrow on an unslowed enemy shatters').toBe(0);
        expect(hit.shards, 'shards from one hit').toBeLessThanOrEqual(3);
      }
      expect(arrow.liveShards, 'shards alive').toBeLessThanOrEqual(MAX_LIVE_SHARDS);
      expect(read.trace?.maxShards ?? 0, 'most shards alive in a frame').toBeLessThanOrEqual(
        MAX_LIVE_SHARDS,
      );
    },
  );
  const arrow = reportOf<IceArrowLevelReport>(seen, 'ice');
  console.log(
    `arrow lv3 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: hits ${arrow.hits.length} (slowed ${arrow.hits.filter((h) => h.wasSlowed).length}, shatters logged ${arrow.shatters.length}), shard hits ${arrow.shardHits}, dropped ${arrow.shardsDropped}, peak shards ${seen.trace?.maxShards}`,
  );
  expect(seen.trace?.shardViews).toEqual(['ice.arrow@0.55']);
  expect(errors).toEqual([]);
});

test('Frost Nova Bomb level 2 sprays four icicles a throw', async ({ page }) => {
  const errors = collectErrors(page);
  await startIceRun(page, 'ice_nova_bomb:2');
  const seen = await until(page, 'a level 2 throw of 4 icicles', (read) =>
    reportOf<NovaLevelReport>(read, 'ice_nova_bomb').throws.some(
      (t) => t.level === 2 && t.icicles === 4,
    ),
  );
  const nova = reportOf<NovaLevelReport>(seen, 'ice_nova_bomb');
  console.log(
    `nova lv2: throws ${nova.throws.length}, icicles ${nova.throws.map((t) => t.icicles).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('Frost Nova Bomb level 3 rolls out three small urchins that burst at half the radius, inside the pool cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=300: a crowd thick enough that the urchins' small bursts catch something (at 120 the first
  // catch came 23 s into the run, a quarter of the cap; at 300 it comes at 11 s).
  await startIceRun(page, 'ice_nova_bomb:3', 'startAt=300');
  await record(page, ['minis']);
  // The cause: a level 3 burst that rolled out three. The effect: small bursts
  // at half the bomb's radius, each set off where its urchin had rolled to
  // (geometry, so it does not wait on a crowd), the urchins drawn at half size,
  // and one real behavioural check: a small burst that caught an enemy.
  const seen = await until(
    page,
    'a cluster of 3 urchins, half-radius urchin bursts out past the bomb, one that caught enemies, urchins drawn in flight',
    (read) => {
      const nova = reportOf<NovaLevelReport>(read, 'ice_nova_bomb');
      // "Has happened" facts are the report's running counts; a 16-entry log window can lose them.
      return (
        nova.fullClusters > 0 &&
        nova.minisAtRange > 0 &&
        nova.minisCaught > 0 &&
        (read.trace?.miniViews.length ?? 0) > 0
      );
    },
    (read) => {
      const nova = reportOf<NovaLevelReport>(read, 'ice_nova_bomb');
      for (const c of nova.clusters)
        expect(c.urchins, 'urchins from one burst').toBeLessThanOrEqual(3);
      // Shape, per entry: every level 3 urchin burst is at half the bomb's radius.
      for (const b of nova.miniBursts.filter((burst) => burst.level === 3))
        expect(b.radius, 'urchin burst radius').toBe(b.bombRadius * 0.5);
      expect(nova.liveMinis, 'urchins alive').toBeLessThanOrEqual(MAX_LIVE_MINI_URCHINS);
      expect(read.trace?.maxMinis ?? 0, 'most urchins alive in a frame').toBeLessThanOrEqual(
        MAX_LIVE_MINI_URCHINS,
      );
    },
  );
  const nova = reportOf<NovaLevelReport>(seen, 'ice_nova_bomb');
  console.log(
    `nova lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: clusters ${nova.clusters.length}, mini bursts ${nova.miniBursts.length} (caught>0: ${nova.miniBursts.filter((b) => b.caught > 0).length}, distances ${nova.miniBursts.map((b) => b.distance.toFixed(0)).join(',')}, radii ${[...new Set(nova.miniBursts.map((b) => b.radius))].join('/')}), dropped ${nova.minisDropped}, peak minis ${seen.trace?.maxMinis}`,
  );
  expect(seen.trace?.miniViews).toEqual(['ice.urchin@0.5']);
  expect(errors).toEqual([]);
});

test('Ice Shield level 2 slows every enemy touching it, only while it is up', async ({ page }) => {
  const errors = collectErrors(page);
  // Invulnerable, so the shield stands for the whole run and the pulses have a
  // crowd to chill; startAt=120 fills the arena round the player.
  await startIceRun(page, 'ice_shield:2', 'startAt=120');
  // The cause: a pulse that caught enemies. The effect, in the same entry: every
  // one of them slowed after it.
  const seen = await until(
    page,
    'an aura pulse that caught enemies and left them all slowed',
    (read) =>
      reportOf<IceShieldLevelReport>(read, 'ice_shield').auraPulses.some(
        (p) => p.level === 2 && p.caught > 0 && p.slowedAfter === p.caught,
      ),
    (read) => {
      for (const p of reportOf<IceShieldLevelReport>(read, 'ice_shield').auraPulses) {
        expect(p.slowedAfter, 'enemies slowed by one pulse').toBe(p.caught);
      }
    },
  );
  const shield = reportOf<IceShieldLevelReport>(seen, 'ice_shield');
  console.log(
    `shield lv2 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: pulses ${shield.pulseCount}, with catches ${shield.auraPulses.length}, caught ${shield.auraPulses.map((p) => p.caught).join(',')}`,
  );
  expect(errors).toEqual([]);
});

test('Ice Shield level 3 freezes what its break catches and fires eight icicles, inside the pool cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Real contact (no invulnerable) so the shield really breaks; startAt=120 for a
  // crowd that presses the standing player within seconds.
  await startIceRun(page, 'ice_shield:3', 'startAt=120', false);
  await record(page, ['icicles']);
  // The cause: a level 3 break that caught enemies. The effect, in the same
  // entry: every one of them frozen after it, and eight icicles out.
  const seen = await until(
    page,
    'a level 3 break that caught enemies, froze them all and fired 8 icicles',
    (read) =>
      reportOf<IceShieldLevelReport>(read, 'ice_shield').breaks.some(
        (b) =>
          b.level === 3 &&
          b.caught > 0 &&
          b.frozenAfter === b.caught &&
          b.icicles === SHATTER_RING.icicles,
      ),
    (read) => {
      const shield = reportOf<IceShieldLevelReport>(read, 'ice_shield');
      for (const b of shield.breaks) {
        expect(b.frozenAfter, 'enemies frozen by one break').toBe(b.caught);
        expect(b.icicles, 'icicles from one break').toBeLessThanOrEqual(SHATTER_RING.icicles);
      }
      expect(shield.liveIcicles, 'shield icicles alive').toBeLessThanOrEqual(
        MAX_LIVE_SHIELD_ICICLES,
      );
      expect(
        read.trace?.maxShieldIcicles ?? 0,
        'most shield icicles alive in a frame',
      ).toBeLessThanOrEqual(MAX_LIVE_SHIELD_ICICLES);
    },
  );
  const shield = reportOf<IceShieldLevelReport>(seen, 'ice_shield');
  console.log(
    `shield lv3 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: breaks ${shield.breaks.length} (caught ${shield.breaks.map((b) => b.caught).join(',')}), icicle hits ${shield.icicleHits}, dropped ${shield.iciclesDropped}, peak icicles ${seen.trace?.maxShieldIcicles}`,
  );
  expect(errors).toEqual([]);
});

test('Ice Shield level 3 icicles hit what the break leaves standing', async ({ page }) => {
  const errors = collectErrors(page);
  // Tanks (60 HP, from 5:00 on) outlast the break's 40 damage, so the ring has something to
  // hit; against a swarm the break itself clears the crowd and the icicles fly
  // through the space it emptied.
  await startIceRun(page, 'ice_shield:3', 'startAt=300&enemies=tank', false);
  // The cause: a level 3 break that caught tanks. The effect: an icicle broke on one.
  const seen = await until(
    page,
    'a level 3 break that caught tanks and an icicle that broke on a survivor',
    (read) => {
      const shield = reportOf<IceShieldLevelReport>(read, 'ice_shield');
      return (
        shield.breaks.some((b) => b.level === 3 && b.caught > 0 && b.icicles === 8) &&
        shield.icicleHits > 0
      );
    },
  );
  const shield = reportOf<IceShieldLevelReport>(seen, 'ice_shield');
  console.log(
    `shield lv3 tanks at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: breaks ${shield.breaks.length} (caught ${shield.breaks.map((b) => b.caught).join(',')}), icicle hits ${shield.icicleHits}`,
  );
  expect(errors).toEqual([]);
});

test('Ice Companion level 2 fires two projectiles per attack', async ({ page }) => {
  const errors = collectErrors(page);
  await startIceRun(page, 'ice_companion:2');
  const seen = await until(page, 'a level 2 volley of 2 shots', (read) =>
    reportOf<CompanionLevelReport>(read, 'ice_companion').volleys.some(
      (v) => v.level === 2 && v.shots === 2 && !v.frostOrb,
    ),
  );
  const companion = reportOf<CompanionLevelReport>(seen, 'ice_companion');
  console.log(`companion lv2: volleys ${companion.volleys.length}`);
  expect(errors).toEqual([]);
});

test('Ice Companion level 3 throws a frost orb on every 4th attack that freezes its target and slows its neighbours', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=120: a crowd thick enough that an orb has neighbours to slow.
  await startIceRun(page, 'ice_companion:3', 'startAt=120');
  // The cause: an orb that landed. The effect, in the same entry: its target was
  // frozen, and the neighbours it reached were slowed.
  const seen = await until(
    page,
    'a frost orb on an attack divisible by 4 that froze its target and slowed neighbours',
    (read) => {
      const report = reportOf<CompanionLevelReport>(read, 'ice_companion');
      return (
        report.volleys.some((v) => v.level === 3 && v.frostOrb && v.attackNumber % 4 === 0) &&
        report.frostOrbs.some(
          (o) =>
            o.level === 3 && o.targetFrozenS > 0 && o.around > 0 && o.slowedAround === o.around,
        )
      );
    },
    (read) => {
      const report = reportOf<CompanionLevelReport>(read, 'ice_companion');
      // On every reading: only every 4th attack carries the orb, and it is never a fireball.
      for (const v of report.volleys) {
        expect(v.fireball, `attack ${v.attackNumber} fireball`).toBe(false);
        if (v.level === 3) {
          expect(v.frostOrb, `attack ${v.attackNumber} frost orb`).toBe(v.attackNumber % 4 === 0);
        }
      }
      for (const o of report.frostOrbs) {
        expect(o.slowedAround, 'neighbours slowed by one orb').toBe(o.around);
        // A boss's freeze goes through its diminishing returns and is never longer than the orb's own.
        if (o.boss) expect(o.targetFrozenS).toBeLessThanOrEqual(FROST_ORB.freezeS + 1e-6);
      }
    },
  );
  const companion = reportOf<CompanionLevelReport>(seen, 'ice_companion');
  console.log(
    `companion lv3 at run ${((seen.elapsedMs - 120_000) / 1000).toFixed(1)} s: volleys ${companion.volleys.length} (orbs ${companion.volleys.filter((v) => v.frostOrb).length}), orbs landed ${companion.frostOrbs.length} (frozen>0 ${companion.frostOrbs.filter((o) => o.targetFrozenS > 0).length}, neighbours ${companion.frostOrbs.map((o) => o.around).join(',')}, boss ${companion.frostOrbs.filter((o) => o.boss).length})`,
  );
  expect(errors).toEqual([]);
});

test('Ice Storm level 2 drops a hailstone on one enemy inside every second of a patch', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Tanks (60 HP, from 5:00 on): a swarm dies to the patch's own ticks, leaving the hail nothing to pick.
  await startIceRun(page, 'ice_blizzard:2', 'startAt=300&enemies=tank');
  // The cause: a patch's tick. The effect, in the same entry: a hailstone that
  // hit one of the enemies inside it, on the even ticks only (a stone a second
  // on a tick every half second), and a whole patch that fell exactly four.
  const seen = await until(
    page,
    'a hailstone on an enemy inside and a patch that hailed on exactly its even ticks',
    (read) => {
      const storm = reportOf<IceStormLevelReport>(read, 'ice_blizzard');
      // Running counts, not the capped log: a stone that hit, and a patch that dropped exactly four.
      return storm.hailHits > 0 && storm.hailPerPatch.some((stones) => stones === 4);
    },
    (read) => {
      const { hail } = reportOf<IceStormLevelReport>(read, 'ice_blizzard');
      const seenTicks = new Set<string>();
      for (const h of hail) {
        expect(h.level, 'the run is at storm level 2').toBe(2);
        expect(h.tickNumber % 2, 'hail falls on even ticks').toBe(0);
        expect(h.hit, 'a stone hits exactly when something is inside').toBe(h.inside > 0);
        const key = `${h.patch}:${h.tickNumber}`;
        expect(seenTicks.has(key), `one stone per tick (${key})`).toBe(false);
        seenTicks.add(key);
      }
    },
  );
  const storm = reportOf<IceStormLevelReport>(seen, 'ice_blizzard');
  console.log(
    `storm lv2 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: patches ${storm.patches}, hail ${storm.hail.length} (hit ${storm.hail.filter((h) => h.hit).length}, inside ${storm.hail.map((h) => h.inside).join(',')})`,
  );
  expect(errors).toEqual([]);
});

test('Ice Storm level 3 freezes everything inside on the last tick a patch pays', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Tanks (60 HP, from 5:00 on): a swarm dies to the patch's own ticks before the last one.
  await startIceRun(page, 'ice_blizzard:3', 'startAt=300&enemies=tank');
  // The cause: a patch's last paid tick (the 8th of a 4 s patch ticking every
  // 0.5 s). The effect, in the same entry: every enemy inside frozen after it.
  const seen = await until(
    page,
    'a deep freeze on the last tick that froze everything inside',
    (read) =>
      reportOf<IceStormLevelReport>(read, 'ice_blizzard').deepFreezes.some(
        (d) =>
          d.level === 3 &&
          d.tickNumber === d.count &&
          d.count === 8 &&
          d.inside > 0 &&
          d.frozenAfter === d.inside,
      ),
    (read) => {
      const storm = reportOf<IceStormLevelReport>(read, 'ice_blizzard');
      for (const d of storm.deepFreezes) {
        expect(d.tickNumber, 'a deep freeze is on the last tick').toBe(d.count);
        expect(d.frozenAfter, 'enemies frozen by one deep freeze').toBe(d.inside);
        // CO-221: the boss is never frozen; a deep freeze is a short slow on it.
        if (d.bossFrozenS !== null) expect(d.bossFrozenS, 'the boss is not frozen').toBe(0);
      }
      // Level 3 keeps level 2's hail.
      expect(storm.hail.every((h) => h.tickNumber % 2 === 0)).toBe(true);
    },
  );
  const storm = reportOf<IceStormLevelReport>(seen, 'ice_blizzard');
  console.log(
    `storm lv3 at run ${((seen.elapsedMs - 300_000) / 1000).toFixed(1)} s: patches ${storm.patches}, deep freezes ${storm.deepFreezes.length} (inside ${storm.deepFreezes.map((d) => d.inside).join(',')}, boss ${storm.deepFreezes.filter((d) => d.bossFrozenS !== null).length})`,
  );
  expect(errors).toEqual([]);
});

test('the whole Ice roster at level 3 holds every pool cap and the frame rate over 100 s', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // startAt=600: the crowd of ten minutes in, the densest the pools will meet.
  await startIceRun(
    page,
    'ice:3,ice_nova_bomb:3,ice_shield:3,ice_companion:3,ice_blizzard:3',
    'startAt=600',
  );
  // Sampled through the run, not only at the end: a pool that briefly exceeded
  // its cap in between would leave no trace in a final reading. No `record`: it
  // would put a per-frame hook on the run whose frame rate is under test.
  let samples = 0;
  let peakEnemies = 0;
  // The run clock starts at `startAt`, so the 100 s is counted from the first reading.
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
      expect(
        reportOf<IceArrowLevelReport>(read, 'ice').liveShards,
        'shards alive',
      ).toBeLessThanOrEqual(MAX_LIVE_SHARDS);
      expect(
        reportOf<NovaLevelReport>(read, 'ice_nova_bomb').liveMinis,
        'small urchins alive',
      ).toBeLessThanOrEqual(MAX_LIVE_MINI_URCHINS);
      expect(
        reportOf<IceShieldLevelReport>(read, 'ice_shield').liveIcicles,
        'shield icicles alive',
      ).toBeLessThanOrEqual(MAX_LIVE_SHIELD_ICICLES);
      expect(
        reportOf<CompanionLevelReport>(read, 'ice_companion').liveShots,
        'companion shots alive',
      ).toBeLessThanOrEqual(MAX_COMPANION_SHOTS);
      const arrows = read.live.find((l) => l.id === 'ice')?.live ?? 0;
      expect(arrows, 'arrows alive').toBeLessThanOrEqual(MAX_LIVE_ARROWS);
      const nova = read.live.find((l) => l.id === 'ice_nova_bomb')?.live ?? 0;
      expect(nova, 'bombs and nova icicles alive').toBeLessThanOrEqual(
        MAX_LIVE_BOMBS + MAX_LIVE_ICICLES,
      );
      expect(read.areas, 'ground areas alive').toBeLessThanOrEqual(MAX_LIVE_AREAS);
      expect(read.fx, 'effect bursts alive').toBeLessThanOrEqual(MAX_LIVE_FX);
    },
  );
  console.log(
    `ice roster lv3: ${samples} samples, peak enemies ${peakEnemies}, enemies ${last.enemies}, fps ${last.fps.toFixed(1)}`,
  );
  expect(last.levels.map((l) => l.level)).toEqual([3, 3, 3, 3, 3]);
  expect(last.enemies, 'enemies alive at the reading').toBeGreaterThan(0);
  expect(last.fps, `fps over ${last.enemies} enemies`).toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
