import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from './animations';
import { COMPANION_KINDS, isCompanionSpellId } from './companions';
import { COMPANION_EMPOWERED } from './fireLevels';
import {
  DEEP_FREEZE,
  FROST_ORB,
  HAIL,
  ICE_ARROW_FAN,
  ICE_SHIELD_WAVE,
  MAX_LIVE_SHARDS,
  NOVA_WAVE,
  SHATTER,
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
      NOVA_WAVE,
      ICE_SHIELD_WAVE,
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
    for (const clip of [SHATTER.clip, FROST_ORB.clip, HAIL.clip, 'ice.wave']) {
      expect(clips, clip).toContain(clip);
    }
  });

  it('gives whole counts to the things that are counted', () => {
    for (const n of [SHATTER.count, FROST_ORB.every]) {
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
    for (const s of [FROST_ORB.freezeS, DEEP_FREEZE.freezeS]) {
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

  it('ends a level 3 wave before the next throw, even at the Haste clamp', () => {
    const life = BASE_NOVA_BOMB_STATS.radius / NOVA_WAVE.speed;
    expect(life).toBeLessThan(BASE_NOVA_BOMB_STATS.cooldown * HASTE);
  });

  it('ends an Ice Shield wave before the diamonds can vanish again, even at the Haste clamp', () => {
    // The ring is gone for `recharge` s, which Haste clamps, before it can burst again.
    const life = ICE_SHIELD_WAVE.range / ICE_SHIELD_WAVE.speed;
    expect(life).toBeLessThan(BASE_ICE_SHIELD_STATS.recharge * HASTE);
  });

  it("chills with the ring's own slow and never freezes (#406)", () => {
    expect(ICE_SHIELD_WAVE.slowPct).toBe(BASE_ICE_SHIELD_STATS.slowPct);
    expect(ICE_SHIELD_WAVE.slowPct).toBeLessThan(1);
    expect(ICE_SHIELD_WAVE).not.toHaveProperty('freezeS');
  });

  it("keeps the Ice Shield wave small: well inside the Frost Nova Bomb's reach", () => {
    expect(ICE_SHIELD_WAVE.range).toBeLessThan(BASE_NOVA_BOMB_STATS.radius);
  });
});
