import { describe, expect, it } from 'vitest';
import { SPELLS_BY_ELEMENT } from './loadout';
import {
  BASE_CHAIN_LIGHTNING_STATS,
  BASE_LIGHTNING_ROSTER_STATS,
  BASE_SWORD_STATS,
  BASE_TORNADO_STATS,
  LIGHTNING_ROSTER_CARDS,
  LIGHTNING_ROSTER_SPELL_IDS,
  isLightningRosterSpellId,
} from './lightningRoster';
import { SPELL_STAT_FIELDS } from './spellFields';
import { BASE_SPELL_STATS } from './spells';

describe('Lightning roster ids (#142)', () => {
  it('is the element roster minus the default and the companion', () => {
    const [, ...rest] = SPELLS_BY_ELEMENT.lightning;
    expect([...LIGHTNING_ROSTER_SPELL_IDS]).toEqual(
      rest.filter((id) => id !== 'lightning_companion'),
    );
  });

  it('isLightningRosterSpellId accepts only its ids', () => {
    for (const id of LIGHTNING_ROSTER_SPELL_IDS) expect(isLightningRosterSpellId(id)).toBe(true);
    for (const bad of ['lightning', 'lightning_companion', 'fire_column', '', 1, null]) {
      expect(isLightningRosterSpellId(bad), String(bad)).toBe(false);
    }
  });
});

describe('Lightning roster base blocks match spec §9.4', () => {
  it('Lightning Bolt is the default block', () => {
    expect(BASE_SPELL_STATS.lightning).toEqual({
      cooldown: 0.9,
      damage: 14,
      strikes: 1,
      targetRange: 150,
      staggerDuration: 0.5,
      stunChance: 0.08,
      stunDuration: 2,
    });
  });

  it('Chain Lightning', () => {
    expect(BASE_CHAIN_LIGHTNING_STATS).toEqual({
      cooldown: 1.4,
      damage: 12,
      strikes: 1,
      chains: 2,
      chainRange: 120,
      chainFalloff: 0.8,
      targetRange: 150,
      staggerDuration: 0.5,
      stunChance: 0.08,
      stunDuration: 2,
    });
  });

  it('Tornado', () => {
    expect(BASE_TORNADO_STATS).toEqual({
      cooldown: 9,
      tickDamage: 5,
      tickRate: 0.4,
      radius: 60,
      pullRadius: 80,
      pullForce: 90,
      speed: 60,
      targetRange: 162,
      duration: 5,
    });
  });

  it('Lightning Sword', () => {
    expect(BASE_SWORD_STATS).toEqual({
      count: 1,
      orbitRadius: 70,
      orbitSpeed: 3.2,
      damage: 16,
      size: 18,
      hitCooldown: 0.35,
      staggerDuration: 0.3,
    });
  });

  it('defines a block and a card for every id and nothing else', () => {
    expect(Object.keys(BASE_LIGHTNING_ROSTER_STATS).sort()).toEqual(
      [...LIGHTNING_ROSTER_SPELL_IDS].sort(),
    );
    expect(Object.keys(LIGHTNING_ROSTER_CARDS).sort()).toEqual(
      [...LIGHTNING_ROSTER_SPELL_IDS].sort(),
    );
  });

  it('every field of every block is a scaled stat field (spec §6.1)', () => {
    const blocks = [BASE_SPELL_STATS.lightning, ...Object.values(BASE_LIGHTNING_ROSTER_STATS)];
    for (const block of blocks) {
      for (const field of Object.keys(block)) {
        expect(SPELL_STAT_FIELDS, field).toContain(field);
      }
    }
  });
});

describe('Lightning roster cards', () => {
  it('gives every card a name, one-line description and 2–5 stats', () => {
    for (const id of LIGHTNING_ROSTER_SPELL_IDS) {
      const card = LIGHTNING_ROSTER_CARDS[id];
      expect(card.name.trim().length, id).toBeGreaterThan(0);
      expect(card.description, id).not.toContain('\n');
      expect(card.stats.length, id).toBeGreaterThanOrEqual(2);
      expect(card.stats.length, id).toBeLessThanOrEqual(5);
    }
  });
});
