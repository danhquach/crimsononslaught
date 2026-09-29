import { describe, expect, it } from 'vitest';
import { PASSIVES, type PassiveId } from '../config/passives';
import { buildLoadout, takePassive, type Loadout } from './loadout';
import {
  MAX_BADGE_TEXT_CSS,
  MAX_RANK_CSS,
  badgeText,
  grantsMaxRank,
  isMaxed,
  rankFraction,
  rankLabel,
} from './maxRank';
import { passiveCard } from './levelUpOffer';

describe('MAX colours', () => {
  it('are CSS hex colours', () => {
    expect(MAX_RANK_CSS).toMatch(/^#[0-9a-f]{6}$/);
    expect(MAX_BADGE_TEXT_CSS).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('isMaxed', () => {
  it('is never true for a passive with no cap', () => {
    expect(isMaxed(1, undefined)).toBe(false);
    expect(isMaxed(99, undefined)).toBe(false);
  });

  it('is true from the cap up, not below it', () => {
    expect(isMaxed(0, 5)).toBe(false);
    expect(isMaxed(3, 5)).toBe(false);
    expect(isMaxed(4, 5)).toBe(false);
    expect(isMaxed(5, 5)).toBe(true);
    expect(isMaxed(10, 10)).toBe(true);
  });
});

describe('badgeText and rankFraction', () => {
  it('reads the count, or MAX at the cap', () => {
    expect(badgeText(3, false)).toBe('3');
    expect(badgeText(12, false)).toBe('12');
    expect(badgeText(5, true)).toBe('MAX');
  });

  it('reads ×n with no cap, n/cap below it and n/cap (max) at it', () => {
    expect(rankFraction(3, undefined)).toBe('×3');
    expect(rankFraction(3, 5)).toBe('3/5');
    expect(rankFraction(5, 5)).toBe('5/5 (max)');
  });
});

describe('rankLabel and grantsMaxRank', () => {
  it('reads nothing for a spell, a plain rank for an uncapped passive or a relic', () => {
    expect(rankLabel({})).toBe('');
    expect(rankLabel({ rank: 2 })).toBe('Rank 2');
    expect(rankLabel({ rank: 7 })).toBe('Rank 7');
  });

  it('reads the cap, and MAX on the final rank', () => {
    expect(rankLabel({ rank: 2, maxRank: 5 })).toBe('Rank 2/5');
    expect(rankLabel({ rank: 5, maxRank: 5 })).toBe('Rank 5/5 · MAX');
    expect(rankLabel({ rank: 10, maxRank: 10 })).toBe('Rank 10/10 · MAX');
  });

  it('grants the max rank only for the final rank of a capped passive', () => {
    expect(grantsMaxRank({})).toBe(false);
    expect(grantsMaxRank({ rank: 9 })).toBe(false);
    expect(grantsMaxRank({ rank: 2, maxRank: 5 })).toBe(false);
    expect(grantsMaxRank({ rank: 5, maxRank: 5 })).toBe(true);
  });

  it('marks the offered card of every shipped capped passive on its last rank only', () => {
    const capped = PASSIVES.filter((p) => p.maxRank !== undefined);
    expect(capped.length).toBeGreaterThan(0);
    for (const passive of capped) {
      const cap = passive.maxRank ?? 0;
      const at = (taken: number): Loadout => {
        let loadout = buildLoadout('fire');
        for (let i = 0; i < taken; i++) loadout = takePassive(loadout, passive.id as PassiveId);
        return loadout;
      };
      expect(rankLabel(passiveCard(at(cap - 1), passive)), passive.id).toMatch(/ · MAX$/);
      expect(rankLabel(passiveCard(at(cap - 2), passive)), passive.id).not.toMatch(/MAX/);
      expect(grantsMaxRank(passiveCard(at(cap - 1), passive)), passive.id).toBe(true);
    }
  });
});
