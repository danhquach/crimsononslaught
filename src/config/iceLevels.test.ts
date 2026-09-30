import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from './animations';
import { COMPANION_KINDS, isCompanionSpellId } from './companions';
import { COMPANION_EMPOWERED } from './fireLevels';
import {
  CLUSTER,
  DEEP_FREEZE,
  FROST_AURA,
  FROST_ORB,
  HAIL,
  ICE_ARROW_FAN,
  MAX_LIVE_MINI_URCHINS,
  MAX_LIVE_SHARDS,
  MAX_LIVE_SHIELD_ICICLES,
  SHATTER,
  SHATTER_RING,
} from './iceLevels';
import { BASE_NOVA_BOMB_STATS } from './iceRoster';
import { PROFILE_CLAMPS } from './passives';
import { BASE_ICE_SHIELD_STATS } from './shields';
import { BASE_SPELL_STATS } from './spells';

const HASTE = PROFILE_CLAMPS.cooldownMul?.min ?? 1;
const clips = new Set(ANIMATIONS.map((anim) => anim.name));

describe('Ice level tunables (#328)', () => {
  it('keeps a positive number in every rule', () => {
    for (const rule of [
      ICE_ARROW_FAN,
      SHATTER,
      CLUSTER,
      FROST_AURA,
      SHATTER_RING,
      FROST_ORB,
      HAIL,
      DEEP_FREEZE,
    ]) {
      for (const value of Object.values(rule)) {
        if (typeof value === 'number') expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('reads the Haste clamp it sizes the pools against', () => {
    expect(HASTE).toBe(0.35);
  });

  it('draws every level look with a clip the atlas defines', () => {
    for (const clip of [SHATTER.clip, CLUSTER.clip, FROST_ORB.clip, HAIL.clip]) {
      expect(clips, clip).toContain(clip);
    }
  });

  it('gives whole counts to the things that are counted', () => {
    for (const n of [SHATTER.count, CLUSTER.count, SHATTER_RING.icicles, FROST_ORB.every]) {
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(SHATTER.count).toBeGreaterThanOrEqual(2);
    expect(FROST_ORB.every).toBeGreaterThanOrEqual(2);
  });

  it('empowers the Ice companion, a ranged one, with the frost orb', () => {
    expect(COMPANION_EMPOWERED.ice_companion).toBe('frostOrb');
    expect(isCompanionSpellId('ice_companion')).toBe(true);
    expect(COMPANION_KINDS.ice_companion).toBe('ranged');
  });

  it('never lets a freeze here outrun the 1 s the boss can be held for', () => {
    for (const s of [FROST_ORB.freezeS, SHATTER_RING.freezeS, DEEP_FREEZE.freezeS]) {
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('pools four times the shards level 3 keeps in the air at the Haste clamp', () => {
    // Level 2's second arrow stays at level 3; each arrow's hit throws `count`
    // shards that fly range / speed seconds, at a cooldown Haste clamps.
    const arrows = 2;
    const life = SHATTER.range / SHATTER.speed;
    const steady = (arrows * SHATTER.count * life) / (BASE_SPELL_STATS.ice.cooldown * HASTE);
    expect(MAX_LIVE_SHARDS).toBeGreaterThanOrEqual(steady * 4);
  });

  it('pools four times the urchins level 3 keeps rolling at the Haste clamp', () => {
    const life = CLUSTER.range / CLUSTER.speed;
    const steady = (CLUSTER.count * life) / (BASE_NOVA_BOMB_STATS.cooldown * HASTE);
    expect(MAX_LIVE_MINI_URCHINS).toBeGreaterThanOrEqual(steady * 4);
  });

  it('pools two full rings of shield icicles, and a break every 2.1 s at the Haste clamp never fills it', () => {
    expect(MAX_LIVE_SHIELD_ICICLES).toBeGreaterThanOrEqual(2 * SHATTER_RING.icicles);
    // A shield cannot break again before its recharge delay has passed, which Haste clamps.
    const life = SHATTER_RING.range / SHATTER_RING.speed;
    const breaksInFlight = Math.ceil(life / (BASE_ICE_SHIELD_STATS.rechargeDelay * HASTE));
    expect(MAX_LIVE_SHIELD_ICICLES).toBeGreaterThanOrEqual(breaksInFlight * SHATTER_RING.icicles);
  });
});
