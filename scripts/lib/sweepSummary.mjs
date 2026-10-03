// Markdown tables for a sweep's results file (#407); the same tables the #406 write-up used.
import { jobKey } from './sweepOptions.mjs';
import { normaliseSample } from './sweepRecord.mjs';

/** Display names; a unit test keeps them equal to the game's roster cards. */
export const SPELL_NAMES = {
  fire: 'Fire Bolt',
  ice: 'Ice Arrow',
  lightning: 'Lightning Bolt',
  earth: 'Earth Spike',
  fire_column: 'Fire Wave',
  fire_dragon: 'Fire Dragon',
  fire_meteor: 'Meteor',
  fire_companion: 'Fire Companion',
  ice_nova_bomb: 'Frost Nova Bomb',
  ice_shield: 'Ice Shield',
  ice_blizzard: 'Ice Storm',
  ice_companion: 'Ice Companion',
  lightning_chain: 'Chain Lightning',
  lightning_tornado: 'Tornado',
  lightning_sword: 'Lightning Sword',
  lightning_companion: 'Lightning Companion',
  earth_boulder: 'Boulder',
  earth_shield: 'Earth Shield',
  earth_quake: 'Earthquake',
  earth_companion: 'Earth Companion',
};

/** Spells that reach a crowd the hero is not standing in (marked with a star). */
export const REACH_IDS = ['fire_dragon', 'fire_column', 'earth_boulder', 'lightning_tornado'];

const ELEMENT_ORDER = ['fire', 'ice', 'lightning', 'earth'];

/** A spell's display name; an id outside the roster is a corrupt file, so it throws. */
export function spellName(id) {
  if (typeof id !== 'string' || !Object.hasOwn(SPELL_NAMES, id)) {
    throw new Error(`summary: unknown spell id: ${String(id).slice(0, 40)}`);
  }
  return SPELL_NAMES[id];
}

