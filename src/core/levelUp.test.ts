import { describe, expect, it } from 'vitest';
import { EMPTY_OFFER_MAX_HP_BONUS } from '../config/progression';
import {
  LEVEL_UP_EVENT,
  MAX_OFFER_SIZE,
  isPerkCard,
  perkIndexForKey,
  resolveLevelUp,
  type PerkCard,
} from './levelUp';

const card = (id: string, rank = 1, maxRank = 3): PerkCard => ({
  id,
  name: `Perk ${id}`,
  branch: 'Power',
  rank,
  maxRank,
  description: 'Does a thing.',
});

describe('resolveLevelUp', () => {
  it('opens the overlay with exactly the offered cards for 1, 2 and 3 perks', () => {
    for (const n of [1, 2, 3]) {
      const offer = Array.from({ length: n }, (_, i) => card(`p${i}`));
      const result = resolveLevelUp(offer);
      expect(result.kind, `offer of ${n}`).toBe('overlay');
      if (result.kind === 'overlay') expect(result.cards).toEqual(offer);
    }
  });

  it('falls back to +10 max HP with no overlay when nothing is eligible', () => {
    expect(resolveLevelUp([])).toEqual({ kind: 'fallback', maxHpBonus: EMPTY_OFFER_MAX_HP_BONUS });
    expect(EMPTY_OFFER_MAX_HP_BONUS).toBe(10);
  });

  it('never shows more than three cards', () => {
    const offer = Array.from({ length: 5 }, (_, i) => card(`p${i}`));
    const result = resolveLevelUp(offer);
    expect(result.kind).toBe('overlay');
    if (result.kind === 'overlay') expect(result.cards).toEqual(offer.slice(0, MAX_OFFER_SIZE));
    expect(MAX_OFFER_SIZE).toBe(3);
  });
});

describe('perkIndexForKey', () => {
  it("maps '1'..'n' to card slots 0..n-1", () => {
    expect(perkIndexForKey('1', 3)).toBe(0);
    expect(perkIndexForKey('2', 3)).toBe(1);
    expect(perkIndexForKey('3', 3)).toBe(2);
  });

  it('ignores keys beyond the number of cards on screen', () => {
    expect(perkIndexForKey('3', 2)).toBeUndefined();
    expect(perkIndexForKey('2', 1)).toBeUndefined();
    expect(perkIndexForKey('4', 3)).toBeUndefined();
  });

  it('ignores non-digit and out-of-range keys', () => {
    for (const key of ['0', 'a', 'Enter', '', '11', '-1', 'Numpad1']) {
      expect(perkIndexForKey(key, 3), key).toBeUndefined();
    }
  });
});

describe('isPerkCard', () => {
  const valid = card('fire.power.dmg', 2, 3);

  it('accepts a full card, including rank at maxRank and single-rank perks', () => {
    expect(isPerkCard(valid)).toBe(true);
    expect(isPerkCard({ ...valid, rank: 3, maxRank: 3 })).toBe(true);
    expect(isPerkCard({ ...valid, rank: 1, maxRank: 1 })).toBe(true);
  });

  it('rejects each missing field', () => {
    for (const key of Object.keys(valid)) {
      const partial: Record<string, unknown> = { ...valid };
      delete partial[key];
      expect(isPerkCard(partial), `missing ${key}`).toBe(false);
    }
  });

  it('rejects impossible ranks and non-object input', () => {
    expect(isPerkCard({ ...valid, rank: 0 })).toBe(false);
    expect(isPerkCard({ ...valid, rank: 4, maxRank: 3 })).toBe(false);
    expect(isPerkCard({ ...valid, rank: 1.5 })).toBe(false);
    expect(isPerkCard({ ...valid, maxRank: 0 })).toBe(false);
    expect(isPerkCard({ ...valid, id: '' })).toBe(false);
    expect(isPerkCard({ ...valid, name: '' })).toBe(false);
    expect(isPerkCard({ ...valid, description: '' })).toBe(false);
    expect(isPerkCard({ ...valid, branch: '' }), 'branch may be empty').toBe(true);
    expect(isPerkCard(null)).toBe(false);
    expect(isPerkCard('fire.power.dmg')).toBe(false);
  });
});

describe('LEVEL_UP_EVENT', () => {
  it('is namespaced away from Phaser scene events and run events', () => {
    expect(LEVEL_UP_EVENT.pick).toMatch(/^levelup:/);
  });
});
