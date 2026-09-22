import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import { PLACEHOLDERS } from './colors';
import {
  BASE_BOULDER_STATS,
  BASE_EARTH_ROSTER_STATS,
  EARTH_ROSTER_CARDS,
  EARTH_ROSTER_SPELL_IDS,
  ROLLING_BOULDER_CLIP,
  ROLLING_BOULDER_TEXTURE,
  isEarthRosterSpellId,
} from './earthRoster';
import { ANIMATIONS } from './animations';
import { elementOf, isRosterSpellId, SPELLS_BY_ELEMENT } from './loadout';
import { BASE_SPELL_STATS } from './spells';

/** #143: the earth roster row is the spec's §9.5 table, and it is castable. */

describe('earth roster ids', () => {
  it('names Boulder, on Earth', () => {
    for (const id of EARTH_ROSTER_SPELL_IDS) {
      expect(isRosterSpellId(id), id).toBe(true);
      expect(SPELLS_BY_ELEMENT[elementOf(id) ?? 'fire'], id).toContain(id);
    }
    expect(EARTH_ROSTER_SPELL_IDS.map((id) => elementOf(id))).toEqual(['earth']);
  });

  it('recognizes its own ids and nothing else', () => {
    expect(EARTH_ROSTER_SPELL_IDS.every(isEarthRosterSpellId)).toBe(true);
    for (const other of ['earth', 'earth_shield', 'earth_quake', 'earth_companion', '', 7, null]) {
      expect(isEarthRosterSpellId(other), `${String(other)}`).toBe(false);
    }
  });
});

describe('earth roster stat blocks', () => {
  it('carries the spec §9.5 numbers for Boulder', () => {
    expect(BASE_BOULDER_STATS).toEqual({
      cooldown: 2,
      damage: 40,
      radius: 36,
      speed: 280,
      range: 460,
      pierce: 3,
      knockback: 120,
    });
    expect(BASE_EARTH_ROSTER_STATS.earth_boulder).toBe(BASE_BOULDER_STATS);
  });

  it('hits harder and shoves further than the spike, for a longer wait', () => {
    // Spec §9.5: Boulder is Earth's big hit, worth its longer cooldown.
    const spike = BASE_SPELL_STATS.earth;
    expect(BASE_BOULDER_STATS.damage).toBeGreaterThan(spike.damage);
    expect(BASE_BOULDER_STATS.knockback).toBeGreaterThan(spike.knockback);
    expect(BASE_BOULDER_STATS.cooldown).toBeGreaterThan(spike.cooldown);
  });

  it('routes every field through the category map, so passives reach them', () => {
    expect(validateSpellFields(BASE_EARTH_ROSTER_STATS)).toEqual([]);
  });
});

describe('earth roster presentation', () => {
  it('wears a real texture and a real clip', () => {
    expect(PLACEHOLDERS[ROLLING_BOULDER_TEXTURE]).toBeDefined();
    expect(ANIMATIONS.map((anim) => anim.name)).toContain(ROLLING_BOULDER_CLIP);
  });

  it('gives every spell a one-line card', () => {
    for (const id of EARTH_ROSTER_SPELL_IDS) {
      expect(EARTH_ROSTER_CARDS[id].name, id).not.toBe('');
      expect(EARTH_ROSTER_CARDS[id].description, id).not.toContain('\n');
      expect(EARTH_ROSTER_CARDS[id].stats.length, id).toBeGreaterThan(0);
    }
  });
});
