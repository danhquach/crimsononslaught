import { describe, expect, it } from 'vitest';
import { chooseCard } from './sweepPick.mjs';

const card = (kind, id = kind) => ({ kind, id });

describe('chooseCard', () => {
  it('takes the first active when all three are actives', () => {
    expect(chooseCard([card('active', 'a'), card('active', 'b'), card('active', 'c')])).toBe(0);
  });
  it('takes an upgrade over passives', () => {
    expect(chooseCard([card('passive', 'passive_power'), card('upgrade', 'fire')])).toBe(1);
  });
  it('takes an active over an upgrade', () => {
    expect(chooseCard([card('upgrade', 'fire'), card('active', 'ice_shield')])).toBe(1);
  });
  it('ranks passives Power, Haste, Expanse, Persistence', () => {
    const cards = [
      card('passive', 'passive_persistence'),
      card('passive', 'passive_expanse'),
      card('passive', 'passive_haste'),
    ];
    expect(chooseCard(cards)).toBe(2);
    expect(chooseCard([cards[0], cards[1], card('passive', 'passive_power')])).toBe(2);
    expect(chooseCard([cards[0], cards[1]])).toBe(1);
  });
  it('takes any other passive over a relic', () => {
    expect(chooseCard([card('relic', 'r'), card('passive', 'passive_velocity')])).toBe(1);
  });
  it('takes a relic over a charge', () => {
    expect(chooseCard([card('charge'), card('relic', 'r')])).toBe(1);
  });
  it('falls back to the first card', () => {
    expect(chooseCard([card('charge'), card('charge')])).toBe(0);
  });
  it('copes with no cards', () => {
    expect(chooseCard([])).toBe(0);
    expect(chooseCard(undefined)).toBe(0);
  });
});
