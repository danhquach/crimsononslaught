import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import { ANIMATIONS } from './animations';
import {
  AREA_CARDS,
  AREA_LOOKS,
  AREA_SPELL_IDS,
  AREA_TEXTURE,
  BASE_AREA_STATS,
  BASE_ICE_STORM_STATS,
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
  // #219: the §9.3 numbers, but for the radius, cut from 180 to 80.
  it('carries the spec §9.3 numbers for Ice Storm', () => {
    expect(BASE_ICE_STORM_STATS).toEqual({
      cooldown: 12,
      tickDamage: 6,
      tickRate: 0.5,
      radius: 80,
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
    expect(BASE_QUAKE_STATS.tickDamage).toBeGreaterThan(BASE_ICE_STORM_STATS.tickDamage);
    expect(BASE_QUAKE_STATS.slowPct).toBeLessThan(BASE_ICE_STORM_STATS.slowPct);
    // Earth pays for its longer patch with a longer wait for it.
    expect(BASE_QUAKE_STATS.duration).toBeGreaterThan(BASE_ICE_STORM_STATS.duration);
    expect(BASE_QUAKE_STATS.cooldown).toBeGreaterThan(BASE_ICE_STORM_STATS.cooldown);
  });

  it('gives both a lifetime worth a whole number of ticks', () => {
    for (const id of AREA_SPELL_IDS) {
      const { duration, tickRate } = BASE_AREA_STATS[id];
      expect(tickRate, id).toBeGreaterThan(0);
      expect(duration / tickRate, id).toBe(Math.round(duration / tickRate));
    }
  });

  it('gives every patch a radius and a reach', () => {
    // No radius-under-range rule: a patch dropped at the edge of its reach
    // (180, 162) may or may not cover the hero, and areas hurt only enemies,
    // so that costs nothing.
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

  it('draws Tornado with its art and Earthquake with the ring until its art lands', () => {
    expect(TORNADO_LOOK.clip).toBe('lightning.tornado');
    expect(AREA_LOOKS.earth_quake).toEqual({});
  });
});

describe('Ice Storm look (#219)', () => {
  const storm = AREA_LOOKS.ice_blizzard.storm;
  const names = new Set(ANIMATIONS.map((anim) => anim.name));

  it('names the card Ice Storm, a slow with no freeze in its words', () => {
    expect(AREA_CARDS.ice_blizzard.name).toBe('Ice Storm');
    expect(AREA_CARDS.ice_blizzard.description.toLowerCase()).not.toMatch(/freez/);
    expect(AREA_CARDS.ice_blizzard.stats).toContainEqual(['Radius', '80']);
  });

  it('is drawn as a storm of sleet and shards from atlas clips, not the ring or one clip', () => {
    expect(storm).toBeDefined();
    expect(AREA_LOOKS.ice_blizzard.clip).toBeUndefined();
    expect(names.has(storm?.sleet.clip ?? '')).toBe(true);
    expect(names.has(storm?.shards.clip ?? '')).toBe(true);
  });

  it('falls like rain: steeply down the screen, slanted a little right by the wind', () => {
    const v = storm?.sleet.velocity ?? { x: 0, y: 0 };
    expect(v.y).toBeGreaterThan(0);
    expect(v.x).toBeGreaterThan(0);
    // Within 20° of straight down.
    expect(Math.atan2(v.x, v.y)).toBeLessThan((20 * Math.PI) / 180);
  });

  it('fades the sleet out before the rim, so the storm has no drawn edge', () => {
    expect(storm?.sleet.rimFade).toBeGreaterThan(0);
    expect(storm?.sleet.rimFade).toBeLessThanOrEqual(1);
  });

  it('bursts shards inside the patch a few at a time', () => {
    expect(storm?.shards.reach).toBeLessThan(1);
    expect(storm?.shards.maxLive).toBeGreaterThan(0);
    expect(storm?.shards.maxLive).toBeLessThanOrEqual(3);
  });

  it('fades the whole storm in over 0.4 s and out over its last 0.6 s', () => {
    expect(storm?.fade).toEqual({ fadeInS: 0.4, fadeOutS: 0.6 });
  });
});
