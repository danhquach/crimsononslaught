import { describe, expect, it } from 'vitest';
import {
  RESULT_HEADLINES,
  isConfirmKey,
  resultRows,
  rewardRows,
  summarizePerks,
} from './resultModel';
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
};

describe('RESULT_HEADLINES', () => {
  it('names both outcomes with distinct colours', () => {
    expect(RESULT_HEADLINES.win.text).toBe('Victory');
    expect(RESULT_HEADLINES.lose.text).toBe('Defeat');
    expect(RESULT_HEADLINES.win.color).not.toBe(RESULT_HEADLINES.lose.color);
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
    const fresh: RunStats = { timeSurvivedMs: 0, level: 1, kills: 0, spellId: 'earth', perks: [] };
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
  it('shows the payout with a plus sign and the new balance', () => {
    expect(rewardRows({ earned: 1234, balance: 56789 })).toEqual([
      ['Embers earned', '+1,234'],
      ['Embers total', '56,789'],
    ]);
  });

  it('reads 0 for a run that paid nothing', () => {
    expect(rewardRows({ earned: 0, balance: 0 })).toEqual([
      ['Embers earned', '+0'],
      ['Embers total', '0'],
    ]);
  });
});
