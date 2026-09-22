import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import {
  AREA_CARDS,
  AREA_SPELL_IDS,
  AREA_TEXTURE,
  BASE_AREA_STATS,
  BASE_BLIZZARD_STATS,
  BASE_QUAKE_STATS,
  isAreaSpellId,
} from './areas';
import { PLACEHOLDERS } from './colors';
import { elementOf, isRosterSpellId, SPELLS_BY_ELEMENT } from './loadout';

/** #135: the area rows are the spec's §9.3 and §9.5 tables, and both are castable. */

describe('area ids', () => {
  it('names one area spell on Ice and one on Earth', () => {
    for (const id of AREA_SPELL_IDS) {
      expect(isRosterSpellId(id), id).toBe(true);
      expect(SPELLS_BY_ELEMENT[elementOf(id) ?? 'fire'], id).toContain(id);
    }
    expect(AREA_SPELL_IDS.map((id) => elementOf(id))).toEqual(['ice', 'earth']);
  });

  it('recognizes its own ids and nothing else', () => {
    expect(AREA_SPELL_IDS.every(isAreaSpellId)).toBe(true);
    for (const other of ['ice', 'earth', 'ice_shield', 'lightning_tornado', '', 7, null]) {
      expect(isAreaSpellId(other), `${String(other)}`).toBe(false);
    }
  });
});

describe('area stat blocks', () => {
  it('carries the spec §9.3 numbers for Blizzard', () => {
    expect(BASE_BLIZZARD_STATS).toEqual({
      cooldown: 12,
      tickDamage: 6,
      tickRate: 0.5,
      radius: 180,
      duration: 6,
      targetRange: 400,
      slowPct: 0.5,
      slowDuration: 1,
    });
  });

  it('carries the spec §9.5 numbers for Earthquake', () => {
    // `duration` and the slow are this file's tuning values; the rest is §9.5.
    expect(BASE_QUAKE_STATS).toMatchObject({
      cooldown: 14,
      tickDamage: 8,
      tickRate: 0.5,
      radius: 180,
      targetRange: 360,
    });
  });

  it('gives Earth the damage and Ice the crowd control', () => {
    expect(BASE_QUAKE_STATS.tickDamage).toBeGreaterThan(BASE_BLIZZARD_STATS.tickDamage);
    expect(BASE_QUAKE_STATS.slowPct).toBeLessThan(BASE_BLIZZARD_STATS.slowPct);
    // Earth pays for its longer patch with a longer wait for it.
    expect(BASE_QUAKE_STATS.duration).toBeGreaterThan(BASE_BLIZZARD_STATS.duration);
    expect(BASE_QUAKE_STATS.cooldown).toBeGreaterThan(BASE_BLIZZARD_STATS.cooldown);
  });

  it('gives both a lifetime worth a whole number of ticks', () => {
    for (const id of AREA_SPELL_IDS) {
      const { duration, tickRate } = BASE_AREA_STATS[id];
      expect(tickRate, id).toBeGreaterThan(0);
      expect(duration / tickRate, id).toBe(Math.round(duration / tickRate));
    }
  });

  it('keeps every patch inside the reach it may be placed at', () => {
    // A patch centred at the far edge of `targetRange` must still be something
    // the player can see coming; a radius past the range would place ticks
    // behind them.
    for (const id of AREA_SPELL_IDS) {
      const { radius, targetRange } = BASE_AREA_STATS[id];
      expect(radius, id).toBeGreaterThan(0);
      expect(radius, id).toBeLessThan(targetRange);
    }
  });

  it('routes every field through the category map, so passives reach them', () => {
    expect(validateSpellFields(BASE_AREA_STATS)).toEqual([]);
  });
});

describe('area presentation', () => {
  it('gives every area a one-line card', () => {
    for (const id of AREA_SPELL_IDS) {
      expect(AREA_CARDS[id].name, id).not.toBe('');
      expect(AREA_CARDS[id].description, id).not.toContain('\n');
      expect(AREA_CARDS[id].stats.length, id).toBeGreaterThan(0);
    }
  });

  it('draws both patches with a texture the game generates', () => {
    expect(PLACEHOLDERS[AREA_TEXTURE]).toBeDefined();
  });
});
