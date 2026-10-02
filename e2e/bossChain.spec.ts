import { expect, test, type Page } from '@playwright/test';
import { BOSS, BOSS_CHAIN } from '../src/config/boss';
import { BOSS_CHAIN_FX } from '../src/config/fx';
import { SPELL_IDS } from '../src/config/spells';
import { enrageThresholdHp } from '../src/core/boss';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import {
  cardCenter,
  collectErrors,
  readSounds,
  recordSounds,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * CO-225 in the browser: an enraged boss's charge leg is a chain of `BOSS_CHAIN`
 * charges. The first telegraph is the usual 0.8 s, each chained one 0.4 s and
 * aimed at where the hero stands as it ends; a red trail shows behind every
 * enraged charge and a glint plays on each chained telegraph. A calm boss never
 * chains. The run starts a second short of the boss (`?startAt=`) at
 * `?timeScale=4`. Every sample reads all it needs in one `evaluate`; the lock
 * log carries `link` and `chainLength`, so no chain is rebuilt by matching
 * samples. The cue is checked on logged requests: at this clock chained
 * telegraphs are about 250 ms apart in real time, inside the cue's 300 ms
 * throttle, so `started` would drop some.
 */

const START_AT_S = 1199;
const SCALE = '&timeScale=4&invulnerable=1';
const EPS = 1e-6;

type Report = NonNullable<GameScene['bossReport']>;
type LogEntry = Report['chain']['log'][number];

async function startRun(page: Page): Promise<void> {
  await page.goto(`/?seed=1&startAt=${START_AT_S}${SCALE}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await recordSounds(page);
  await expect
    .poll(async () => (await sample(page, 400, 0)) !== null, { timeout: 20_000 })
    .toBe(true);
}

/**
 * One sample: the hero is put `distance` px from the boss (toward the middle of
 * the arena, so the world edge never clamps it), along x on even `spot`s and
 * along y on odd ones, then the report is read, all in the same evaluate.
 */
function sample(page: Page, distance: number, spot: number): Promise<Report | null> {
  return page.evaluate(
    async ({ scene, distance, spot }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const boss = g.bossReport;
      if (boss) {
        const dx = spot % 2 === 0 ? (boss.x < 1500 ? distance : -distance) : 0;
        const dy = spot % 2 === 1 ? (boss.y < 1500 ? distance : -distance) : 0;
        g.placeHeroForTest(boss.x + dx, boss.y + dy);
      }
      return g.bossReport;
    },
    { scene: SCENE, distance, spot },
  );
}

async function enrage(page: Page): Promise<number> {
  // Wait for a chase, so no calm telegraph or charge is under way when the boss turns.
  await expect
    .poll(async () => (await sample(page, 400, 0))?.phase, { timeout: 20_000 })
    .toBe('chase');
  const ok = await page.evaluate(
    async ({ scene, bar, threshold }) => {
      const { game } = await import('/src/main.ts');
      const g = game.scene.getScene(scene.game) as GameScene;
      const first = g.damageBossForTest(bar);
      if (!first) return false;
      g.damageBossForTest(Math.max(0, first.hp - threshold));
      return !first.dying;
    },
    { scene: SCENE, bar: BOSS.hp / BOSS.bars, threshold: enrageThresholdHp() },
  );
  expect(ok).toBe(true);
  const after = await sample(page, 400, 0);
  expect(after?.enraged).toBe(true);
  return after?.volley.clockS ?? 0;
}

/** The log split into legs: each starts at link 0 and runs on while the links count up. */
function legs(log: readonly LogEntry[]): LogEntry[][] {
  const out: LogEntry[][] = [];
  for (const entry of log) {
    const leg = out[out.length - 1];
    if (entry.link === 0 || !leg || leg.length !== entry.link) out.push([entry]);
    else leg.push(entry);
  }
  return out;
}

test('a calm boss never chains: single charges, a 0.8 s warning, no trail or glint', async ({
  page,
}) => {
  test.setTimeout(55_000);
  const errors = collectErrors(page);
  await startRun(page);
  let last: Report | null = null;
  let trailSeen = false;
  let spot = 0;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    last = await sample(page, 400, spot++);
    if (!last) break;
    trailSeen = trailSeen || last.chain.trailVisible;
    if (last.volley.clockS >= 30) break;
    await page.waitForTimeout(100);
  }
  const log = last?.chain.log ?? [];
  console.log(
    'calm: boss clock',
    last?.volley.clockS.toFixed(1),
    'locks',
    log.length,
    'trailSeen',
    trailSeen,
    'flashPlays',
    last?.chain.flashPlays,
  );
  expect(log.length).toBeGreaterThanOrEqual(2);
  for (const entry of log) {
    expect(entry).toMatchObject({ chained: false, link: 0, chainLength: 1, enraged: false });
    expect(Math.abs(entry.atS - entry.telegraphAtS - BOSS.telegraphS)).toBeLessThan(EPS);
  }
  expect(trailSeen).toBe(false);
  expect(last?.chain.flashPlays).toBe(0);
  expect(errors).toEqual([]);
});

test('an enraged boss chains its charges, re-aiming each, with a trail and a glint', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await startRun(page);
  const enragedAtS = await enrage(page);
  let last: Report | null = null;
  let spot = 0;
  let chargeSamples = 0;
  let trailSamples = 0;
  const trailBad: string[] = [];
  const deadline = Date.now() + 45_000;
  const complete = (log: readonly LogEntry[]) =>
    legs(log.filter((e) => e.telegraphAtS >= enragedAtS)).filter(
      (leg) => leg.length === leg[0]?.chainLength,
    ).length;
  while (Date.now() < deadline) {
    last = await sample(page, 400, spot++);
    if (!last) break;
    const { chain } = last;
    const charging = last.phase === 'charge';
    if (charging) chargeSamples += 1;
    if (charging && chain.trailVisible) trailSamples += 1;
    if (chain.trailVisible !== charging) trailBad.push(`${last.phase}:${chain.trailVisible}`);
    if (chain.trailVisible) {
      if (chain.trailClip !== BOSS_CHAIN_FX.trail) trailBad.push(`clip ${chain.trailClip}`);
      // Compared as a direction: atan2 gives -pi or pi for the same line.
      const { x, y } = chain.chargeDir;
      const off = Math.hypot(Math.cos(chain.trailRotation) - x, Math.sin(chain.trailRotation) - y);
      if (off > EPS) trailBad.push(`rot ${chain.trailRotation}`);
    }
    // Keep sampling past three chains until a glint and a trail were both seen too.
    if (complete(chain.log) >= 3 && trailSamples > 0 && chain.flashPlays > 0) break;
    await page.waitForTimeout(100);
  }
  const chain = last?.chain;
  const log = (chain?.log ?? []).filter((e) => e.telegraphAtS >= enragedAtS);
  const all = legs(log);
  const done = all.filter((leg) => leg.length === leg[0]?.chainLength);
  const chainedLocks = log.filter((e) => e.chained).length;
  const sounds = (await readSounds(page)).filter((r) => r.key === 'boss.telegraph');
  console.log(
    'enraged: locks',
    log.length,
    'legs',
    all.length,
    'complete chains',
    done.length,
    'lengths',
    done.map((leg) => leg.length).join(','),
    'chained locks',
    chainedLocks,
    'flashPlays',
    chain?.flashPlays,
    'charge samples',
    chargeSamples,
    'with trail',
    trailSamples,
    'trail bad',
    trailBad.length,
    'telegraph cue requests',
    sounds.length,
  );
  expect(last).not.toBeNull();
  expect(done.length).toBeGreaterThanOrEqual(3);
  for (const leg of done) {
    const n = leg[0]?.chainLength ?? 0;
    expect(n).toBeGreaterThanOrEqual(BOSS_CHAIN.minCharges);
    expect(n).toBeLessThanOrEqual(BOSS_CHAIN.maxCharges);
    expect(leg.map((e) => e.link)).toEqual(leg.map((_, i) => i));
    expect(leg.every((e) => e.enraged && e.chainLength === n)).toBe(true);
  }
  for (const entry of log) {
    const warn = entry.link === 0 ? BOSS.telegraphS : BOSS_CHAIN.telegraphS;
    expect(Math.abs(entry.atS - entry.telegraphAtS - warn)).toBeLessThan(EPS);
    expect(entry.chained).toBe(entry.link > 0);
    // The direction is the unit vector from the boss to the hero, both as the lock saw them.
    const dx = entry.target.x - entry.from.x;
    const dy = entry.target.y - entry.from.y;
    const d = Math.hypot(dx, dy);
    expect(Math.abs(entry.dir.x - dx / d)).toBeLessThan(EPS);
    expect(Math.abs(entry.dir.y - dy / d)).toBeLessThan(EPS);
  }
  expect(trailBad).toEqual([]);
  expect(chargeSamples).toBeGreaterThan(0);
  expect(trailSamples).toBeGreaterThan(0);
  // One glint per chained telegraph begun: those that ended, and one in flight at most.
  expect(chain?.flashPlays).toBeGreaterThanOrEqual(chainedLocks);
  expect(chain?.flashPlays).toBeLessThanOrEqual(chainedLocks + 1);
  // The warning cue is logged for every telegraph, chained or not (it may be throttled when played).
  expect(sounds.length).toBeGreaterThanOrEqual(log.length);
  expect(errors).toEqual([]);
});
