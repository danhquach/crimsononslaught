import { describe, expect, it } from 'vitest';
import { PLACEHOLDERS } from './colors';
import { ENEMY_TYPES, MAX_LIVE_ENEMIES } from './enemies';
import {
  BOSS_EMBERS,
  CONSUMABLE_CHANCE,
  EMBER_DROPS,
  MAX_LIVE_PICKUPS,
  PICKUP_KINDS,
  PICKUP_TEXTURES,
  RELIC_COUNT,
  RELIC_PLACEMENT,
} from './pickups';

describe('pickup tunables', () => {
  it('matches the spec §4 drop table', () => {
    expect(EMBER_DROPS).toEqual({
      swarm: { chance: 0.2, value: 1 },
      fast: { chance: 0.2, value: 1 },
      tank: { chance: 1, value: 3 },
    });
    expect(BOSS_EMBERS).toBe(100);
    expect(CONSUMABLE_CHANCE).toBe(0.03);
  });

  it('gives every enemy type a valid Ember row', () => {
    for (const type of ENEMY_TYPES) {
      const { chance, value } = EMBER_DROPS[type];
      expect(chance, type).toBeGreaterThanOrEqual(0);
      expect(chance, type).toBeLessThanOrEqual(1);
      expect(Number.isInteger(value) && value > 0, type).toBe(true);
    }
  });

  it('caps live drops above a full arena’s worth of deaths', () => {
    expect(MAX_LIVE_PICKUPS).toBe(500);
    expect(MAX_LIVE_PICKUPS).toBeGreaterThan(MAX_LIVE_ENEMIES);
  });

  it('matches the spec §5 relic placement', () => {
    expect(RELIC_COUNT).toBe(8);
    expect(RELIC_PLACEMENT).toMatchObject({ minFromStart: 400, minApart: 500, edgeMargin: 100 });
    expect(RELIC_PLACEMENT.maxAttempts).toBeGreaterThan(RELIC_COUNT);
  });

  it('gives each kind its own texture, none of them the gem’s, and relics the largest', () => {
    const textures = PICKUP_KINDS.map((kind) => PICKUP_TEXTURES[kind]);
    expect(new Set(textures).size).toBe(PICKUP_KINDS.length);
    for (const key of textures) expect(PLACEHOLDERS[key].shape, key).not.toBe('diamond');
    const size = (key: (typeof textures)[number]) => PLACEHOLDERS[key].width;
    expect(size(PICKUP_TEXTURES.relic)).toBeGreaterThan(size(PICKUP_TEXTURES.ember));
    expect(size(PICKUP_TEXTURES.relic)).toBeGreaterThan(size(PICKUP_TEXTURES.consumable));
    expect(size(PICKUP_TEXTURES.relic)).toBeGreaterThan(PLACEHOLDERS.gem.width);
  });
});
