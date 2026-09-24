import { describe, expect, it } from 'vitest';
import { PLACEHOLDERS } from './colors';
import { ENEMY_ARCHETYPES, ENEMY_TYPES, MAX_LIVE_ENEMIES } from './enemies';
import { GEM_DRIFT_SPEED } from './gems';
import { PLAYER_MAX_HP } from './player';
import {
  BOMB_DAMAGE,
  BOSS_EMBERS,
  CHEST_EMBERS,
  CONSUMABLE_CHANCE,
  CONSUMABLE_KINDS,
  CONSUMABLE_TEXTURES,
  CONSUMABLE_WEIGHTS,
  ELITE_CHEST_CHANCE,
  EMBER_DROPS,
  HEAL_AMOUNT,
  MAGNET_DURATION_MS,
  MAX_LIVE_PICKUPS,
  PICKUP_TEXTURES,
  RELIC_COUNT,
  RELIC_PLACEMENT,
} from './pickups';
import { WAVES } from './waves';

/** `GameScene`'s arena, in px. */
const WORLD = 3000;

describe('pickup tunables', () => {
  it('matches the spec §4 drop table', () => {
    expect(EMBER_DROPS).toEqual({
      swarm: { chance: 0.2, value: 1 },
      fast: { chance: 0.2, value: 1 },
      tank: { chance: 1, value: 3 },
    });
    expect(BOSS_EMBERS).toBe(100);
    expect(CONSUMABLE_CHANCE).toBe(0.003);
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

  it('gives each kind and each consumable its own texture, none of them the gem’s, and relics the largest', () => {
    const textures = [
      ...Object.values(PICKUP_TEXTURES),
      ...CONSUMABLE_KINDS.map((kind) => CONSUMABLE_TEXTURES[kind]),
    ];
    expect(new Set(textures).size).toBe(textures.length);
    for (const key of textures) expect(PLACEHOLDERS[key].shape, key).not.toBe('diamond');
    const size = (key: (typeof textures)[number]) => PLACEHOLDERS[key].width;
    for (const key of textures.filter((k) => k !== PICKUP_TEXTURES.relic)) {
      expect(size(PICKUP_TEXTURES.relic), key).toBeGreaterThan(size(key));
    }
    expect(size(PICKUP_TEXTURES.relic)).toBeGreaterThan(PLACEHOLDERS.gem.width);
  });
});

describe('consumable tunables (#128)', () => {
  it('matches the #128 drop rules', () => {
    expect(CONSUMABLE_KINDS).toEqual(['health', 'magnet', 'bomb', 'chest']);
    expect(CONSUMABLE_WEIGHTS).toEqual({ health: 0.45, magnet: 0.35, bomb: 0.2 });
    expect(ELITE_CHEST_CHANCE).toBe(1);
  });

  it('matches the #128 effects', () => {
    expect(HEAL_AMOUNT).toBe(30);
    expect(MAGNET_DURATION_MS).toBe(11_000);
    expect(BOMB_DAMAGE).toBe(200);
    expect(CHEST_EMBERS).toBe(25);
  });

  it('weights only regular kinds, each above 0; a chest is an elite’s', () => {
    expect(Object.keys(CONSUMABLE_WEIGHTS)).not.toContain('chest');
    for (const [kind, weight] of Object.entries(CONSUMABLE_WEIGHTS)) {
      expect(weight, kind).toBeGreaterThan(0);
    }
    expect(ELITE_CHEST_CHANCE).toBeGreaterThan(0);
    expect(ELITE_CHEST_CHANCE).toBeLessThanOrEqual(1);
  });

  it('heals a real share of the bar without filling it', () => {
    expect(HEAL_AMOUNT).toBeGreaterThan(0);
    expect(HEAL_AMOUNT).toBeLessThan(PLAYER_MAX_HP);
  });

  it('holds a magnet long enough to pull a gem corner to corner', () => {
    const diagonal = Math.hypot(WORLD, WORLD);
    expect((MAGNET_DURATION_MS / 1000) * GEM_DRIFT_SPEED).toBeGreaterThanOrEqual(diagonal);
  });

  it('kills any regular enemy at the hardest wave in one bomb', () => {
    const hardest = Math.max(...WAVES.map((wave) => wave.hpMul));
    for (const type of ENEMY_TYPES) {
      expect(BOMB_DAMAGE, type).toBeGreaterThanOrEqual(ENEMY_ARCHETYPES[type].hp * hardest);
    }
  });
});
