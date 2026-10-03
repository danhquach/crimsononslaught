import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from './animations';
import { TEXTURE_KEYS } from './colors';
import { validateSpellFields } from '../core/playerProfile';
import { elementOf, isRosterSpellId, SPELLS_BY_ELEMENT } from './loadout';
import {
  BASE_EARTH_SHIELD_STATS,
  BASE_ICE_SHIELD_STATS,
  BASE_SHIELD_STATS,
  DIAMOND_CLIP,
  DIAMOND_TEXTURE,
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
  it('gives Ice Shield a pool and a cycle, and no regrow delay (#406)', () => {
    const { shieldHp, uptime, recharge } = BASE_ICE_SHIELD_STATS;
    expect(shieldHp).toBeGreaterThan(0);
    expect(uptime).toBe(5);
    expect(recharge).toBe(3);
    expect(BASE_ICE_SHIELD_STATS).not.toHaveProperty('rechargeDelay');
    expect(BASE_ICE_SHIELD_STATS).not.toHaveProperty('breakDamage');
    expect(BASE_ICE_SHIELD_STATS).not.toHaveProperty('breakRadius');
  });

  it('gives Earth Shield a pool and a cycle, and no regrow delay (#406)', () => {
    const { shieldHp, uptime, recharge } = BASE_EARTH_SHIELD_STATS;
    expect(shieldHp).toBeGreaterThan(0);
    expect(uptime).toBe(5);
    expect(recharge).toBe(3);
    expect(BASE_EARTH_SHIELD_STATS).not.toHaveProperty('rechargeDelay');
  });

  it('carries the spec §9.3 numbers for Ice Shield, with the #406 ring', () => {
    expect(BASE_ICE_SHIELD_STATS).toEqual({
      count: 3,
      orbitRadius: 70,
      orbitSpeed: 3,
      size: 14,
      damage: 12,
      hitCooldown: 0.4,
      slowPct: 0.4,
      slowDuration: 2,
      shieldHp: 50,
      uptime: 5,
      recharge: 3,
    });
  });

  it('carries the spec §9.5 numbers for Earth Shield, with the #406 cycle', () => {
    expect(BASE_EARTH_SHIELD_STATS).toEqual({
      count: 3,
      orbitRadius: 80,
      orbitSpeed: 2.5,
      size: 14,
      damage: 20,
      knockback: 60,
      hitCooldown: 0.4,
      shieldHp: 80,
      uptime: 5,
      recharge: 3,
    });
  });

  it('hits on the window the game actually applies', () => {
    // The ring claims an enemy's window through `Enemy.tryBoulderHit`, which
    // runs on the global `BOULDER_HIT_COOLDOWN`; a per-spell one is #147's.
    // Until then a block promising a different window would be a lie.
    expect(BASE_EARTH_SHIELD_STATS.hitCooldown).toBe(BOULDER_HIT_COOLDOWN);
    expect(BASE_ICE_SHIELD_STATS.hitCooldown).toBe(BOULDER_HIT_COOLDOWN);
  });

  it('routes every field through the category map, so passives reach them', () => {
    expect(validateSpellFields(BASE_SHIELD_STATS)).toEqual([]);
  });
});

describe('shield presentation', () => {
  it('draws a diamond with a clip the atlas defines (#406)', () => {
    expect(ANIMATIONS.map((anim) => anim.name)).toContain(DIAMOND_CLIP);
    expect(TEXTURE_KEYS).toContain(DIAMOND_TEXTURE);
  });

  it("keeps Ice Shield's card to the numbers the block holds (#406)", () => {
    const { shieldHp, count, damage, uptime, recharge } = BASE_ICE_SHIELD_STATS;
    const card = SHIELD_CARDS.ice_shield;
    expect(card.stats).toEqual([
      ['Absorbs', `${shieldHp} while out`],
      ['Diamonds', `${count}`],
      ['Damage', `${damage}`],
      ['Out', `${uptime} s, back in ${recharge} s`],
    ]);
    expect(card.description).toContain(`${uptime} s`);
    expect(card.stats.length).toBeLessThanOrEqual(5);
  });

  it('gives every shield a one-line card', () => {
    for (const id of SHIELD_SPELL_IDS) {
      expect(SHIELD_CARDS[id].name, id).not.toBe('');
      expect(SHIELD_CARDS[id].description, id).not.toContain('\n');
      expect(SHIELD_CARDS[id].stats.length, id).toBeGreaterThan(0);
    }
  });
});
