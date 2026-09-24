import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import { elementOf, isRosterSpellId, SPELLS_BY_ELEMENT } from './loadout';
import {
  BASE_ICE_ROSTER_STATS,
  BASE_NOVA_BOMB_STATS,
  ICE_ROSTER_CARDS,
  ICE_ROSTER_SPELL_IDS,
  isIceRosterSpellId,
} from './iceRoster';

/** #141: the ice roster row is the spec's §9.3 table, and it is castable. */

describe('ice roster ids', () => {
  it('names Frost Nova Bomb, on Ice', () => {
    for (const id of ICE_ROSTER_SPELL_IDS) {
      expect(isRosterSpellId(id), id).toBe(true);
      expect(SPELLS_BY_ELEMENT[elementOf(id) ?? 'fire'], id).toContain(id);
    }
    expect(ICE_ROSTER_SPELL_IDS.map((id) => elementOf(id))).toEqual(['ice']);
  });

  it('recognizes its own ids and nothing else', () => {
    expect(ICE_ROSTER_SPELL_IDS.every(isIceRosterSpellId)).toBe(true);
    for (const other of ['ice', 'ice_shield', 'ice_companion', 'ice_blizzard', '', 7, null]) {
      expect(isIceRosterSpellId(other), `${String(other)}`).toBe(false);
    }
  });
});

describe('ice roster stat blocks', () => {
  it('carries the spec §9.3 numbers for Frost Nova Bomb', () => {
    expect(BASE_NOVA_BOMB_STATS).toEqual({
      cooldown: 2.2,
      damage: 24,
      radius: 110,
      speed: 220,
      range: 135,
      slowPct: 0.4,
      slowDuration: 2,
      freezeChance: 0.15,
      freezeDuration: 1,
    });
    expect(BASE_ICE_ROSTER_STATS.ice_nova_bomb).toBe(BASE_NOVA_BOMB_STATS);
  });

  it('keeps the pulse inside the range the bomb may be thrown', () => {
    expect(BASE_NOVA_BOMB_STATS.radius).toBeLessThan(BASE_NOVA_BOMB_STATS.range);
  });

  it('routes every field through the category map, so passives reach them', () => {
    expect(validateSpellFields(BASE_ICE_ROSTER_STATS)).toEqual([]);
  });
});

describe('ice roster presentation', () => {
  it('gives every spell a one-line card', () => {
    for (const id of ICE_ROSTER_SPELL_IDS) {
      expect(ICE_ROSTER_CARDS[id].name, id).not.toBe('');
      expect(ICE_ROSTER_CARDS[id].description, id).not.toContain('\n');
      expect(ICE_ROSTER_CARDS[id].stats.length, id).toBeGreaterThan(0);
    }
  });
});
