import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import { ANIMATIONS } from './animations';
import {
  AREA_CARDS,
  AREA_LOOKS,
  AREA_SPELL_IDS,
  AREA_TEXTURE,
  BASE_AREA_STATS,
  BASE_BLIZZARD_STATS,
  BASE_QUAKE_STATS,
  isAreaSpellId,
} from './areas';
import { PLACEHOLDERS } from './colors';
import { ART_BOXES } from './frames';
import { TORNADO_LOOK } from './lightningRoster';
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
      targetRange: 180,
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
      targetRange: 162,
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

  it('gives every patch a radius and a reach', () => {
    // No radius-under-range rule: since #212 the base reach (180, 162) is no
    // wider than the 180 px patch, so a patch dropped at the edge of its reach
    // still covers the hero. Areas hurt only enemies, so that costs nothing.
    for (const id of AREA_SPELL_IDS) {
      const { radius, targetRange } = BASE_AREA_STATS[id];
      expect(radius, id).toBeGreaterThan(0);
      expect(targetRange, id).toBeGreaterThan(0);
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

describe('area looks (#179)', () => {
  const looks = { ...AREA_LOOKS, lightning_tornado: TORNADO_LOOK };
  const boxes: Readonly<Record<string, (typeof ART_BOXES)[keyof typeof ART_BOXES] | undefined>> =
    ART_BOXES;

  it('gives every spell that places patches a look of its own', () => {
    expect(Object.keys(AREA_LOOKS).sort()).toEqual([...AREA_SPELL_IDS].sort());
  });

  it('names only clips the atlas plays and sizes by their art box', () => {
    for (const [id, look] of Object.entries(looks)) {
      if (!look.clip) continue;
      expect(
        ANIMATIONS.map((anim) => anim.name),
        id,
      ).toContain(look.clip);
      expect(boxes[look.clip], id).toBeDefined();
    }
  });

  it('draws Blizzard and Tornado with their art and Earthquake with the ring until its art lands', () => {
    expect(AREA_LOOKS.ice_blizzard.clip).toBe('ice.blizzard');
    expect(TORNADO_LOOK.clip).toBe('lightning.tornado');
    expect(AREA_LOOKS.earth_quake.clip).toBeUndefined();
  });
});
