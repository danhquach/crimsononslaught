import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from './animations';
import { COMPANION_KINDS, COMPANION_REACH } from './companions';
import { COMPANION_EMPOWERED } from './fireLevels';
import {
  COMPANION_ARC,
  COMPANION_FRENZY,
  FORK,
  MAX_LIVE_STORM_BOLTS,
  STORM_CELL,
  SWORD_ARC,
  THUNDERBOLT,
  THUNDERCLAP,
  TWIN_TORNADO,
} from './lightningLevels';
import { BASE_CHAIN_LIGHTNING_STATS, BASE_TORNADO_STATS } from './lightningRoster';
import { MAX_BOULDERS } from '../core/orbitingBoulders';
import { PROFILE_CLAMPS } from './passives';
import { SPELL_LEVEL_STATS } from './spellLevels';
import { BASE_SPELL_STATS } from './spells';

const HASTE = PROFILE_CLAMPS.cooldownMul?.min ?? 1;
const clips = new Set(ANIMATIONS.map((anim) => anim.name));

describe('Lightning level tunables (#329)', () => {
  it('keeps a positive number in every rule', () => {
    for (const rule of [
      THUNDERBOLT,
      FORK,
      TWIN_TORNADO,
      STORM_CELL,
      COMPANION_FRENZY,
      COMPANION_ARC,
      THUNDERCLAP,
      SWORD_ARC,
    ]) {
      for (const value of Object.values(rule)) {
        if (typeof value === 'number') expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('reads the Haste clamp it sizes the pool against', () => {
    expect(HASTE).toBe(0.35);
  });

  it('draws every level look with a clip the atlas defines', () => {
    for (const clip of [THUNDERBOLT.clip, STORM_CELL.clip]) expect(clips, clip).toContain(clip);
  });

  it('gives whole counts to the things that are counted', () => {
    for (const n of [
      THUNDERBOLT.every,
      FORK.maxHits,
      TWIN_TORNADO.count,
      COMPANION_ARC.maxTargets,
      THUNDERCLAP.chains,
      SWORD_ARC.maxTargets,
    ]) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('matches the ticket: every 5th cast, 2 tornadoes, a bolt every 0.5 s, 3 chains, 1-2 arcs within ~60 px', () => {
    expect(THUNDERBOLT.every).toBe(5);
    expect(TWIN_TORNADO.count).toBe(2);
    expect(STORM_CELL.everyS).toBe(0.5);
    expect(THUNDERCLAP.chains).toBe(3);
    expect(SWORD_ARC.maxTargets).toBe(2);
    expect(SWORD_ARC.range).toBe(60);
    expect(COMPANION_FRENZY.cooldownFactor).toBe(0.5);
  });

  it('adds the stat steps the ticket names: 2 bolts, 4 chains, 4 then 5 blades', () => {
    expect(SPELL_LEVEL_STATS.lightning).toEqual({ 2: { strikes: 1 } });
    expect(BASE_SPELL_STATS.lightning.strikes + 1).toBe(2);
    expect(
      BASE_CHAIN_LIGHTNING_STATS.chains + (SPELL_LEVEL_STATS.lightning_chain?.[2]?.chains ?? 0),
    ).toBe(4);
    const sword = SPELL_LEVEL_STATS.lightning_sword;
    expect([
      3,
      3 + (sword?.[2]?.count ?? 0),
      3 + (sword?.[2]?.count ?? 0) + (sword?.[3]?.count ?? 0),
    ]).toEqual([3, 4, 5]);
    // The ring's pool holds a level 3 sword's blades.
    expect(MAX_BOULDERS).toBeGreaterThanOrEqual(5);
  });

  it("caps a fork's hits at what one unforked level 2 bolt could strike and a little more", () => {
    const levelTwoHits = 1 + BASE_CHAIN_LIGHTNING_STATS.chains + 2;
    expect(FORK.maxHits).toBeGreaterThan(levelTwoHits);
    expect(FORK.maxHits).toBeLessThan(1 + 2 * levelTwoHits);
  });

  it('never stuns longer than the boss can be held for', () => {
    expect(THUNDERBOLT.stunS).toBeLessThanOrEqual(1);
  });

  it('keeps the companion arc just past its swing reach, and the Lightning Companion melee with no empowered shot', () => {
    expect(COMPANION_ARC.radius).toBeGreaterThan(COMPANION_REACH);
    expect(COMPANION_ARC.halfAngleDeg).toBeLessThan(90);
    expect(COMPANION_KINDS.lightning_companion).toBe('melee');
    expect(COMPANION_EMPOWERED).not.toHaveProperty('lightning_companion');
  });

  it('pools four times the storm cell bolts level 3 keeps in the air at the Haste clamp', () => {
    // Funnels alive at once: a cast of two every cooldown, each living `duration`.
    const casts = Math.ceil(BASE_TORNADO_STATS.duration / (BASE_TORNADO_STATS.cooldown * HASTE));
    const funnels = casts * TWIN_TORNADO.count;
    // Each throws one bolt per `everyS`, in the air at most range / speed seconds.
    const life = STORM_CELL.range / STORM_CELL.speed;
    const steady = funnels * Math.ceil(life / STORM_CELL.everyS);
    expect(MAX_LIVE_STORM_BOLTS).toBeGreaterThanOrEqual(steady * 4);
  });
});
