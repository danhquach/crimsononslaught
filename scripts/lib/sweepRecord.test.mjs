import { describe, expect, it } from 'vitest';
import { BOSS_START_TIME } from '../../src/config/waves.ts';
import { optionsKey, parseArgs } from './sweepOptions.mjs';
import {
  BOSS_START_MS,
  capMinutes,
  doneKeys,
  isSuspect,
  mapOutcome,
  normaliseSample,
} from './sweepRecord.mjs';

describe('constants', () => {
  it('BOSS_START_MS is the game boss start', () => {
    expect(BOSS_START_MS).toBe(BOSS_START_TIME * 1000);
  });
});

describe('normaliseSample', () => {
  it('reads the array form', () => {
    expect(normaliseSample([3, 14, 7, 61, 0])).toEqual({
      min: 3,
      alive: 14,
      level: 7,
      fps: 61,
      bossHp: 0,
    });
  });
  it('reads the object form', () => {
    const o = { min: 3, alive: 14, level: 7, fps: 61, bossHp: 0 };
    expect(normaliseSample(o)).toEqual(o);
  });
});

describe('capMinutes', () => {
  it('counts minutes at the cap with no level gained', () => {
    const s = [
      [1, 300, 5, 60, 0],
      [2, 300, 5, 60, 0],
      [3, 300, 6, 60, 0],
      [4, 100, 6, 60, 0],
      [5, 296, 6, 60, 0],
    ];
    expect(capMinutes(s)).toBe(1 + 0 + 0 + 1);
  });
  it('is 0 for no samples', () => expect(capMinutes([])).toBe(0));
});

describe('isSuspect', () => {
  const at10 = (level) => [[10, 50, level, 60, 0]];
  it('flags level 5 or less at 10:00', () => {
    expect(isSuspect(at10(5))).toBe(true);
    expect(isSuspect(at10(6))).toBe(false);
  });
  it('does not flag a run that never reached 10:00', () => {
    expect(isSuspect([[1, 10, 1, 60, 0]])).toBe(false);
  });
});

describe('mapOutcome', () => {
  it('maps win, lose and anything else', () => {
    expect(mapOutcome('win')).toBe('win');
    expect(mapOutcome('lose')).toBe('death');
    expect(mapOutcome('ended')).toBe('error');
    expect(mapOutcome(undefined)).toBe('error');
  });
});

describe('doneKeys', () => {
  const rec = (o) =>
    JSON.stringify({ element: 'fire', seed: 1, sweepIndex: 1, commit: 'abc', dirty: false, ...o });
  const key = optionsKey(parseArgs([]));
  it('does not count runs from another commit or a dirty tree', () => {
    const lines = [
      rec({ outcome: 'win', commit: 'def' }),
      rec({ seed: 2, outcome: 'win', dirty: true }),
      rec({ seed: 3, outcome: 'win', commit: undefined }),
      rec({ seed: 4, outcome: 'win' }),
    ];
    expect([...doneKeys(lines, key, 'abc')]).toEqual(['fire|4|1']);
  });
  it('counts finished runs, not errors, not other options, not junk', () => {
    const lines = [
      rec({ outcome: 'win' }),
      rec({ seed: 2, outcome: 'error' }),
      rec({ seed: 3, outcome: 'win', options: { dash: true } }),
      'not json',
      '',
      rec({
        seed: 4,
        outcome: 'death',
        options: { loadout: [], invulnerable: false, dash: false, timeScale: 8 },
      }),
    ];
    expect([...doneKeys(lines, key, 'abc')].sort()).toEqual(['fire|1|1', 'fire|4|1']);
  });
});
