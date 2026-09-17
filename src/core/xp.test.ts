import { describe, expect, it } from 'vitest';
import { applyXpGain, xpToNext } from './xp';

describe('xpToNext', () => {
  it('is 10 + level * 5 (spec §5)', () => {
    expect(xpToNext(1)).toBe(15);
    expect(xpToNext(2)).toBe(20);
    expect(xpToNext(3)).toBe(25);
    expect(xpToNext(10)).toBe(60);
  });

  it('never gets cheaper as the run goes on', () => {
    for (let level = 1; level < 30; level += 1) {
      expect(xpToNext(level + 1), `level ${level}`).toBeGreaterThan(xpToNext(level));
    }
  });
});

describe('applyXpGain', () => {
  it('accumulates inside a level without levelling', () => {
    expect(applyXpGain({ level: 1, xp: 0 }, 1)).toEqual({ level: 1, xp: 1, levelsGained: 0 });
    expect(applyXpGain({ level: 1, xp: 13 }, 1)).toEqual({ level: 1, xp: 14, levelsGained: 0 });
  });

  it('levels exactly on the threshold, leaving no carry-over', () => {
    expect(applyXpGain({ level: 1, xp: 14 }, 1)).toEqual({ level: 2, xp: 0, levelsGained: 1 });
  });

  it('carries the surplus into the new level', () => {
    // 3 XP short of 15, gaining 10: one level and 7 XP toward the next.
    expect(applyXpGain({ level: 1, xp: 12 }, 10)).toEqual({ level: 2, xp: 7, levelsGained: 1 });
  });

  it('spends one pickup across several levels in order', () => {
    // 15 + 20 = 35 clears levels 1 and 2; 5 is left toward level 3's 25.
    expect(applyXpGain({ level: 1, xp: 0 }, 40)).toEqual({ level: 3, xp: 5, levelsGained: 2 });
  });

  it('turns 100 XP at level 1 into 4 level-ups and the right carry-over', () => {
    // Thresholds 15 + 20 + 25 + 30 = 90 spent, 10 carried toward level 5's 35.
    expect(applyXpGain({ level: 1, xp: 0 }, 100)).toEqual({ level: 5, xp: 10, levelsGained: 4 });
  });

  it('reaches the same place one gem at a time as in a single gain', () => {
    let progress = { level: 1, xp: 0 };
    let levelsGained = 0;
    for (let i = 0; i < 100; i += 1) {
      const next = applyXpGain(progress, 1);
      levelsGained += next.levelsGained;
      progress = { level: next.level, xp: next.xp };
    }
    expect({ ...progress, levelsGained }).toEqual({ level: 5, xp: 10, levelsGained: 4 });
  });

  it('ignores a non-positive or non-finite amount', () => {
    const progress = { level: 2, xp: 3 };
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyXpGain(progress, amount), String(amount)).toEqual({
        level: 2,
        xp: 3,
        levelsGained: 0,
      });
    }
  });

  it('leaves the progress object it was handed untouched', () => {
    const progress = { level: 1, xp: 14 };
    applyXpGain(progress, 10);
    expect(progress).toEqual({ level: 1, xp: 14 });
  });
});
