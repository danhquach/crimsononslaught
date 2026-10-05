// Balance sweep (#407): node scripts/sweep/run.mjs [options]  (npm run sweep -- [options]).
//   --elements fire,ice,lightning,earth   default: all four
//   --seeds 1-5 | 1,3,7                   default: 1-5
//   --sweeps N                            repeat the whole set N times (default 1)
//   --port N                              dev server port (default 5190)
//   --loadout fire,fire_dragon:3          extra spells, the game's ?loadout= switch
//   --invulnerable                        the game's ?invulnerable=1 switch
//   --dash                                let the bot dash (default: no dash)
//   --out file.jsonl                      results, appended (default sweep-results/runs.jsonl)
// Starts its own dev server from this checkout, plays one run per element|seed|sweep at
// timeScale 8, and appends one JSON line per run. Finished runs are skipped on a rerun
// with the same options; runs that errored are repeated.
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { get } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSteer, pollState } from './bot.mjs';
import {
  ELEMENTS,
  TIME_SCALE,
  buildUrl,
  jobKey,
  optionsKey,
  parseArgs,
  recordOptions,
} from '../lib/sweepOptions.mjs';
import { chooseCard } from '../lib/sweepPick.mjs';
import {
  BOSS_START_MS,
  HARD_STOP_MS,
  capMinutes,
  doneKeys,
  isSuspect,
  mapOutcome,
  normaliseSample,
} from '../lib/sweepRecord.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EVAL_TIMEOUT_MS = 15_000;
const WALL_LIMIT_MS = 30 * 60 * 1000;

class SweepAbort extends Error {}

const withTimeout = (p, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`evaluate timeout: ${label}`)), EVAL_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
};

async function runJob({ element, seed, sweepIndex, opts, commit, dirty, log }) {
  const t0 = Date.now();
  const rec = {
    element,
    seed,
    sweepIndex,
    commit,
    outcome: null,
    timeSurvivedMs: null,
    bossTtkS: null,
    levelAt20: null,
    levelEnd: null,
    loadout: null,
    hpLost: null,
    capMinutes: null,
    samples: [],
    wallS: 0,
    options: recordOptions(opts),
    dirty,
    suspectBot: false,
  };
  const pageErrors = [];
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const ev = (fn, label, arg) => withTimeout(page.evaluate(fn, arg), label);
    const waitScene = async (key) => {
      // not page.waitForFunction: an async predicate's pending promise is truthy (e2e/game.ts waitForScene)
      const until = Date.now() + 20_000;
      for (;;) {
        const on = await ev(
          async (k) => (await import('/src/main.ts')).game.scene.isActive(k),
          `scene ${key}`,
          key,
        );
        if (on) return;
        if (Date.now() > until) throw new Error(`scene never active: ${key}`);
        await page.waitForTimeout(100);
      }
    };

    await page.goto(buildUrl(opts.port, seed, opts));
    await waitScene('Intro');
    await page.keyboard.press('Enter');
    await waitScene('SpellSelect');
    await page.keyboard.press(String(ELEMENTS.indexOf(element) + 1));
    await waitScene('Game');
    await ev(installSteer, 'installSteer', { dash: opts.dash });

    let nextMin = 1;
    let missingPolls = 0;
    let last = null;
    let maxShot = 0;
    let maxSlam = 0;
    let maxVolley = 0;
    for (;;) {
      if (Date.now() - t0 > WALL_LIMIT_MS) throw new Error('run took over 30 minutes of wall time');
      const s = await ev(pollState, 'poll');
      if (s.missing) {
        // One more poll: a scene being torn down at the end of a run can read as missing.
        if (++missingPolls >= 2) throw new SweepAbort(s.missing);
        await page.waitForTimeout(200);
        continue;
      }
      missingPolls = 0;
      last = s;
      if (s.shotHpLost != null) maxShot = Math.max(maxShot, s.shotHpLost);
      if (s.boss) {
        maxSlam = Math.max(maxSlam, s.boss.slam);
        maxVolley = Math.max(maxVolley, s.boss.volley);
      }
      const el = s.elapsedMs ?? 0;
      while (el >= nextMin * 60_000) {
        rec.samples.push([
          nextMin,
          s.alive,
          s.level,
          Math.round((s.fps ?? 0) * 10) / 10,
          Math.round(s.bossHp ?? 0),
        ]);
        if (nextMin === 20) rec.levelAt20 = s.level;
        nextMin++;
      }
      if (s.result && s.summary) {
        const r = s.summary;
        rec.outcome = mapOutcome(r.outcome);
        rec.timeSurvivedMs = r.stats.timeSurvivedMs;
        rec.levelEnd = r.stats.level;
        rec.loadout = {
          spells: r.build.spells.map((b) => [b.id, b.level]),
          passives: r.build.passives,
          relics: r.build.relics,
        };
        if (rec.outcome === 'win') rec.bossTtkS = (r.stats.timeSurvivedMs - BOSS_START_MS) / 1000;
        if (rec.outcome === 'error') rec.error = `run ended with outcome ${String(r.outcome)}`;
        break;
      }
      if (el >= HARD_STOP_MS) {
        rec.outcome = 'stall-timeout';
        rec.timeSurvivedMs = el;
        rec.levelEnd = s.level;
        break;
      }
      if (s.levelUp) {
        await page.keyboard.press(String(chooseCard(s.cards) + 1));
        await page.waitForTimeout(40);
        continue;
      }
      await page.waitForTimeout(100);
    }
    if (rec.outcome === 'stall-timeout') {
      // loadout from the HUD and scene, since there is no result screen
      rec.loadout = await ev(async () => {
        const { game } = await import('/src/main.ts');
        const g = game.scene.getScene('Game');
        const v = game.scene.getScene('Hud').view;
        return {
          spells: g.spellLevels.map((s) => [s.id, s.level]),
          passives: v.passives.map((p) => [p.id, p.rank ?? p.count ?? null]),
          relics: null,
        };
      }, 'loadout').catch((e) => ({ spells: [], passives: [], relics: null, error: String(e) }));
    }
    rec.dashes = last?.botDashes ?? 0;
    const total = Math.round(last?.botHpLost ?? 0);
    rec.hpLost = {
      total,
      shots: maxShot,
      bossSlam: maxSlam,
      bossVolley: maxVolley,
      otherContactBlast: Math.max(0, total - maxShot - maxSlam - maxVolley),
    };
    rec.capMinutes = capMinutes(rec.samples);
    rec.suspectBot = isSuspect(rec.samples);
    if (rec.suspectBot) {
      const at10 = rec.samples.map(normaliseSample).find((x) => x.min === 10);
      log(`WARNING suspect bot: level ${at10.level} at 10:00`);
    }
  } catch (e) {
    if (e instanceof SweepAbort) throw e;
    rec.outcome = rec.outcome ?? 'error';
    rec.error = String(e && e.message ? e.message : e);
  } finally {
    rec.wallS = Math.round((Date.now() - t0) / 1000);
    if (pageErrors.length) rec.pageErrors = pageErrors.slice(0, 5);
    await browser.close().catch(() => {});
  }
  return rec;
}

