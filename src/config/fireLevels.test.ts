import { describe, expect, it } from 'vitest';
import { COMPANION_KINDS, isCompanionSpellId } from './companions';
import {
  CATACLYSM,
  COMPANION_EMPOWERED,
  DRAGON_PIERCE,
  EMBER,
  FIRE_TRAIL,
  MAX_LIVE_EMBERS,
  MAX_LIVE_SCORCH_PIECES,
  MAX_LIVE_TRAIL_FLAMES,
  MAX_LIVE_TRAIL_ZONES,
  SCORCH_CLIP,
  SCORCH_VARIANTS,
} from './fireLevels';
import { ANIMATIONS } from './animations';
import { ART_BOXES } from './frames';
import { PROFILE_CLAMPS } from './passives';
import { scorchSlots } from '../core/fireTrail';
import { MAX_LIVE_WAVES } from '../core/fireWave';
import { MAX_LIVE_DRAGONS } from '../core/homing';
import { levelStatAdds } from '../core/spellLevelStats';
import { BASE_FIRE_DRAGON_STATS, BASE_FIRE_WAVE_STATS } from './fireRoster';
import { SPELL_LEVEL_STATS } from './spellLevels';
import { BASE_SPELL_STATS } from './spells';

describe('Fire level tunables (#327)', () => {
  it('pools four times the embers the level 3 bolt keeps in the air at the Haste clamp', () => {
    // Level 2 adds a bolt, and level 3 keeps it; each blast throws `count` embers
    // that fly for range / speed seconds, at a cooldown Haste clamps to 0.35x.
    const life = EMBER.range / EMBER.speed;
    const cooldown = BASE_SPELL_STATS.fire.cooldown * 0.35;
    const bolts =
      (BASE_SPELL_STATS.fire.projectiles ?? 1) +
      (levelStatAdds(SPELL_LEVEL_STATS, 'fire', 3).projectiles ?? 0);
    const steady = (bolts * EMBER.count * life) / cooldown;
    expect(MAX_LIVE_EMBERS).toBeGreaterThanOrEqual(steady * 4);
  });

  it('keeps a positive number in every rule', () => {
    for (const rule of [EMBER, CATACLYSM, DRAGON_PIERCE, FIRE_TRAIL]) {
      for (const value of Object.values(rule)) {
        if (typeof value === 'number') expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('empowers only ranged companions', () => {
    for (const id of Object.keys(COMPANION_EMPOWERED)) {
      expect(isCompanionSpellId(id)).toBe(true);
      if (isCompanionSpellId(id)) expect(COMPANION_KINDS[id]).toBe('ranged');
    }
  });

  it('lets a level 3 dragon strike a whole number of enemies, at least two', () => {
    expect(Number.isInteger(DRAGON_PIERCE.hitsPerFlight)).toBe(true);
    expect(DRAGON_PIERCE.hitsPerFlight).toBeGreaterThanOrEqual(2);
  });

  it('pools every dragon the level 3 spell keeps in the air at the Haste clamp', () => {
    // Level 3 sends the base count plus its stat adds, each flying `duration`
    // seconds, at a cooldown Haste clamps; the peak is whole casts in a flight.
    const base = BASE_FIRE_DRAGON_STATS;
    const dragons =
      base.projectiles + (levelStatAdds(SPELL_LEVEL_STATS, 'fire_dragon', 3).projectiles ?? 0);
    const clamp = PROFILE_CLAMPS.cooldownMul?.min;
    expect(clamp).toBeDefined();
    const peak = dragons * Math.ceil(base.duration / (base.cooldown * (clamp ?? 1)));
    expect(MAX_LIVE_DRAGONS).toBeGreaterThanOrEqual(peak);
  });

  describe('Fire trail (level 3 Fire Wave)', () => {
    const arc =
      BASE_FIRE_WAVE_STATS.arc + (levelStatAdds(SPELL_LEVEL_STATS, 'fire_column', 3).arc ?? 0);

    it('lays its rings inside the wave, spaced so pieces overlap', () => {
      expect(FIRE_TRAIL.innerFrac).toBeLessThan(FIRE_TRAIL.outerFrac);
      expect(FIRE_TRAIL.outerFrac).toBeLessThanOrEqual(1);
      expect(FIRE_TRAIL.step).toBeGreaterThan(0);
      expect(FIRE_TRAIL.step).toBeLessThan(1);
      expect(FIRE_TRAIL.scale.min).toBeLessThanOrEqual(FIRE_TRAIL.scale.max);
    });

    it('keeps its clocks in order', () => {
      expect(FIRE_TRAIL.fadeS).toBeLessThanOrEqual(FIRE_TRAIL.holdS);
      expect(FIRE_TRAIL.tickEveryS).toBeLessThan(FIRE_TRAIL.holdS);
      expect(FIRE_TRAIL.burnInnerFrac).toBeLessThan(FIRE_TRAIL.innerFrac);
    });

    it('draws from clips the atlas has', () => {
      expect(ANIMATIONS.find((a) => a.name === SCORCH_CLIP)?.frames).toHaveLength(SCORCH_VARIANTS);
      expect(ANIMATIONS.some((a) => a.name === FIRE_TRAIL.flameClip)).toBe(true);
      expect(ART_BOXES).toHaveProperty(SCORCH_CLIP);
    });

    it('pools every zone, piece and flame the level 3 wave keeps at the Haste clamp', () => {
      const clamp = PROFILE_CLAMPS.cooldownMul?.min;
      expect(clamp).toBeDefined();
      const zones =
        MAX_LIVE_WAVES +
        Math.ceil(FIRE_TRAIL.holdS / (BASE_FIRE_WAVE_STATS.cooldown * (clamp ?? 1)));
      expect(MAX_LIVE_TRAIL_ZONES).toBeGreaterThanOrEqual(zones);
      expect(MAX_LIVE_SCORCH_PIECES).toBeGreaterThanOrEqual(
        MAX_LIVE_TRAIL_ZONES * scorchSlots(arc).length,
      );
      expect(MAX_LIVE_TRAIL_FLAMES).toBeGreaterThanOrEqual(
        MAX_LIVE_TRAIL_ZONES * FIRE_TRAIL.flames,
      );
      expect(MAX_LIVE_SCORCH_PIECES + MAX_LIVE_TRAIL_FLAMES).toBeLessThanOrEqual(300);
    });
  });
});
