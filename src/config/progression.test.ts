import { describe, expect, it } from 'vitest';
import { EMPTY_OFFER_MAX_HP_BONUS, XP_CURVE } from './progression';

describe('xp curve', () => {
  it('matches spec §5 `xpToNext(level) = 10 + level * 5`', () => {
    expect(XP_CURVE).toEqual({ base: 10, perLevel: 5 });
  });

  it('keeps the curve rising', () => {
    expect(XP_CURVE.perLevel).toBeGreaterThan(0);
  });
});

describe('empty perk offer fallback', () => {
  it('matches spec §5 "If 0, grant +10 max HP silently and resume"', () => {
    expect(EMPTY_OFFER_MAX_HP_BONUS).toBe(10);
  });
});
