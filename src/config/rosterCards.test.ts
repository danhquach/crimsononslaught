import { describe, expect, it } from 'vitest';
import { ROSTER_SPELL_IDS } from './loadout';
import { ROSTER_SPELL_CARDS } from './rosterCards';

describe('ROSTER_SPELL_CARDS', () => {
  it('has a named, described card for every roster spell', () => {
    for (const id of ROSTER_SPELL_IDS) {
      const card = ROSTER_SPELL_CARDS[id];
      expect(card.name.length, id).toBeGreaterThan(0);
      expect(card.description.length, id).toBeGreaterThan(0);
    }
  });
});
