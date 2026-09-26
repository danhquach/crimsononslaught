import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import { PLACEHOLDERS } from './colors';
import { ART_BOXES } from './frames';
import { elementOf, isRosterSpellId, SPELLS_BY_ELEMENT } from './loadout';
import {
  BASE_FIRE_DRAGON_STATS,
  BASE_FIRE_ROSTER_STATS,
  BASE_FIRE_WAVE_STATS,
  DRAGON_DRAW_SCALE,
  FIRE_ROSTER_CARDS,
  FIRE_ROSTER_SPELL_IDS,
  isFireRosterSpellId,
} from './fireRoster';

/** #140: the fire roster rows are the spec's §9.2 table, and they are castable. */

describe('fire roster ids', () => {
  it('names Fire Wave and Fire Dragon, both on Fire', () => {
    for (const id of FIRE_ROSTER_SPELL_IDS) {
      expect(isRosterSpellId(id), id).toBe(true);
      expect(SPELLS_BY_ELEMENT[elementOf(id) ?? 'ice'], id).toContain(id);
    }
    expect(FIRE_ROSTER_SPELL_IDS.map((id) => elementOf(id))).toEqual(['fire', 'fire']);
  });

  it('recognizes its own ids and nothing else', () => {
    expect(FIRE_ROSTER_SPELL_IDS.every(isFireRosterSpellId)).toBe(true);
    for (const other of ['fire', 'fire_meteor', 'fire_companion', '', 7, null]) {
      expect(isFireRosterSpellId(other), `${String(other)}`).toBe(false);
    }
  });
});

describe('fire roster stat blocks', () => {
  it('carries the CO-143 numbers for Fire Wave, under the old id', () => {
    expect(BASE_FIRE_WAVE_STATS).toEqual({
      cooldown: 2.2,
      damage: 18,
      arc: 95,
      speed: 260,
      range: 180,
      knockback: 8,
      burn: 8,
      burnDuration: 3,
    });
    expect(BASE_FIRE_ROSTER_STATS.fire_column).toBe(BASE_FIRE_WAVE_STATS);
  });

  it('reaches its range in about 0.7 s and shoves far less than Earth Spike', () => {
    expect(BASE_FIRE_WAVE_STATS.range / BASE_FIRE_WAVE_STATS.speed).toBeCloseTo(0.7, 1);
    expect(BASE_FIRE_WAVE_STATS.knockback).toBeLessThan(25 / 2);
  });

  it('names Fire Wave on its card', () => {
    expect(FIRE_ROSTER_CARDS.fire_column.name).toBe('Fire Wave');
    expect(FIRE_ROSTER_CARDS.fire_column.description).toMatch(/arc of flame/);
  });

  it('carries the spec §9.2 numbers for Fire Dragon', () => {
    expect(BASE_FIRE_DRAGON_STATS).toEqual({
      cooldown: 2.5,
      damage: 45,
      aoeRadius: 30,
      aoeDamageFactor: 0.4,
      projectiles: 1,
      speed: 260,
      targetRange: 189,
      homingTurnRate: 4,
      duration: 3,
    });
    expect(BASE_FIRE_ROSTER_STATS.fire_dragon).toBe(BASE_FIRE_DRAGON_STATS);
  });

  it('keeps Fire Dragon splash inside the range it may be aimed at', () => {
    expect(BASE_FIRE_DRAGON_STATS.aoeRadius).toBeLessThan(BASE_FIRE_DRAGON_STATS.targetRange);
  });

  it('routes every field through the category map, so passives reach them', () => {
    expect(validateSpellFields(BASE_FIRE_ROSTER_STATS)).toEqual([]);
  });
});

describe('fire roster presentation', () => {
  it('gives every spell a one-line card', () => {
    for (const id of FIRE_ROSTER_SPELL_IDS) {
      expect(FIRE_ROSTER_CARDS[id].name, id).not.toBe('');
      expect(FIRE_ROSTER_CARDS[id].description, id).not.toContain('\n');
      expect(FIRE_ROSTER_CARDS[id].stats.length, id).toBeGreaterThan(0);
    }
  });

  it('gives every card a distinct color', () => {
    const colors = FIRE_ROSTER_SPELL_IDS.map((id) => FIRE_ROSTER_CARDS[id].color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('fire dragon draw scale (CO-162)', () => {
  it('draws the dragon well over a Fire Bolt and well under the boss', () => {
    const width = ART_BOXES['fire.dragon'].w * DRAGON_DRAW_SCALE;
    expect(width).toBeGreaterThanOrEqual(50);
    expect(width).toBeLessThanOrEqual(64);
    expect(width).toBeGreaterThanOrEqual(2 * ART_BOXES['fire.fly'].w);
  });

  it('keeps the 6 px hit radius exact through the scale', () => {
    // The clip's circle is set at `radius / scale` source px, and Arcade floors
    // the scaled width's half: both must land on whole pixels with no drift.
    const radius = PLACEHOLDERS.proj_fire.width / 2;
    const sourceRadius = radius / DRAGON_DRAW_SCALE;
    expect(Number.isInteger(sourceRadius), `source radius ${sourceRadius}`).toBe(true);
    expect(sourceRadius * 2 * DRAGON_DRAW_SCALE).toBe(radius * 2);
  });
});
