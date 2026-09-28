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
  it('carries the CO-182 rework numbers for Frost Nova Bomb', () => {
    expect(BASE_NOVA_BOMB_STATS).toEqual({
      cooldown: 3.5,
      damage: 24,
      radius: 110,
      speed: 80,
      range: 240,
      slowPct: 0.4,
      slowDuration: 2,
      freezeChance: 0.15,
      freezeDuration: 1,
      throwInterval: 0.25,
      icicles: 2,
      icicleDamage: 14,
      icicleSpeed: 320,
      icicleRange: 110,
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

  it('says what the reworked bomb does, with its own numbers (CO-182)', () => {
    const card = ICE_ROSTER_CARDS.ice_nova_bomb;
    expect(card.description).toBe(
      'Rolls a spinning ice bomb through the crowd. It sprays icicles, then bursts into a freezing ring.',
    );
    expect(card.stats).toEqual([
      ['Cooldown', '3.5 s'],
      ['Icicles', '14 each'],
      ['Burst', '24 in 110'],
      ['Slow', '40% for 2 s'],
      ['Freeze', '15% for 1 s'],
    ]);
  });
});