export function median(values) {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return null;
  return a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

/** Milliseconds as m:ss (minutes are not wrapped at the hour). */
export function mmss(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const OUTCOMES = ['win', 'death', 'stall-timeout', 'error'];

/** A record from a results file with element, outcome and seed checked; anything else throws. */
function checked(r) {
  if (!r || typeof r !== 'object') throw new Error('summary: record is not an object');
  if (!ELEMENT_ORDER.includes(r.element)) throw new Error('summary: bad element');
  if (!OUTCOMES.includes(r.outcome)) throw new Error('summary: bad outcome');
  if (!Number.isInteger(r.seed)) throw new Error('summary: bad seed');
  return r;
}

/** The last non-error record of each element|seed|sweep, in first-seen order. */
export function dedupe(runs) {
  const byKey = new Map();
  for (const r of runs) {
    checked(r);
    if (r.outcome === 'error') continue;
    byKey.set(jobKey(r), r);
  }
  return [...byKey.values()];
}

const spellsOf = (r) => r.loadout?.spells ?? [];
const hasReach = (r) => spellsOf(r).some((s) => REACH_IDS.includes(s[0]));

const HEADER =
  '| Sweep | Element | Seed | Outcome | Ended | Boss kill | Level at 20:00 / end | Min at cap | HP lost | Actives (spell level) |\n|---|---|---|---|---|---|---|---|---|---|\n';

export function runsTable(runs) {
  let out = HEADER;
  for (const r of runs) {
    const actives = spellsOf(r)
      .map(([id, level]) => `${spellName(id)} ${level}`)
      .join(', ');
    const outcome = r.outcome === 'stall-timeout' ? 'stall (stopped at 40:00)' : r.outcome;
    const kill = r.bossTtkS ? `${Math.round(r.bossTtkS)} s` : '–';
    out += `| ${r.sweepIndex} | ${r.element} | ${r.seed} | ${outcome} | ${mmss(r.timeSurvivedMs)} | ${kill} | ${r.levelAt20 ?? '–'} / ${r.levelEnd} | ${r.capMinutes} | ${Math.round(r.hpLost.total)} | ${actives}${hasReach(r) ? ' ★' : ''} |\n`;
  }
  return out;
}

const GROUP_HEADER =
  '| Group | Runs | Wins | Deaths | Stalls | Boss kill range | Median | <90 / 90–180 / >180 s |\n|---|---|---|---|---|---|---|---|';

/** One row of the group table. */
export function groupRow(label, runs) {
  const wins = runs.filter((r) => r.outcome === 'win').map((r) => r.bossTtkS);
  const count = (outcome) => runs.filter((r) => r.outcome === outcome).length;
  const range = wins.length
    ? `${Math.round(Math.min(...wins))}–${Math.round(Math.max(...wins))} s`
    : '–';
  const med = wins.length ? `${Math.round(median(wins))} s` : '–';
  const bands = `${wins.filter((x) => x < 90).length} / ${wins.filter((x) => x >= 90 && x <= 180).length} / ${wins.filter((x) => x > 180).length}`;
  return `| ${label} | ${runs.length} | ${wins.length} | ${count('death')} | ${count('stall-timeout')} | ${range} | ${med} | ${bands} |`;
}

export function groupTable(runs) {
  const rows = [groupRow('All', runs)];
  for (const e of ELEMENT_ORDER)
    rows.push(
      groupRow(
        e,
        runs.filter((r) => r.element === e),
      ),
    );
  rows.push(groupRow('With a reach spell ★', runs.filter(hasReach)));
  rows.push(
    groupRow(
      'Without',
      runs.filter((r) => !hasReach(r)),
    ),
  );
  for (const k of [...new Set(runs.map((r) => r.sweepIndex))].sort((a, b) => a - b)) {
    rows.push(
      groupRow(
        `Sweep ${k}`,
        runs.filter((r) => r.sweepIndex === k),
      ),
    );
  }
  return `${GROUP_HEADER}\n${rows.join('\n')}`;
}

/** Per extra active (the element's own default excluded): runs, wins, deaths. */
export function activeTable(runs) {
  const count = new Map();
  for (const r of runs) {
    for (const [id] of spellsOf(r)) {
      if (id === r.element) continue;
      const c = count.get(id) ?? { n: 0, w: 0, d: 0 };
      c.n++;
      if (r.outcome === 'win') c.w++;
      if (r.outcome === 'death') c.d++;
      count.set(id, c);
    }
  }
  const rows = [...count.entries()]
    .sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n || b[1].n - a[1].n)
    .map(([id, v]) => `| ${spellName(id)} | ${v.n} | ${v.w} | ${v.d} |`);
  return `| Active | Runs | Wins | Deaths |\n|---|---|---|---|${rows.length ? '\n' + rows.join('\n') : ''}`;
}

function footer(runs) {
  const lines = [];
  const deaths = runs.filter((r) => r.outcome === 'death');
  if (deaths.length) {
    const total = deaths.reduce((a, r) => a + r.hpLost.total, 0);
    const shots = deaths.reduce((a, r) => a + (r.hpLost.shots || 0), 0);
    const times = deaths
      .map((r) => mmss(r.timeSurvivedMs))
      .sort()
      .join(', ');
    const share = total ? `${Math.round((100 * shots) / total)}%` : '–';
    lines.push(
      `deaths ${deaths.length} times ${times} levels ${median(deaths.map((r) => r.levelEnd))} shots share ${share}`,
    );
  }
  const wins = runs.filter((r) => r.outcome === 'win');
  const l20 = wins.map((r) => r.levelAt20).filter((x) => x != null);
  if (wins.length && l20.length) {
    lines.push(
      `win L20 range ${Math.min(...l20)} ${Math.max(...l20)} median ${median(l20)} hpLost median ${median(wins.map((r) => r.hpLost.total))} boss-phase hp ${wins.map((r) => r.hpLost.bossSlam + r.hpLost.bossVolley).join(',')}`,
    );
  }
  const fps = runs.flatMap((r) =>
    r.samples
      .map(normaliseSample)
      .filter((s) => s.alive >= 295)
      .map((s) => s.fps),
  );
  if (fps.length) lines.push(`fps at cap n ${fps.length} min ${Math.min(...fps).toFixed(1)}`);
  lines.push(`wall total s ${Math.round(runs.reduce((a, r) => a + (r.wallS ?? 0), 0))}`);
  return lines.join('\n');
}

/** Whole report for a list of parsed records (sweepIndex 0 are scratch runs and are left out). */
export function summarize(records) {
  const runs = dedupe(records).filter((r) => r.sweepIndex > 0);
  return [runsTable(runs), groupTable(runs), '', activeTable(runs), '', footer(runs), ''].join(
    '\n',
  );
}
