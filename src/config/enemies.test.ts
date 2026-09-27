import { describe, expect, it } from 'vitest';
import { TEXTURE_KEYS } from './colors';
import {
  CONTACT_DAMAGE_INTERVAL_MS,
  ELITE,
  ENEMY_ARCHETYPES,
  ENEMY_TYPES,
  MAX_LIVE_ENEMIES,
  SHIELD_GUARD,
  isEnemyType,
} from './enemies';

describe('enemy types', () => {
  it('lists the regular enemies: the spec’s three, then #126’s', () => {
    expect(ENEMY_TYPES).toEqual([
      'swarm',
      'fast',
      'tank',
      'ranged',
      'exploder',
      'splitter',
      'splitling',
      'shielded',
    ]);
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
    expect(ENEMY_ARCHETYPES.ranged).toEqual({
      hp: 12,
      speed: 80,
      contactDamage: 3,
      radius: 11,
      texture: 'enemy_ranged',
    });
    expect(ENEMY_ARCHETYPES.exploder).toEqual({
      hp: 14,
      speed: 120,
      contactDamage: 3,
      radius: 11,
      texture: 'enemy_exploder',
    });
    expect(ENEMY_ARCHETYPES.splitter).toEqual({
      hp: 36,
      speed: 60,
      contactDamage: 6,
      radius: 15,
      texture: 'enemy_splitter',
    });
    expect(ENEMY_ARCHETYPES.splitling).toEqual({
      hp: 6,
      speed: 105,
      contactDamage: 2,
      radius: 7,
      texture: 'enemy_splitling',
      loot: false,
    });
    expect(ENEMY_ARCHETYPES.shielded).toEqual({
      hp: 30,
      speed: 55,
      contactDamage: 8,
      radius: 14,
      texture: 'enemy_shielded',
    });
    expect(SHIELD_GUARD).toEqual({ arcDeg: 120, factor: 0.25, turnRateDeg: 30 });
  });

  it('drops loot from every type but the splitter’s child (#126)', () => {
    const lootless = ENEMY_TYPES.filter((type) => ENEMY_ARCHETYPES[type].loot === false);
    expect(lootless).toEqual(['splitling']);
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

describe('elite stats (#126)', () => {
  it('makes an elite tougher, harder-hitting and richer than its crowd', () => {
    expect(ELITE).toEqual({ hpMul: 8, damageMul: 1.5, gemMul: 3 });
    expect(ELITE.hpMul).toBeGreaterThan(1);
    expect(ELITE.damageMul).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(ELITE.gemMul)).toBe(true);
    expect(ELITE.gemMul).toBeGreaterThan(1);
  });
});
