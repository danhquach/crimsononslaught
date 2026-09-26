import { describe, expect, it } from 'vitest';
import {
  LEVEL_UP_CHARGES,
  RELIC_CHARGES,
  SKIP_REROLL_BONUS,
  START_BANS,
  START_REROLLS,
  chargeById,
} from '../config/offerActions';
import {
  countsOf,
  grantCharge,
  skipOffer,
  spendBan,
  spendReroll,
  startingActions,
} from './offerActions';

describe('offer actions (#228)', () => {
  it('starts a run with 3 rerolls, 1 ban and nothing banned', () => {
    expect(START_REROLLS).toBe(3);
    expect(START_BANS).toBe(1);
    const actions = startingActions();
    expect(countsOf(actions)).toEqual({ rerolls: 3, bans: 1 });
    expect(actions.banned.size).toBe(0);
  });

  it('starts every run afresh, whatever the last one banned or spent', () => {
    const spent = spendBan(startingActions(), 'passive_magnet');
    expect(spent?.banned.has('passive_magnet')).toBe(true);
    const next = startingActions();
    expect(next.banned.size).toBe(0);
    expect(countsOf(next)).toEqual({ rerolls: START_REROLLS, bans: START_BANS });
  });

  it('spends one reroll, and refuses at 0', () => {
    let actions = startingActions();
    for (let left = START_REROLLS - 1; left >= 0; left--) {
      const next = spendReroll(actions);
      if (!next) throw new Error('reroll refused early');
      expect(next.rerolls).toBe(left);
      actions = next;
    }
    expect(spendReroll(actions)).toBeUndefined();
  });

  it('pays +1 reroll on Skip, even at 0', () => {
    expect(SKIP_REROLL_BONUS).toBe(1);
    expect(skipOffer(startingActions()).rerolls).toBe(START_REROLLS + 1);
    expect(skipOffer({ ...startingActions(), rerolls: 0 }).rerolls).toBe(1);
  });

  it('bans a card for the run, spends one ban, and refuses at 0 or a repeat', () => {
    const once = spendBan(startingActions(), 'passive_magnet');
    if (!once) throw new Error('ban refused');
    expect(once.bans).toBe(START_BANS - 1);
    expect([...once.banned]).toEqual(['passive_magnet']);
    expect(spendBan(once, 'passive_pierce')).toBeUndefined();
    expect(spendBan({ ...once, bans: 1 }, 'passive_magnet')).toBeUndefined();
  });

  it('never changes the value it was given', () => {
    const actions = startingActions();
    spendReroll(actions);
    spendBan(actions, 'passive_magnet');
    skipOffer(actions);
    expect(countsOf(actions)).toEqual({ rerolls: START_REROLLS, bans: START_BANS });
    expect(actions.banned.size).toBe(0);
  });

  it('credits a charge card to its resource', () => {
    const [reroll, ban] = LEVEL_UP_CHARGES;
    const [rerolls2, ban1] = RELIC_CHARGES;
    if (!reroll || !ban || !rerolls2 || !ban1) throw new Error('charge list changed');
    const start = startingActions();
    expect(countsOf(grantCharge(start, reroll))).toEqual({ rerolls: 4, bans: 1 });
    expect(countsOf(grantCharge(start, ban))).toEqual({ rerolls: 3, bans: 2 });
    expect(countsOf(grantCharge(start, rerolls2))).toEqual({ rerolls: 5, bans: 1 });
    expect(countsOf(grantCharge(start, ban1))).toEqual({ rerolls: 3, bans: 2 });
  });
});

describe('charge cards (#228)', () => {
  it('are +1 Reroll and +1 Ban on level-ups, +2 Rerolls and +1 Ban on relics', () => {
    expect(LEVEL_UP_CHARGES.map((c) => [c.name, c.resource, c.amount])).toEqual([
      ['+1 Reroll', 'rerolls', 1],
      ['+1 Ban', 'bans', 1],
    ]);
    expect(RELIC_CHARGES.map((c) => [c.name, c.resource, c.amount])).toEqual([
      ['+2 Rerolls', 'rerolls', 2],
      ['+1 Ban', 'bans', 1],
    ]);
  });

  it('draw at 0.4x a buff in the relic pool', () => {
    for (const charge of RELIC_CHARGES) expect(charge.weight).toBe(0.4);
  });

  it('have distinct ids that name no passive, relic or upgrade', () => {
    const ids = [...LEVEL_UP_CHARGES, ...RELIC_CHARGES].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^charge_/);
      expect(chargeById(id)?.id).toBe(id);
    }
    expect(chargeById('passive_magnet')).toBeUndefined();
  });
});
