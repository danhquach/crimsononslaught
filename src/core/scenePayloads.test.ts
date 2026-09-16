import { describe, expect, it } from 'vitest';
import { isGamePayload, isResultPayload, isRunStats, type ResultPayload } from './scenePayloads';

const stats = { timeSurvivedMs: 12_345, level: 3, kills: 42, spellId: 'fire', perks: ['a', 'b'] };
const result: ResultPayload = { outcome: 'win', stats: { ...stats, spellId: 'fire' } };

describe('isGamePayload', () => {
  it('accepts every spell id with an integer seed', () => {
    for (const spellId of ['fire', 'ice', 'lightning', 'earth']) {
      expect(isGamePayload({ spellId, seed: 1 })).toBe(true);
    }
    expect(isGamePayload({ spellId: 'ice', seed: 0 })).toBe(true);
    expect(isGamePayload({ spellId: 'ice', seed: -7 })).toBe(true);
  });

  it('rejects missing or malformed payloads (Phaser passes {} when none is given)', () => {
    expect(isGamePayload(undefined)).toBe(false);
    expect(isGamePayload(null)).toBe(false);
    expect(isGamePayload({})).toBe(false);
    expect(isGamePayload({ spellId: 'water', seed: 1 })).toBe(false);
    expect(isGamePayload({ spellId: 'fire' })).toBe(false);
    expect(isGamePayload({ spellId: 'fire', seed: 1.5 })).toBe(false);
    expect(isGamePayload({ spellId: 'fire', seed: '1' })).toBe(false);
    expect(isGamePayload({ spellId: 'fire', seed: NaN })).toBe(false);
  });
});

describe('isRunStats', () => {
  it('accepts a full stats object, including an empty perk list', () => {
    expect(isRunStats(stats)).toBe(true);
    expect(isRunStats({ ...stats, perks: [] })).toBe(true);
  });

  it('rejects each missing or mistyped field', () => {
    for (const key of Object.keys(stats)) {
      const partial: Record<string, unknown> = { ...stats };
      delete partial[key];
      expect(isRunStats(partial), `missing ${key}`).toBe(false);
    }
    expect(isRunStats({ ...stats, kills: Infinity })).toBe(false);
    expect(isRunStats({ ...stats, level: '3' })).toBe(false);
    expect(isRunStats({ ...stats, spellId: 'water' })).toBe(false);
    expect(isRunStats({ ...stats, perks: [1] })).toBe(false);
    expect(isRunStats({ ...stats, perks: 'a' })).toBe(false);
  });
});

describe('isResultPayload', () => {
  it('accepts win and lose with valid stats', () => {
    expect(isResultPayload(result)).toBe(true);
    expect(isResultPayload({ ...result, outcome: 'lose' })).toBe(true);
  });

  it('rejects missing payload, unknown outcome, or bad stats', () => {
    expect(isResultPayload(undefined)).toBe(false);
    expect(isResultPayload({})).toBe(false);
    expect(isResultPayload({ outcome: 'draw', stats })).toBe(false);
    expect(isResultPayload({ outcome: 'win' })).toBe(false);
    expect(isResultPayload({ outcome: 'win', stats: {} })).toBe(false);
  });
});
