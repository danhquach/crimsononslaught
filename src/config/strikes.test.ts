import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import { PLACEHOLDERS } from './colors';
import { elementOf, isRosterSpellId, SPELLS_BY_ELEMENT } from './loadout';
import {
  BASE_METEOR_STATS,
  BASE_STRIKE_STATS,
  METEOR_SCATTER_PX,
  STRIKE_CARDS,
  STRIKE_SPELL_IDS,
  TELEGRAPH_TEXTURE,
  isStrikeSpellId,
} from './strikes';

/** #138: the strike row is the spec's §9.2 table, and it is castable. */

describe('strike ids', () => {
  it('names one strike spell, on Fire', () => {
    for (const id of STRIKE_SPELL_IDS) {
      expect(isRosterSpellId(id), id).toBe(true);
      expect(SPELLS_BY_ELEMENT[elementOf(id) ?? 'ice'], id).toContain(id);
    }
    expect(STRIKE_SPELL_IDS.map((id) => elementOf(id))).toEqual(['fire']);
  });

  it('recognizes its own ids and nothing else', () => {
    expect(STRIKE_SPELL_IDS.every(isStrikeSpellId)).toBe(true);
    for (const other of ['fire', 'fire_dragon', 'ice_blizzard', '', 7, null]) {
      expect(isStrikeSpellId(other), `${String(other)}`).toBe(false);
    }
  });
});

describe('strike stat blocks', () => {
  it('carries the spec §9.2 numbers for Meteor', () => {
    expect(BASE_METEOR_STATS).toEqual({
      cooldown: 3.2,
      damage: 60,
      aoeRadius: 130,
      aoeDamageFactor: 1,
      projectiles: 1,
      targetRange: 420,
      fallDelay: 1,
    });
    expect(BASE_STRIKE_STATS.fire_meteor).toBe(BASE_METEOR_STATS);
  });

  it('lands before the next cast, so one strike is ever in the air', () => {
    expect(BASE_METEOR_STATS.fallDelay).toBeGreaterThan(0);
    expect(BASE_METEOR_STATS.fallDelay).toBeLessThan(BASE_METEOR_STATS.cooldown);
  });

  it('keeps the target inside the blast wherever the point scatters', () => {
    expect(METEOR_SCATTER_PX).toBeGreaterThan(0);
    expect(METEOR_SCATTER_PX).toBeLessThan(BASE_METEOR_STATS.aoeRadius);
  });

  it('keeps every blast inside the reach it may be aimed at', () => {
    expect(BASE_METEOR_STATS.aoeRadius).toBeGreaterThan(0);
    expect(BASE_METEOR_STATS.aoeRadius).toBeLessThan(BASE_METEOR_STATS.targetRange);
  });

  it('routes every field through the category map, so passives reach them', () => {
    expect(validateSpellFields(BASE_STRIKE_STATS)).toEqual([]);
  });
});

describe('strike presentation', () => {
  it('gives every strike a one-line card', () => {
    for (const id of STRIKE_SPELL_IDS) {
      expect(STRIKE_CARDS[id].name, id).not.toBe('');
      expect(STRIKE_CARDS[id].description, id).not.toContain('\n');
      expect(STRIKE_CARDS[id].stats.length, id).toBeGreaterThan(0);
    }
  });

  it('draws the telegraph with a texture the game generates', () => {
    expect(PLACEHOLDERS[TELEGRAPH_TEXTURE]).toBeDefined();
  });
});
