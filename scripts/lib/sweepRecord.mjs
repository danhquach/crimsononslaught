// Result records for the balance sweep (#407): one JSON line per run.
import { jobKey, TIME_SCALE } from './sweepOptions.mjs';

/** The boss spawns here (BOSS_START_TIME in src/config/waves.ts, seconds); a unit test keeps them equal. */
export const BOSS_START_MS = 1_200_000;
/** The bot stops a run still alive here, game time: it is a stall, not a result. */
export const HARD_STOP_MS = 40 * 60 * 1000;

/** A sample is `[min, alive, level, fps, bossHp]`; older files may hold the object form. */
export function normaliseSample(s) {
  if (Array.isArray(s)) {
    const [min, alive, level, fps, bossHp] = s;
    return { min, alive, level, fps, bossHp };
  }
  const { min, alive, level, fps, bossHp } = s;
  return { min, alive, level, fps, bossHp };
}

/** Minutes spent at the enemy cap (295+ alive) with no level gained across the minute. */
export function capMinutes(samples) {
  const s = samples.map(normaliseSample);
  let cap = 0;
  for (let k = 1; k < s.length; k++) {
    if (s[k].alive >= 295 && s[k].level === s[k - 1].level) cap++;
  }
  return cap;
}

/** A bot that is level 5 or less at 10:00 is probably not playing (a warning, not an outcome). */
export function isSuspect(samples) {
  const at10 = samples.map(normaliseSample).find((s) => s.min === 10);
  return at10 !== undefined && at10.level <= 5;
}

/** The result screen's outcome to the record's: win, death, or error for anything else. */
export function mapOutcome(outcome) {
  if (outcome === 'win') return 'win';
  if (outcome === 'lose') return 'death';
  return 'error';
}

/** Options of a record; files from before the options block are default runs. */
export function recordOptionsKey(r) {
  const o = r.options ?? {};
  return JSON.stringify({
    loadout: o.loadout ?? [],
    invulnerable: o.invulnerable ?? false,
    dash: o.dash ?? false,
    timeScale: o.timeScale ?? TIME_SCALE,
  });
}

/**
 * Job keys already finished under `optKey` on `commit`. Errors, runs from another
 * commit and runs from a dirty tree do not count, so they rerun.
 */
export function doneKeys(lines, optKey, commit) {
  const done = new Set();
  for (const line of lines) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      r &&
      r.outcome !== 'error' &&
      r.commit === commit &&
      r.dirty !== true &&
      recordOptionsKey(r) === optKey
    ) {
      done.add(jobKey(r));
    }
  }
  return done;
}
