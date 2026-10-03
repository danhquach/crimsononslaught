import { describe, expect, it } from 'vitest';
import { rosterCards } from '../../src/config/rosterCards.ts';
import { ROSTER_IDS } from './sweepOptions.mjs';
import {
  REACH_IDS,
  SPELL_NAMES,
  activeTable,
  dedupe,
  groupRow,
  median,
  mmss,
  runsTable,
  spellName,
  summarize,
} from './sweepSummary.mjs';

const run = (o) => ({
  element: 'fire',
  seed: 1,
  sweepIndex: 1,
  outcome: 'win',
  timeSurvivedMs: 1_260_000,
  bossTtkS: 60,
  levelAt20: 50,
  levelEnd: 51,
  loadout: {
    spells: [
      ['fire', 3],
      ['fire_dragon', 3],
    ],
    passives: [],
    relics: [],
  },
  hpLost: { total: 120.4, shots: 1, bossSlam: 2, bossVolley: 3 },
  capMinutes: 0,
  samples: [[1, 10, 2, 60, 0]],
  wallS: 100,
  ...o,
});

describe('names', () => {
  it('match the game roster cards exactly and cover every roster id', () => {
    for (const c of rosterCards()) expect(SPELL_NAMES[c.id]).toBe(c.name);
    expect(Object.keys(SPELL_NAMES).sort()).toEqual([...ROSTER_IDS].sort());
  });
  it('REACH_IDS are roster ids', () => {
    for (const id of REACH_IDS) expect(ROSTER_IDS).toContain(id);
  });
  it('an unknown id throws, including prototype names', () => {
    expect(() => spellName('nope')).toThrow();
    expect(() => spellName('__proto__')).toThrow();
    expect(() => spellName('constructor')).toThrow();
    expect(() => spellName('toString')).toThrow();
    expect(() => spellName(undefined)).toThrow();
  });
});

describe('helpers', () => {
  it('median of odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('mmss rounds to the second', () => {
    expect(mmss(435_285.8)).toBe('7:15');
    expect(mmss(2_401_000)).toBe('40:01');
    expect(mmss(59_600)).toBe('1:00');
  });
  it('dedupe keeps the last non-error record per key', () => {
    const out = dedupe([
      run({ outcome: 'error' }),
      run({ outcome: 'death' }),
      run({ outcome: 'win' }),
      run({ seed: 2, outcome: 'error' }),
    ]);
    expect(out.map((r) => r.outcome)).toEqual(['win']);
  });
});

describe('tables', () => {
  it('writes the run row with a reach star', () => {
    expect(runsTable([run({})])).toContain(
      '| 1 | fire | 1 | win | 21:00 | 60 s | 50 / 51 | 0 | 120 | Fire Bolt 3, Fire Dragon 3 ★ |',
    );
  });
  it('writes a stall and a death row', () => {
    const t = runsTable([
      run({ outcome: 'stall-timeout', timeSurvivedMs: 2_401_000, bossTtkS: null, levelAt20: null }),
    ]);
    expect(t).toContain('stall (stopped at 40:00) | 40:01 | – | – / 51');
  });
  it('groupRow counts wins, deaths, stalls and bands', () => {
    const rows = groupRow('x', [
      run({ bossTtkS: 30 }),
      run({ bossTtkS: 100 }),
      run({ bossTtkS: 200 }),
      run({ outcome: 'death', bossTtkS: null }),
      run({ outcome: 'stall-timeout', bossTtkS: null }),
    ]);
    expect(rows).toBe('| x | 5 | 3 | 1 | 1 | 30–200 s | 100 s | 1 / 1 / 1 |');
    expect(groupRow('none', [])).toBe('| none | 0 | 0 | 0 | 0 | – | – | 0 / 0 / 0 |');
  });
  it('activeTable leaves the element default out', () => {
    const t = activeTable([run({}), run({ outcome: 'death' })]);
    expect(t).toContain('| Fire Dragon | 2 | 1 | 1 |');
    expect(t).not.toContain('Fire Bolt');
  });
});

describe('summarize', () => {
  it('golden: a small file in the old format', () => {
    const old = [
      run({ samples: [{ min: 1, alive: 300, level: 2, fps: 40.5, bossHp: 0 }] }),
      run({
        seed: 2,
        outcome: 'death',
        bossTtkS: null,
        levelAt20: null,
        timeSurvivedMs: 435_000,
        levelEnd: 13,
      }),
      run({ seed: 9, sweepIndex: 0 }),
    ];
    const out = summarize(old);
    expect(out).toContain('| 1 | fire | 1 | win |');
    expect(out).not.toContain('| 0 | fire | 9 |');
    expect(out).toContain('| All | 2 | 1 | 1 | 0 | 60–60 s | 60 s | 1 / 0 / 0 |');
    expect(out).toContain('| Sweep 1 | 2 |');
    expect(out).toContain('deaths 1 times 7:15 levels 13 shots share 1%');
    expect(out).toContain('fps at cap n 1 min 40.5');
    expect(out).toContain('wall total s 200');
  });
  it('copes with an empty file', () => {
    expect(() => summarize([])).not.toThrow();
  });
  it('throws on an element, outcome or seed outside the allow-list', () => {
    expect(() => summarize([run({ element: '__proto__' })])).toThrow();
    expect(() => summarize([run({ outcome: '<b>' })])).toThrow();
    expect(() => summarize([run({ seed: '1|2' })])).toThrow();
    expect(() => summarize([run({ seed: 1.5 })])).toThrow();
    expect(() => summarize([null])).toThrow();
  });
  it('throws on an unknown spell id in a results file', () => {
    expect(() => summarize([run({ loadout: { spells: [['__proto__', 1]] } })])).toThrow();
  });
});
