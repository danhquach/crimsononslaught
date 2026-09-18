import { describe, expect, it } from 'vitest';
import { XP_CURVE } from './progression';

describe('xp curve', () => {
  it('matches spec §5 `xpToNext(level) = 10 + level * 5`', () => {
    expect(XP_CURVE).toEqual({ base: 10, perLevel: 5 });
  });

  it('keeps the curve rising', () => {
    expect(XP_CURVE.perLevel).toBeGreaterThan(0);
  });
});
