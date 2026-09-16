import { describe, expect, it } from 'vitest';
import { SPELL_CARDS, SPELL_IDS, isSpellId, spellIdForKey } from './spells';

describe('spell ids', () => {
  it('lists the four spells from the spec in card order', () => {
    expect(SPELL_IDS).toEqual(['fire', 'ice', 'lightning', 'earth']);
  });

  it('isSpellId accepts only known ids', () => {
    for (const id of SPELL_IDS) expect(isSpellId(id)).toBe(true);
    for (const bad of ['Fire', 'water', '', 1, null, undefined, {}]) {
      expect(isSpellId(bad), String(bad)).toBe(false);
    }
  });
});

describe('spell cards', () => {
  it('defines a card for every spell id and nothing else', () => {
    expect(Object.keys(SPELL_CARDS).sort()).toEqual([...SPELL_IDS].sort());
  });

  it('gives every card a name, one-line description, distinct color and 2–5 stats', () => {
    const colors = SPELL_IDS.map((id) => SPELL_CARDS[id].color);
    expect(new Set(colors).size).toBe(colors.length);

    for (const id of SPELL_IDS) {
      const card = SPELL_CARDS[id];
      expect(card.name.trim().length, id).toBeGreaterThan(0);
      expect(card.description.trim().length, id).toBeGreaterThan(0);
      expect(card.description, id).not.toContain('\n');
      expect(card.color, id).toBeGreaterThanOrEqual(0);
      expect(card.color, id).toBeLessThanOrEqual(0xffffff);
      expect(card.stats.length, id).toBeGreaterThanOrEqual(2);
      expect(card.stats.length, id).toBeLessThanOrEqual(5);
      for (const [label, value] of card.stats) {
        expect(label.trim().length, `${id} stat label`).toBeGreaterThan(0);
        expect(value.trim().length, `${id} stat ${label}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('spell card stats match spec §5 base values', () => {
  it('fire', () => {
    expect(SPELL_CARDS.fire.stats).toEqual([
      ['Cooldown', '1.2 s'],
      ['Damage', '12'],
      ['Blast radius', '40'],
      ['Projectiles', '1'],
    ]);
  });
  it('ice', () => {
    expect(SPELL_CARDS.ice.stats).toEqual([
      ['Cooldown', '2.0 s'],
      ['Damage', '8'],
      ['Radius', '90'],
      ['Slow', '30% for 1.5 s'],
    ]);
  });
  it('lightning', () => {
    expect(SPELL_CARDS.lightning.stats).toEqual([
      ['Cooldown', '1.0 s'],
      ['Damage', '10'],
      ['Chains', '2'],
      ['Chain range', '120'],
    ]);
  });
  it('earth', () => {
    expect(SPELL_CARDS.earth.stats).toEqual([
      ['Boulders', '2'],
      ['Damage', '10'],
      ['Orbit radius', '80'],
      ['Knockback', '60'],
    ]);
  });
});

describe('spellIdForKey', () => {
  it('maps keys 1–4 to the spells in card order', () => {
    expect(spellIdForKey('1')).toBe('fire');
    expect(spellIdForKey('2')).toBe('ice');
    expect(spellIdForKey('3')).toBe('lightning');
    expect(spellIdForKey('4')).toBe('earth');
  });

  it('ignores every other key', () => {
    for (const key of ['0', '5', '9', 'a', 'Enter', ' ', '', '11', '-1']) {
      expect(spellIdForKey(key), JSON.stringify(key)).toBeUndefined();
    }
  });
});
