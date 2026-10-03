import { describe, expect, it } from 'vitest';
import { ROSTER_SPELL_IDS } from '../../src/config/loadout.ts';
import { SPELL_IDS } from '../../src/config/spells.ts';
import { MAX_SWITCH_LIST, parseLoadoutSwitch } from '../../src/core/runState.ts';
import {
  DEFAULT_OUT,
  ELEMENTS,
  MAX_LOADOUT,
  ROSTER_IDS,
  buildUrl,
  jobKey,
  optionsKey,
  parseArgs,
  recordOptions,
} from './sweepOptions.mjs';

describe('lists kept in step with the game', () => {
  it('ELEMENTS is the spell-select order, so key 1-4 picks the element', () => {
    expect(ELEMENTS).toEqual([...SPELL_IDS]);
  });
  it('ROSTER_IDS is the game roster, in order', () => {
    expect(ROSTER_IDS).toEqual([...ROSTER_SPELL_IDS]);
  });
  it('MAX_LOADOUT is the game cap', () => {
    expect(MAX_LOADOUT).toBe(MAX_SWITCH_LIST);
  });
});

describe('parseArgs', () => {
  it('defaults to every element, seeds 1-5, one sweep', () => {
    const o = parseArgs([]);
    expect(o.elements).toEqual(ELEMENTS);
    expect(o.seeds).toEqual([1, 2, 3, 4, 5]);
    expect(o.sweeps).toBe(1);
    expect(o.port).toBe(5190);
    expect(o.loadout).toEqual([]);
    expect(o.invulnerable).toBe(false);
    expect(o.dash).toBe(false);
    expect(o.out).toBe(DEFAULT_OUT);
  });

  it('reads every option', () => {
    const o = parseArgs([
      '--elements',
      'fire,earth',
      '--seeds',
      '2-4',
      '--sweeps',
      '2',
      '--port',
      '5200',
      '--loadout',
      'fire,fire_dragon:3',
      '--invulnerable',
      '--dash',
      '--out',
      'x/y.jsonl',
    ]);
    expect(o.elements).toEqual(['fire', 'earth']);
    expect(o.seeds).toEqual([2, 3, 4]);
    expect(o.sweeps).toBe(2);
    expect(o.port).toBe(5200);
    expect(o.loadout).toEqual(['fire', 'fire_dragon:3']);
    expect(o.invulnerable).toBe(true);
    expect(o.dash).toBe(true);
    expect(o.out.endsWith('/x/y.jsonl')).toBe(true);
  });

  it('reads a seed list', () => {
    expect(parseArgs(['--seeds', '7,3']).seeds).toEqual([7, 3]);
  });
});

describe('parseArgs refuses hostile or malformed input', () => {
  const bad = (args) => expect(() => parseArgs(args)).toThrow();

  it.each([
    'fire:4',
    'fire::2',
    'fire:2.5',
    'fire:0',
    '__proto__',
    'constructor',
    '\u202efire',
    'fire%00',
    'fire\0',
    'nope',
    'Fire',
    'fire,fire',
    'a'.repeat(10_000),
    'fire,ice,lightning,earth,fire_meteor,fire_column,fire_companion,fire_dragon,ice_shield',
  ])('loadout %j', (v) => bad(['--loadout', v]));

  it.each(['1-1000000000', '1;rm', '0', '1000001', '5-2', '1-101', '1,1', '1e3', '-1', ''])(
    'seeds %j',
    (v) => bad(['--seeds', v]),
  );

  it.each(['80', '1023', '65536', 'abc', '5190;ls'])('port %j', (v) => bad(['--port', v]));
  it.each(['0', '21', 'x'])('sweeps %j', (v) => bad(['--sweeps', v]));
  it.each(['__proto__', 'fire,fire', 'water', ''])('elements %j', (v) => bad(['--elements', v]));
  // --out may point anywhere (a local CLI, the user's own path); it is refused only for the
  // extension or a NUL, so '../../etc/passwd' fails on the missing .jsonl, not on traversal.
  it.each(['x.json', '../../etc/passwd', 'a\0.jsonl'])('out %j', (v) => bad(['--out', v]));

  it('refuses an unknown flag, a stray argument and a missing value', () => {
    bad(['--nope']);
    bad(['fire']);
    bad(['--seeds']);
    bad(['--seeds', '--dash']);
  });
});

describe('--out', () => {
  it('allows a relative path with .jsonl, resolved from the cwd', () => {
    expect(parseArgs(['--out', '../x.jsonl']).out.endsWith('/x.jsonl')).toBe(true);
  });
});

describe('buildUrl', () => {
  it('round-trips through URLSearchParams on a fixed host', () => {
    const o = parseArgs(['--loadout', 'fire,fire_dragon:3', '--invulnerable']);
    const url = new URL(buildUrl(5190, 7, o));
    expect(url.origin).toBe('http://localhost:5190');
    expect(url.searchParams.get('seed')).toBe('7');
    expect(url.searchParams.get('timeScale')).toBe('8');
    expect(url.searchParams.get('invulnerable')).toBe('1');
    expect(url.searchParams.get('loadout')).toBe('fire,fire_dragon:3');
  });

  it('writes a loadout the game accepts, level and all', () => {
    const o = parseArgs(['--loadout', 'fire,fire_dragon:3']);
    const search = new URL(buildUrl(5190, 1, o)).search;
    expect(parseLoadoutSwitch(search)).toEqual([{ id: 'fire' }, { id: 'fire_dragon', level: 3 }]);
  });

  it('leaves the switches out by default', () => {
    const url = new URL(buildUrl(5190, 1, parseArgs([])));
    expect(url.searchParams.has('loadout')).toBe(false);
    expect(url.searchParams.has('invulnerable')).toBe(false);
  });
});

describe('keys', () => {
  it('optionsKey differs when any option differs', () => {
    const base = optionsKey(parseArgs([]));
    expect(optionsKey(parseArgs(['--dash']))).not.toBe(base);
    expect(optionsKey(parseArgs(['--invulnerable']))).not.toBe(base);
    expect(optionsKey(parseArgs(['--loadout', 'fire']))).not.toBe(base);
    expect(optionsKey(parseArgs(['--seeds', '9']))).toBe(base);
  });
  it('recordOptions carries the time scale', () => {
    expect(recordOptions(parseArgs([])).timeScale).toBe(8);
  });
  it('jobKey joins element, seed and sweep', () => {
    expect(jobKey({ element: 'ice', seed: 3, sweepIndex: 2 })).toBe('ice|3|2');
  });
});