function startVite(port) {
  const bin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(bin)) throw new Error('vite is not installed: run npm ci');
  const logDir = join(ROOT, 'sweep-results');
  mkdirSync(logDir, { recursive: true });
  const logFd = openSync(join(logDir, `vite-${port}.log`), 'a');
  // Own process group, so the whole tree can be stopped without matching process names.
  const child = spawn(process.execPath, [bin, '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  closeSync(logFd);
  const server = { child, dead: false };
  child.on('exit', () => {
    server.dead = true;
  });
  server.stop = () => {
    if (server.dead) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  return server;
}

const ready = (port) =>
  new Promise((res) => {
    const req = get(`http://localhost:${port}/`, { timeout: 2000 }, (r) => {
      r.resume();
      res(r.statusCode === 200);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => res(false));
  });

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const commit = git('rev-parse', '--short', 'HEAD');
  const dirty = git('status', '--porcelain', '--', 'src', 'public') !== '';
  if (dirty)
    console.warn('WARNING src/ or public/ has uncommitted changes: results are marked dirty');

  mkdirSync(dirname(opts.out), { recursive: true });
  const done = existsSync(opts.out)
    ? doneKeys(readFileSync(opts.out, 'utf8').split('\n'), optionsKey(opts), dirty ? null : commit)
    : new Set();
  const jobs = [];
  for (let sweepIndex = 1; sweepIndex <= opts.sweeps; sweepIndex++)
    for (const element of opts.elements)
      for (const seed of opts.seeds)
        if (!done.has(jobKey({ element, seed, sweepIndex })))
          jobs.push({ element, seed, sweepIndex });
  console.log(
    `commit ${commit}${dirty ? ' (dirty)' : ''}; ${jobs.length} job(s) to run, port ${opts.port}, timeScale ${TIME_SCALE}`,
  );
  if (!jobs.length) return;

  if (await ready(opts.port)) {
    throw new Error(`port ${opts.port} already in use; the sweep must start its own dev server`);
  }
  const server = startVite(opts.port);
  const stop = (code) => () => {
    server.stop();
    process.exit(code);
  };
  process.on('SIGINT', stop(130));
  process.on('SIGTERM', stop(143));
  try {
    for (let i = 0; i < 60 && !server.dead && !(await ready(opts.port)); i++)
      await new Promise((r) => setTimeout(r, 1000));
    if (server.dead || !(await ready(opts.port)) || server.dead) {
      throw new Error(
        `vite did not come up on port ${opts.port} (see sweep-results/vite-${opts.port}.log)`,
      );
    }
    for (const job of jobs) {
      console.log(`run ${job.element} seed ${job.seed} sweep ${job.sweepIndex}`);
      const rec = await runJob({ ...job, opts, commit, dirty, log: (m) => console.warn(`  ${m}`) });
      appendFileSync(opts.out, JSON.stringify(rec) + '\n');
      console.log(
        `  -> ${rec.outcome} ${rec.timeSurvivedMs} ms, wall ${rec.wallS}s${rec.error ? ` ERR ${rec.error}` : ''}`,
      );
    }
  } finally {
    server.stop();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
