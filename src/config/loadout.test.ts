import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPELL_BY_ELEMENT,
  ELEMENTS,
  ROSTER_SPELL_IDS,
  SLOT_UNLOCK_LEVELS,
  SPELLS_BY_ELEMENT,
  elementOf,
  isElementId,
  isRosterSpellId,
} from './loadout';
import { SPELL_IDS } from './spells';

describe('loadout config', () => {
  it('holds the four elements and five spells each (spec §9.2-§9.5)', () => {
    expect(ELEMENTS).toEqual(['fire', 'ice', 'lightning', 'earth']);
    expect(SPELLS_BY_ELEMENT).toEqual({
      fire: ['fire', 'fire_meteor', 'fire_column', 'fire_companion', 'fire_dragon'],
      ice: ['ice', 'ice_nova_bomb', 'ice_shield', 'ice_companion', 'ice_blizzard'],
      lightning: [
        'lightning',
        'lightning_chain',
        'lightning_tornado',
        'lightning_companion',
        'lightning_sword',
      ],
      earth: ['earth', 'earth_boulder', 'earth_shield', 'earth_quake', 'earth_companion'],
    });
    expect(ROSTER_SPELL_IDS.length).toBe(20);
    expect(new Set(ROSTER_SPELL_IDS).size).toBe(20);
  });

  it('keeps the Phase 1 ids as the four defaults (spec §9.1)', () => {
    expect(DEFAULT_SPELL_BY_ELEMENT).toEqual({
      fire: 'fire',
      ice: 'ice',
      lightning: 'lightning',
      earth: 'earth',
    });
    // The Phase 1 select screen's ids all survive into the Phase 2 roster, so
    // payloads and e2e selectors do not churn.
    for (const spellId of SPELL_IDS) expect(isRosterSpellId(spellId), spellId).toBe(true);
  });

  it('leads every element roster with that element default', () => {
    for (const element of ELEMENTS) {
      expect(SPELLS_BY_ELEMENT[element][0], element).toBe(DEFAULT_SPELL_BY_ELEMENT[element]);
    }
  });

  it('unlocks the two extra active slots at levels 2 and 5 (spec §3.1)', () => {
    expect(SLOT_UNLOCK_LEVELS).toEqual([2, 5]);
  });

  it('maps a spell back to its element, and rejects anything else', () => {
    expect(elementOf('ice_blizzard')).toBe('ice');
    expect(elementOf('earth')).toBe('earth');
    expect(elementOf('fire_nope')).toBeUndefined();
    expect(isRosterSpellId('fire_nope')).toBe(false);
    expect(isRosterSpellId(7)).toBe(false);
    expect(isElementId('fire')).toBe(true);
    expect(isElementId('fire_meteor')).toBe(false);
  });
});
