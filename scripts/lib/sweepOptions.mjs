// Command-line options for the balance sweep (#407): parsed, bounded, and turned into
// the one URL the bot loads. Every value is allow-listed here, so a mistyped flag fails
// before a browser starts and nothing odd reaches the game's URL switches.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `SPELL_IDS` order (src/config/spells.ts): the key `1`-`4` on the spell-select screen. */
export const ELEMENTS = ['fire', 'ice', 'lightning', 'earth'];

/** Every roster spell id (src/config/loadout.ts); a unit test keeps it in step with the game. */
export const ROSTER_IDS = [
  'fire',
  'fire_meteor',
  'fire_column',
  'fire_companion',
  'fire_dragon',
  'ice',
  'ice_nova_bomb',
  'ice_shield',
  'ice_companion',
  'ice_blizzard',
  'lightning',
  'lightning_chain',
  'lightning_tornado',
  'lightning_companion',
  'lightning_sword',
  'earth',
  'earth_boulder',
  'earth_shield',
  'earth_quake',
  'earth_companion',
];

export const TIME_SCALE = 8;
export const DEFAULT_PORT = 5190;
export const MAX_SEEDS = 100;
export const MAX_SEED = 1_000_000;
export const MAX_SWEEPS = 20;
/** The game's own cap on a `?loadout=` list (MAX_SWITCH_LIST, src/core/runState.ts). */
export const MAX_LOADOUT = 8;
const MAX_ARG_CHARS = 500;

/** The game's `?loadout=` token shape (LOADOUT_TOKEN, src/core/runState.ts). */
const LOADOUT_TOKEN = /^([a-z_]{1,32})(?::([1-3]))?$/;

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DEFAULT_OUT = resolve(ROOT, 'sweep-results', 'runs.jsonl');

const VALUE_FLAGS = new Set(['elements', 'seeds', 'sweeps', 'port', 'loadout', 'out']);
const BOOL_FLAGS = new Set(['invulnerable', 'dash']);

function int(text, name, min, max) {
  if (!/^\d{1,9}$/.test(text)) throw new Error(`--${name}: not an integer: ${text.slice(0, 40)}`);
  const n = Number(text);
  if (n < min || n > max) throw new Error(`--${name}: ${n} is outside ${min}..${max}`);
  return n;
}

function parseElements(text) {
  const list = text.split(',');
  for (const e of list) {
    if (!ELEMENTS.includes(e)) throw new Error(`--elements: unknown element: ${e.slice(0, 40)}`);
  }
  if (new Set(list).size !== list.length) throw new Error('--elements: repeated element');
  return list;
}

function parseSeeds(text) {
  const range = /^(\d{1,9})-(\d{1,9})$/.exec(text);
  let seeds;
  if (range) {
    const a = int(range[1], 'seeds', 1, MAX_SEED);
    const b = int(range[2], 'seeds', 1, MAX_SEED);
    if (b < a) throw new Error('--seeds: range runs backwards');
    if (b - a + 1 > MAX_SEEDS) throw new Error(`--seeds: more than ${MAX_SEEDS} seeds`);
    seeds = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  } else {
    const parts = text.split(',', MAX_SEEDS + 1);
    if (parts.length > MAX_SEEDS) throw new Error(`--seeds: more than ${MAX_SEEDS} seeds`);
    seeds = parts.map((p) => int(p, 'seeds', 1, MAX_SEED));
  }
  if (new Set(seeds).size !== seeds.length) throw new Error('--seeds: repeated seed');
  return seeds;
}

function parseLoadout(text) {
  const tokens = text.split(',', MAX_LOADOUT + 1);
  if (tokens.length > MAX_LOADOUT) throw new Error(`--loadout: more than ${MAX_LOADOUT} spells`);
  const ids = new Set();
  for (const token of tokens) {
    const match = LOADOUT_TOKEN.exec(token);
    if (!match || !ROSTER_IDS.includes(match[1])) {
      throw new Error(`--loadout: bad token: ${token.slice(0, 40)}`);
    }
    if (ids.has(match[1])) throw new Error(`--loadout: repeated spell: ${match[1]}`);
    ids.add(match[1]);
  }
  return tokens;
}

function parseOut(text) {
  if (text.includes('\0')) throw new Error('--out: NUL in path');
  const path = resolve(text);
  if (!path.endsWith('.jsonl')) throw new Error('--out: must end in .jsonl');
  return path;
}

/** `process.argv.slice(2)` to the options; throws on anything not allow-listed. */
export function parseArgs(argv) {
  const opts = {
    elements: [...ELEMENTS],
    seeds: [1, 2, 3, 4, 5],
    sweeps: 1,
    port: DEFAULT_PORT,
    loadout: [],
    invulnerable: false,
    dash: false,
    out: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (typeof arg !== 'string' || !arg.startsWith('--')) throw new Error('unexpected argument');
    const name = arg.slice(2);
    if (BOOL_FLAGS.has(name)) {
      opts[name] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw new Error(`unknown flag: ${arg.slice(0, 40)}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${name}: missing value`);
    if (value.length > MAX_ARG_CHARS) throw new Error(`--${name}: value too long`);
    if (name === 'elements') opts.elements = parseElements(value);
    else if (name === 'seeds') opts.seeds = parseSeeds(value);
    else if (name === 'sweeps') opts.sweeps = int(value, name, 1, MAX_SWEEPS);
    else if (name === 'port') opts.port = int(value, name, 1024, 65535);
    else if (name === 'loadout') opts.loadout = parseLoadout(value);
    else opts.out = parseOut(value);
  }
  return opts;
}

/** The game URL for one run: fixed host, switches set through URLSearchParams. */
export function buildUrl(port, seed, opts) {
  const url = new URL(`http://localhost:${port}/`);
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('timeScale', String(TIME_SCALE));
  if (opts.loadout.length) url.searchParams.set('loadout', opts.loadout.join(','));
  if (opts.invulnerable) url.searchParams.set('invulnerable', '1');
  return url.href;
}

/** The record's `options` block: what makes two sweeps comparable. */
export function recordOptions(opts) {
  return {
    loadout: opts.loadout,
    invulnerable: opts.invulnerable,
    dash: opts.dash,
    timeScale: TIME_SCALE,
  };
}

/** Resume key: runs only count as done under the same options. */
export function optionsKey(opts) {
  return JSON.stringify(recordOptions(opts));
}

/** One job's identity inside a results file. */
export function jobKey(r) {
  return `${r.element}|${r.seed}|${r.sweepIndex}`;
}
