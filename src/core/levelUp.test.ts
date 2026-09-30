import { describe, expect, it } from 'vitest';
import { EMPTY_OFFER_MAX_HP_BONUS } from '../config/progression';
import {
  LEVEL_UP_EVENT,
  MAX_OFFER_SIZE,
  SPELL_LEVEL_CARD_PREFIX,
  cardSpellId,
  isOfferCard,
  offerIndexForKey,
  resolveLevelUp,
  spellIdOfLevelCard,
  spellLevelCardId,
  type OfferCard,
} from './levelUp';

const passive = (id: string, rank = 1, maxRank = 3): OfferCard => ({
  kind: 'passive',
  id,
  name: `Passive ${id}`,
  description: 'Does a thing.',
  rank,
  maxRank,
});

/** A passive that never caps: ranked, but with no `maxRank` at all. */
const uncapped = (id: string, rank: number): OfferCard => ({
  kind: 'passive',
  id,
  name: `Passive ${id}`,
  description: 'Does a thing.',
  rank,
});

const active = (id: string): OfferCard => ({
  kind: 'active',
  id,
  name: `Spell ${id}`,
  description: 'Casts a thing.',
});

describe('resolveLevelUp', () => {
  it('opens the overlay with exactly the offered cards for 1, 2 and 3 cards', () => {
    for (const n of [1, 2, 3]) {
      const offer = Array.from({ length: n }, (_, i) => passive(`p${i}`));
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
    const offer = Array.from({ length: 5 }, (_, i) => passive(`p${i}`));
    const result = resolveLevelUp(offer);
    expect(result.kind).toBe('overlay');
    if (result.kind === 'overlay') expect(result.cards).toEqual(offer.slice(0, MAX_OFFER_SIZE));
    expect(MAX_OFFER_SIZE).toBe(3);
  });
});

describe('offerIndexForKey', () => {
  it("maps '1'..'n' to card slots 0..n-1", () => {
    expect(offerIndexForKey('1', 3)).toBe(0);
    expect(offerIndexForKey('2', 3)).toBe(1);
    expect(offerIndexForKey('3', 3)).toBe(2);
  });

  it('ignores keys beyond the number of cards on screen', () => {
    expect(offerIndexForKey('3', 2)).toBeUndefined();
    expect(offerIndexForKey('2', 1)).toBeUndefined();
    expect(offerIndexForKey('4', 3)).toBeUndefined();
  });

  it('ignores non-digit and out-of-range keys', () => {
    for (const key of ['0', 'a', 'Enter', '', '11', '-1', 'Numpad1']) {
      expect(offerIndexForKey(key, 3), key).toBeUndefined();
    }
  });
});

describe('isOfferCard', () => {
  const valid = passive('passive_power', 2, 3);

  it('accepts a passive, including at maxRank, and one that never caps', () => {
    expect(isOfferCard(valid)).toBe(true);
    expect(isOfferCard({ ...valid, rank: 3, maxRank: 3 })).toBe(true);
    expect(isOfferCard({ ...valid, rank: 1, maxRank: 1 })).toBe(true);
    expect(isOfferCard(uncapped('passive_haste', 7))).toBe(true);
  });

  it('accepts a relic, which always ranks and never caps (#227)', () => {
    const relic: OfferCard = { ...uncapped('relic_hourglass', 2), kind: 'relic' };
    expect(isOfferCard(relic)).toBe(true);
    expect(isOfferCard({ ...relic, rank: undefined })).toBe(false);
    expect(isOfferCard({ ...relic, maxRank: 5 })).toBe(false);
  });

  it('accepts a charge, which carries no rank and no colour (#228)', () => {
    const charge: OfferCard = {
      kind: 'charge',
      id: 'charge_levelup_ban',
      name: '+1 Ban',
      description: 'One more ban.',
    };
    expect(isOfferCard(charge)).toBe(true);
    expect(isOfferCard({ ...charge, rank: 1 })).toBe(false);
    expect(isOfferCard({ ...charge, color: 0xffffff })).toBe(false);
  });

  it('accepts an active, which carries no rank at all', () => {
    expect(isOfferCard(active('fire_meteor'))).toBe(true);
    expect(isOfferCard({ ...active('fire_meteor'), rank: 1 })).toBe(false);
    expect(isOfferCard({ ...active('fire_meteor'), maxRank: 3 })).toBe(false);
  });

  it('accepts a colour on an active only, as a 24-bit integer (CO-155)', () => {
    expect(isOfferCard({ ...active('fire_meteor'), color: 0xff4500 })).toBe(true);
    expect(isOfferCard({ ...active('fire_meteor'), color: 0 })).toBe(true);
    expect(isOfferCard({ ...active('fire_meteor'), color: 0xffffff })).toBe(true);
    expect(isOfferCard({ ...active('fire_meteor'), color: 0x1000000 })).toBe(false);
    expect(isOfferCard({ ...active('fire_meteor'), color: -1 })).toBe(false);
    expect(isOfferCard({ ...active('fire_meteor'), color: 1.5 })).toBe(false);
    expect(isOfferCard({ ...active('fire_meteor'), color: '#ff4500' })).toBe(false);
    expect(isOfferCard({ ...passive('passive_power'), color: 0xff4500 })).toBe(false);
    expect(isOfferCard({ ...uncapped('passive_haste', 2), color: 0xff4500 })).toBe(false);
  });

  it('rejects each missing field', () => {
    for (const key of Object.keys(valid)) {
      const partial: Record<string, unknown> = { ...valid };
      delete partial[key];
      // `maxRank` is the one field a passive may legitimately do without.
      expect(isOfferCard(partial), `missing ${key}`).toBe(key === 'maxRank');
    }
  });

  it('rejects impossible ranks, unknown kinds and non-object input', () => {
    expect(isOfferCard({ ...valid, rank: 0 })).toBe(false);
    expect(isOfferCard({ ...valid, rank: 4, maxRank: 3 })).toBe(false);
    expect(isOfferCard({ ...valid, rank: 1.5 })).toBe(false);
    expect(isOfferCard({ ...valid, maxRank: 0 })).toBe(false);
    expect(isOfferCard({ ...valid, id: '' })).toBe(false);
    expect(isOfferCard({ ...valid, name: '' })).toBe(false);
    expect(isOfferCard({ ...valid, description: '' })).toBe(false);
    expect(isOfferCard({ ...valid, kind: 'perk' })).toBe(false);
    expect(isOfferCard(null)).toBe(false);
    expect(isOfferCard('passive_power')).toBe(false);
  });
});

describe('upgrade cards (#326)', () => {
  const upgrade = (id = 'spell_level_fire', rank = 2, maxRank = 3): OfferCard => ({
    kind: 'upgrade',
    id,
    name: 'Fire Bolt',
    description: 'Adds a bolt.',
    rank,
    maxRank,
  });

  it('names the card after the spell, the same for every level', () => {
    expect(spellLevelCardId('fire_meteor')).toBe('spell_level_fire_meteor');
    expect(spellIdOfLevelCard('spell_level_fire_meteor')).toBe('fire_meteor');
    expect(spellIdOfLevelCard(spellLevelCardId('ice'))).toBe('ice');
  });

  it('parses only a prefix followed by a roster id', () => {
    for (const id of [
      'spell_level_',
      'spell_level_water',
      'spell_level___proto__',
      'spell_level_constructor',
      'spell_level_fire ',
      'spell_level_Fire',
      'fire',
      'passive_power',
      `${SPELL_LEVEL_CARD_PREFIX}${SPELL_LEVEL_CARD_PREFIX}fire`,
    ]) {
      expect(spellIdOfLevelCard(id), id).toBeUndefined();
    }
  });

  it('reads the spell of an active or upgrade card, and of nothing else', () => {
    expect(cardSpellId(active('fire_meteor'))).toBe('fire_meteor');
    expect(cardSpellId(upgrade('spell_level_ice'))).toBe('ice');
    expect(cardSpellId(upgrade('spell_level_water'))).toBeUndefined();
    expect(cardSpellId(passive('passive_power'))).toBeUndefined();
    expect(cardSpellId({ kind: 'active', id: 'not_a_spell' })).toBeUndefined();
  });

  it('accepts level 2 and level 3 upgrades, with or without a colour', () => {
    expect(isOfferCard(upgrade())).toBe(true);
    expect(isOfferCard(upgrade('spell_level_fire', 3, 3))).toBe(true);
    expect(isOfferCard({ ...upgrade(), color: 0xff4500 })).toBe(true);
  });

  it('rejects an unknown or hostile spell id', () => {
    expect(isOfferCard(upgrade('spell_level_water'))).toBe(false);
    expect(isOfferCard(upgrade('spell_level___proto__'))).toBe(false);
    expect(isOfferCard(upgrade('spell_fire'))).toBe(false);
  });

  it('rejects a rank outside 2 to 3, or a missing or wrong cap', () => {
    for (const rank of [1, 0, 4, 2.5, -1, NaN, 99999999999]) {
      expect(isOfferCard(upgrade('spell_level_fire', rank)), String(rank)).toBe(false);
    }
    expect(isOfferCard(upgrade('spell_level_fire', 2, 99))).toBe(false);
    expect(isOfferCard(upgrade('spell_level_fire', 2, 2))).toBe(false);
    expect(isOfferCard({ ...upgrade(), maxRank: undefined })).toBe(false);
    expect(isOfferCard({ ...upgrade(), rank: undefined })).toBe(false);
  });

  it('rejects a bad colour', () => {
    for (const color of [-1, 0x1000000, 1.5, '#ff4500', null]) {
      expect(isOfferCard({ ...upgrade(), color }), String(color)).toBe(false);
    }
  });
});

describe('LEVEL_UP_EVENT', () => {
  it('is namespaced away from Phaser scene events and run events', () => {
    for (const name of Object.values(LEVEL_UP_EVENT)) expect(name).toMatch(/^levelup:/);
    expect(new Set(Object.values(LEVEL_UP_EVENT)).size).toBe(4);
  });
});
