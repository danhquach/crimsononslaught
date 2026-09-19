import { describe, expect, it } from 'vitest';
import { validateSpellFields } from '../core/playerProfile';
import { rechargePerSecond } from '../core/shield';
import { elementOf, isRosterSpellId, SPELLS_BY_ELEMENT } from './loadout';
import {
  BASE_EARTH_SHIELD_STATS,
  BASE_ICE_SHIELD_STATS,
  BASE_SHIELD_STATS,
  SHIELD_CARDS,
  SHIELD_SPELL_IDS,
  isShieldSpellId,
} from './shields';
import { BOULDER_HIT_COOLDOWN } from './spells';

/** #134: the shield rows are the spec's §9.3 and §9.5 tables, and both are castable. */

describe('shield ids', () => {
  it('names one shield on Ice and one on Earth', () => {
    for (const id of SHIELD_SPELL_IDS) {
      expect(isRosterSpellId(id), id).toBe(true);
      expect(SPELLS_BY_ELEMENT[elementOf(id) ?? 'fire'], id).toContain(id);
    }
    expect(SHIELD_SPELL_IDS.map((id) => elementOf(id))).toEqual(['ice', 'earth']);
  });

  it('recognizes its own ids and nothing else', () => {
    expect(SHIELD_SPELL_IDS.every(isShieldSpellId)).toBe(true);
    for (const other of ['ice', 'earth', 'ice_companion', 'shield_ice', '', 7, null]) {
      expect(isShieldSpellId(other), `${String(other)}`).toBe(false);
    }
  });
});

describe('shield stat blocks', () => {
  it('gives both shields a pool and a delay the mechanic can use', () => {
    for (const id of SHIELD_SPELL_IDS) {
      const { shieldHp, rechargeDelay } = BASE_SHIELD_STATS[id];
      expect(shieldHp, id).toBeGreaterThan(0);
      expect(rechargeDelay, id).toBeGreaterThan(0);
      expect(rechargePerSecond({ max: shieldHp, rechargeDelayS: rechargeDelay }), id).toBe(10);
    }
  });

  it('carries the spec §9.3 numbers for Ice Shield', () => {
    expect(BASE_ICE_SHIELD_STATS).toEqual({
      shieldHp: 60,
      rechargeDelay: 6,
      breakDamage: 40,
      breakRadius: 120,
      slowPct: 0.4,
      slowDuration: 2,
    });
  });

  it('carries the spec §9.5 numbers for Earth Shield', () => {
    expect(BASE_EARTH_SHIELD_STATS).toEqual({
      count: 3,
      orbitRadius: 80,
      orbitSpeed: 2.5,
      size: 14,
      damage: 10,
      knockback: 60,
      hitCooldown: 0.4,
      shieldHp: 80,
      rechargeDelay: 8,
    });
  });

  it('hits on the window the game actually applies', () => {
    // The ring claims an enemy's window through `Enemy.tryBoulderHit`, which
    // runs on the global `BOULDER_HIT_COOLDOWN`; a per-spell one is #147's.
    // Until then a block promising a different window would be a lie.
    expect(BASE_EARTH_SHIELD_STATS.hitCooldown).toBe(BOULDER_HIT_COOLDOWN);
  });

  it('routes every field through the category map, so passives reach them', () => {
    expect(validateSpellFields(BASE_SHIELD_STATS)).toEqual([]);
  });
});

describe('shield presentation', () => {
  it('gives every shield a one-line card', () => {
    for (const id of SHIELD_SPELL_IDS) {
      expect(SHIELD_CARDS[id].name, id).not.toBe('');
      expect(SHIELD_CARDS[id].description, id).not.toContain('\n');
      expect(SHIELD_CARDS[id].stats.length, id).toBeGreaterThan(0);
    }
  });
});
