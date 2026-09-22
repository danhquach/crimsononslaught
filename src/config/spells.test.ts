import { describe, expect, it } from 'vitest';
import {
  BASE_SPELL_STATS,
  BOULDER_HIT_COOLDOWN,
  BURN_DURATION,
  FREEZE_DURATION,
  SPELL_CARDS,
  SPELL_IDS,
  isSpellId,
  spellIdForKey,
} from './spells';

describe('spell ids', () => {
  it('lists the four spells from the spec in card order', () => {
    expect(SPELL_IDS).toEqual(['fire', 'ice', 'lightning', 'earth']);
  });

  it('isSpellId accepts only known ids', () => {
    for (const id of SPELL_IDS) expect(isSpellId(id)).toBe(true);
    for (const bad of ['Fire', 'water', '', 1, null, undefined, {}]) {
      expect(isSpellId(bad), String(bad)).toBe(false);
    }
  });
});

describe('spell cards', () => {
  it('defines a card for every spell id and nothing else', () => {
    expect(Object.keys(SPELL_CARDS).sort()).toEqual([...SPELL_IDS].sort());
  });

  it('gives every card a name, one-line description, distinct color and 2–5 stats', () => {
    const colors = SPELL_IDS.map((id) => SPELL_CARDS[id].color);
    expect(new Set(colors).size).toBe(colors.length);

    for (const id of SPELL_IDS) {
      const card = SPELL_CARDS[id];
      expect(card.name.trim().length, id).toBeGreaterThan(0);
      expect(card.description.trim().length, id).toBeGreaterThan(0);
      expect(card.description, id).not.toContain('\n');
      expect(card.color, id).toBeGreaterThanOrEqual(0);
      expect(card.color, id).toBeLessThanOrEqual(0xffffff);
      expect(card.stats.length, id).toBeGreaterThanOrEqual(2);
      expect(card.stats.length, id).toBeLessThanOrEqual(5);
      for (const [label, value] of card.stats) {
        expect(label.trim().length, `${id} stat label`).toBeGreaterThan(0);
        expect(value.trim().length, `${id} stat ${label}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('spell card stats match spec §5 base values', () => {
  it('fire', () => {
    expect(SPELL_CARDS.fire.stats).toEqual([
      ['Cooldown', '1.0 s'],
      ['Damage', '12'],
      ['Blast radius', '50'],
      ['Projectiles', '1'],
    ]);
  });
  it('ice', () => {
    expect(SPELL_CARDS.ice.stats).toEqual([
      ['Cooldown', '0.8 s'],
      ['Damage', '10'],
      ['Range', '420'],
      ['Slow', '20% for 1.0 s'],
    ]);
  });
  it('lightning', () => {
    expect(SPELL_CARDS.lightning.stats).toEqual([
      ['Cooldown', '0.9 s'],
      ['Damage', '14'],
      ['Stagger', '0.5 s'],
      ['Stun', '8% for 2 s'],
    ]);
  });
  it('earth', () => {
    expect(SPELL_CARDS.earth.stats).toEqual([
      ['Boulders', '3'],
      ['Damage', '10'],
      ['Orbit radius', '80'],
      ['Knockback', '60'],
    ]);
  });
});

describe('spellIdForKey', () => {
  it('maps keys 1–4 to the spells in card order', () => {
    expect(spellIdForKey('1')).toBe('fire');
    expect(spellIdForKey('2')).toBe('ice');
    expect(spellIdForKey('3')).toBe('lightning');
    expect(spellIdForKey('4')).toBe('earth');
  });

  it('ignores every other key', () => {
    for (const key of ['0', '5', '9', 'a', 'Enter', ' ', '', '11', '-1']) {
      expect(spellIdForKey(key), JSON.stringify(key)).toBeUndefined();
    }
  });
});

describe('spell durations match spec §5', () => {
  it('burn ticks for 2 s — "Burn (dmg/s for 2 s, x2)"', () => {
    expect(BURN_DURATION).toBe(2);
  });

  it('a freeze is a full stop for 1 s — "Freeze chance (full stop 1 s, x2)"', () => {
    expect(FREEZE_DURATION).toBe(1);
  });

  it('a boulder re-hits the same enemy at most every 0.4 s — "per-enemy hit cooldown 0.4 s"', () => {
    expect(BOULDER_HIT_COOLDOWN).toBe(0.4);
  });
});

describe('base stat blocks', () => {
  it('matches the spec base tables', () => {
    expect(BASE_SPELL_STATS.fire).toEqual({
      cooldown: 1,
      damage: 12,
      aoeRadius: 50,
      aoeDamageFactor: 0.5,
      projectiles: 1,
      speed: 350,
      range: 400,
    });
    // Ice's block is Ice Arrow's (Phase 2 spec §9.3); Frost Nova is `ice_nova_bomb` now.
    expect(BASE_SPELL_STATS.ice).toEqual({
      cooldown: 0.8,
      damage: 10,
      projectiles: 1,
      speed: 380,
      range: 420,
      slowPct: 0.2,
      slowDuration: 1,
    });
    // Lightning's block is Lightning Bolt's (Phase 2 spec §9.4); Chain Lightning is `lightning_chain` now.
    expect(BASE_SPELL_STATS.lightning).toEqual({
      cooldown: 0.9,
      damage: 14,
      strikes: 1,
      targetRange: 400,
      staggerDuration: 0.5,
      stunChance: 0.08,
      stunDuration: 2,
    });
    expect(BASE_SPELL_STATS.earth).toEqual({
      count: 3,
      orbitRadius: 80,
      orbitSpeed: 2.5,
      damage: 10,
      knockback: 60,
      size: 14,
      crushMultiplier: 1,
    });
  });

  it('defines a block for every spell id', () => {
    expect(Object.keys(BASE_SPELL_STATS).sort()).toEqual([...SPELL_IDS].sort());
  });
});
