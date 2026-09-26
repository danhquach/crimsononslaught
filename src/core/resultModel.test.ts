import { describe, expect, it } from 'vitest';
import {
  RESULT_HEADLINES,
  isConfirmKey,
  mostPlayedSpell,
  profileRows,
  resultRows,
  rewardRows,
  summarizePerks,
} from './resultModel';
import { emptySave } from './save';
import type { RunStats } from './scenePayloads';

/** Value of the row with `label`, or undefined when the row is missing. */
const rowValue = (s: RunStats, label: string): string | undefined =>
  resultRows(s).find(([l]) => l === label)?.[1];

const stats: RunStats = {
  timeSurvivedMs: 272_400,
  level: 8,
  kills: 1234,
  spellId: 'fire',
  perks: ['Power', 'Meteor', 'Power'],
  embers: 312,
  consumables: 4,
  relics: 3,
};

describe('RESULT_HEADLINES', () => {
  it('names both outcomes with distinct colours', () => {
    expect(RESULT_HEADLINES.win.text).toBe('Victory');
    expect(RESULT_HEADLINES.lose.text).toBe('Defeat');
    expect(RESULT_HEADLINES.win.color).not.toBe(RESULT_HEADLINES.lose.color);
  });

  it('names an ended run (#252) apart from a win or a loss', () => {
    expect(RESULT_HEADLINES.ended.text).toBe('Run ended');
    expect(RESULT_HEADLINES.ended.color).not.toBe(RESULT_HEADLINES.win.color);
    expect(RESULT_HEADLINES.ended.color).not.toBe(RESULT_HEADLINES.lose.color);
  });
});

describe('isConfirmKey', () => {
  it('accepts Enter only', () => {
    expect(isConfirmKey('Enter')).toBe(true);
    expect(isConfirmKey(' ')).toBe(false);
    expect(isConfirmKey('Escape')).toBe(false);
    expect(isConfirmKey('1')).toBe(false);
    expect(isConfirmKey('enter')).toBe(false);
  });
});

describe('summarizePerks', () => {
  it('reads none for an empty run', () => {
    expect(summarizePerks([])).toBe('none');
  });

  it('keeps pick order and collapses repeats into ×n', () => {
    expect(summarizePerks(stats.perks)).toBe('Power ×2, Meteor');
    expect(summarizePerks(['a', 'a', 'a'])).toBe('a ×3');
  });
});

describe('resultRows', () => {
  it('formats every stat in the ticket order', () => {
    expect(resultRows(stats)).toEqual([
      ['Time survived', '4:32'],
      ['Level', '8'],
      ['Kills', '1,234'],
      ['Spell', 'Fire Bolt'],
      ['Upgrades taken', 'Power ×2, Meteor'],
    ]);
  });

  it('names the spell for every id', () => {
    expect(rowValue({ ...stats, spellId: 'ice' }, 'Spell')).toBe('Ice Arrow');
    expect(rowValue({ ...stats, spellId: 'lightning' }, 'Spell')).toBe('Lightning Bolt');
    expect(rowValue({ ...stats, spellId: 'earth' }, 'Spell')).toBe('Earth Spike');
  });

  it('renders a fresh run as 0:00, level 1, no kills, no perks', () => {
    const fresh: RunStats = {
      timeSurvivedMs: 0,
      level: 1,
      kills: 0,
      spellId: 'earth',
      perks: [],
      embers: 0,
      consumables: 0,
      relics: 0,
    };
    expect(resultRows(fresh)).toEqual([
      ['Time survived', '0:00'],
      ['Level', '1'],
      ['Kills', '0'],
      ['Spell', 'Earth Spike'],
      ['Upgrades taken', 'none'],
    ]);
  });

  it('floors fractional counts and clamps negatives and NaN to 0', () => {
    const odd: RunStats = { ...stats, level: 3.9, kills: -4 };
    expect(rowValue(odd, 'Level')).toBe('3');
    expect(rowValue(odd, 'Kills')).toBe('0');
    expect(rowValue({ ...stats, kills: NaN }, 'Kills')).toBe('0');
  });
});

describe('rewardRows', () => {
  it('shows the Embers collected and the new balance', () => {
    expect(rewardRows({ earned: 1234, balance: 56789 })).toEqual([
      ['Embers collected', '1,234'],
      ['Embers total', '56,789'],
    ]);
  });

  it('reads 0 for a run that collected nothing', () => {
    expect(rewardRows({ earned: 0, balance: 0 })).toEqual([
      ['Embers collected', '0'],
      ['Embers total', '0'],
    ]);
  });
});

describe('mostPlayedSpell', () => {
  it('is null before any run', () => {
    expect(mostPlayedSpell({})).toBeNull();
  });

  it('picks the highest count, a tie going to the spell listed first', () => {
    expect(mostPlayedSpell({ fire: 1, earth: 3 })).toBe('earth');
    expect(mostPlayedSpell({ lightning: 2, ice: 2 })).toBe('ice');
  });

  it('skips ids this build has no card for', () => {
    expect(mostPlayedSpell({ retired: 9, ice: 1 })).toBe('ice');
    expect(mostPlayedSpell({ retired: 9 })).toBeNull();
  });
});

describe('profileRows', () => {
  it('is empty before the first run', () => {
    expect(profileRows(emptySave().profile)).toEqual([]);
  });

  it('formats the lifetime totals like the result screen formats a run', () => {
    const profile = {
      runs: 12,
      wins: 2,
      bestTimeMs: 272_400,
      bestLevel: 14,
      totalKills: 12_345,
      spellCounts: { fire: 4, lightning: 8 },
    };
    expect(profileRows(profile)).toEqual([
      ['Runs played', '12'],
      ['Best time survived', '4:32'],
      ['Best level', '14'],
      ['Total kills', '12,345'],
      ['Most played spell', 'Lightning Bolt'],
    ]);
  });
});
