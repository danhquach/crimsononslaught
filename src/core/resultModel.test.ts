import { describe, expect, it } from 'vitest';
import { RESULT_HEADLINES, isConfirmKey, resultRows, summarizePerks } from './resultModel';
import type { RunStats } from './scenePayloads';

/** Value of the row with `label`, or undefined when the row is missing. */
const rowValue = (s: RunStats, label: string): string | undefined =>
  resultRows(s).find(([l]) => l === label)?.[1];

const stats: RunStats = {
  timeSurvivedMs: 272_400,
  level: 8,
  kills: 1234,
  spellId: 'fire',
  perks: ['Sharper Edge', 'Quick Cast', 'Sharper Edge'],
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
    expect(summarizePerks(stats.perks)).toBe('Sharper Edge ×2, Quick Cast');
    expect(summarizePerks(['a', 'a', 'a'])).toBe('a ×3');
  });
});

describe('resultRows', () => {
  it('formats every stat in the ticket order', () => {
    expect(resultRows(stats)).toEqual([
      ['Time survived', '4:32'],
      ['Level', '8'],
      ['Kills', '1,234'],
      ['Spell', 'Fireball'],
      ['Perks taken', 'Sharper Edge ×2, Quick Cast'],
    ]);
  });

  it('names the spell for every id', () => {
    expect(rowValue({ ...stats, spellId: 'ice' }, 'Spell')).toBe('Frost Nova');
    expect(rowValue({ ...stats, spellId: 'lightning' }, 'Spell')).toBe('Chain Lightning');
    expect(rowValue({ ...stats, spellId: 'earth' }, 'Spell')).toBe('Orbiting Boulders');
  });

  it('renders a fresh run as 0:00, level 1, no kills, no perks', () => {
    const fresh: RunStats = { timeSurvivedMs: 0, level: 1, kills: 0, spellId: 'earth', perks: [] };
    expect(resultRows(fresh)).toEqual([
      ['Time survived', '0:00'],
      ['Level', '1'],
      ['Kills', '0'],
      ['Spell', 'Orbiting Boulders'],
      ['Perks taken', 'none'],
    ]);
  });

  it('floors fractional counts and clamps negatives and NaN to 0', () => {
    const odd: RunStats = { ...stats, level: 3.9, kills: -4 };
    expect(rowValue(odd, 'Level')).toBe('3');
    expect(rowValue(odd, 'Kills')).toBe('0');
    expect(rowValue({ ...stats, kills: NaN }, 'Kills')).toBe('0');
  });
});
