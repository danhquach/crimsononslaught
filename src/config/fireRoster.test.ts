import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import { elementOf, isRosterSpellId, SPELLS_BY_ELEMENT } from './loadout';
import {
  BASE_FIRE_COLUMN_STATS,
  BASE_FIRE_DRAGON_STATS,
  BASE_FIRE_ROSTER_STATS,
  FIRE_ROSTER_CARDS,
  FIRE_ROSTER_SPELL_IDS,
  isFireRosterSpellId,
} from './fireRoster';

/** #140: the fire roster rows are the spec's §9.2 table, and they are castable. */

describe('fire roster ids', () => {
  it('names Fire Column and Fire Dragon, both on Fire', () => {
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
  it('carries the spec §9.2 numbers for Fire Column', () => {
    expect(BASE_FIRE_COLUMN_STATS).toEqual({
      cooldown: 2.2,
      damage: 18,
      radius: 55,
      projectiles: 1,
      speed: 120,
      range: 500,
      hitCooldown: 0.5,
      burn: 8,
      burnDuration: 3,
    });
    expect(BASE_FIRE_ROSTER_STATS.fire_column).toBe(BASE_FIRE_COLUMN_STATS);
  });

  it('carries the spec §9.2 numbers for Fire Dragon', () => {
    expect(BASE_FIRE_DRAGON_STATS).toEqual({
      cooldown: 2.5,
      damage: 45,
      aoeRadius: 30,
      aoeDamageFactor: 0.4,
      projectiles: 1,
      speed: 260,
      targetRange: 420,
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
