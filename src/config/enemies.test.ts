import { describe, expect, it } from 'vitest';
import { TEXTURE_KEYS } from './colors';
import {
  CONTACT_DAMAGE_INTERVAL_MS,
  ENEMY_ARCHETYPES,
  ENEMY_TYPES,
  MAX_LIVE_ENEMIES,
  isEnemyType,
} from './enemies';

describe('enemy types', () => {
  it('lists the three regular enemies from the spec', () => {
    expect(ENEMY_TYPES).toEqual(['swarm', 'fast', 'tank']);
  });

  it('isEnemyType accepts only known types', () => {
    for (const type of ENEMY_TYPES) expect(isEnemyType(type)).toBe(true);
    for (const bad of ['Swarm', 'boss', '', 1, null, undefined, {}]) {
      expect(isEnemyType(bad), String(bad)).toBe(false);
    }
  });
});

describe('enemy archetypes', () => {
  it('defines an archetype for every type and nothing else', () => {
    expect(Object.keys(ENEMY_ARCHETYPES).sort()).toEqual([...ENEMY_TYPES].sort());
  });

  it('matches the spec §5 stat table', () => {
    expect(ENEMY_ARCHETYPES.swarm).toEqual({
      hp: 10,
      speed: 90,
      contactDamage: 3,
      radius: 10,
      texture: 'enemy_swarm',
    });
    expect(ENEMY_ARCHETYPES.fast).toEqual({
      hp: 8,
      speed: 170,
      contactDamage: 3,
      radius: 8,
      texture: 'enemy_fast',
    });
    expect(ENEMY_ARCHETYPES.tank).toEqual({
      hp: 60,
      speed: 50,
      contactDamage: 15,
      radius: 20,
      texture: 'enemy_tank',
    });
  });

  it('points every archetype at a generated texture key', () => {
    for (const type of ENEMY_TYPES) {
      expect(TEXTURE_KEYS, type).toContain(ENEMY_ARCHETYPES[type].texture);
    }
  });

  it('keeps every stat positive', () => {
    for (const type of ENEMY_TYPES) {
      const { hp, speed, contactDamage, radius } = ENEMY_ARCHETYPES[type];
      for (const [label, value] of [
        ['hp', hp],
        ['speed', speed],
        ['contactDamage', contactDamage],
        ['radius', radius],
      ] as const) {
        expect(value, `${type}.${label}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('live enemy cap', () => {
  it('is the spec §5 hard cap of 300', () => {
    expect(MAX_LIVE_ENEMIES).toBe(300);
  });
});

describe('contact damage interval', () => {
  it('is the spec §5 cadence of once per 0.5 s per enemy', () => {
    expect(CONTACT_DAMAGE_INTERVAL_MS).toBe(500);
  });
});
