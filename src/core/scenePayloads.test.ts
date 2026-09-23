import { describe, expect, it } from 'vitest';
import {
  isGamePayload,
  isLevelUpPayload,
  isResultPayload,
  isRunStats,
  type ResultPayload,
} from './scenePayloads';

const stats = {
  timeSurvivedMs: 12_345,
  level: 3,
  kills: 42,
  spellId: 'fire',
  perks: ['a', 'b'],
  embers: 17,
  consumables: 2,
  relics: 1,
};
const result: ResultPayload = {
  outcome: 'win',
  stats: { ...stats, spellId: 'fire' },
  earned: 210,
  balance: 560,
};

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
    expect(isRunStats({ ...stats, embers: '17' })).toBe(false);
    expect(isRunStats({ ...stats, consumables: null })).toBe(false);
    expect(isRunStats({ ...stats, relics: NaN })).toBe(false);
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

  it('rejects a payload without the run reward', () => {
    expect(isResultPayload({ outcome: 'win', stats })).toBe(false);
    expect(isResultPayload({ ...result, earned: NaN })).toBe(false);
    expect(isResultPayload({ ...result, balance: undefined })).toBe(false);
  });
});

describe('isLevelUpPayload', () => {
  const passive = {
    kind: 'passive',
    id: 'passive_power',
    name: 'Power',
    rank: 1,
    maxRank: 3,
    description: 'Every spell deals 10% more damage.',
  };
  const active = {
    kind: 'active',
    id: 'fire_meteor',
    name: 'Meteor',
    description: 'Calls a meteor down on the crowd.',
  };

  it('accepts one to three valid cards, of either kind', () => {
    expect(isLevelUpPayload({ offer: [passive] })).toBe(true);
    expect(isLevelUpPayload({ offer: [passive, passive, passive] })).toBe(true);
    expect(isLevelUpPayload({ offer: [active, active] })).toBe(true);
  });

  it('rejects an empty offer (Game handles that path without an overlay) and more than three', () => {
    expect(isLevelUpPayload({ offer: [] })).toBe(false);
    expect(isLevelUpPayload({ offer: [passive, passive, passive, passive] })).toBe(false);
  });

  it('rejects missing payload or a malformed card', () => {
    expect(isLevelUpPayload(undefined)).toBe(false);
    expect(isLevelUpPayload({})).toBe(false);
    expect(isLevelUpPayload({ offer: 'passive' })).toBe(false);
    expect(isLevelUpPayload({ offer: [{ ...passive, rank: 0 }] })).toBe(false);
    expect(isLevelUpPayload({ offer: [{ ...active, kind: 'perk' }] })).toBe(false);
  });
});
