import { describe, expect, it } from 'vitest';
import { MAX_LIVE_SPIKES } from '../core/earthSpike';
import { MAX_BOULDERS } from '../core/orbitingBoulders';
import { MAX_LIVE_BOULDERS } from '../core/rollingBoulder';
import { levelStatAdds } from '../core/spellLevelStats';
import { BASE_QUAKE_STATS } from './areas';
import { ANIMATIONS } from './animations';
import { ART_BOXES, FRAMES } from './frames';
import { BASE_COMPANION_STATS } from './companions';
import {
  AFTERSHOCK,
  BOULDER_SPLIT,
  EARTH_COMPANION_SWEEP,
  LANDSLIDE,
  MAX_LIVE_RUT_TILES,
  MAX_LIVE_SEISMIC_PATCHES,
  QUAKE_SPLIT,
  RUT_CLIP,
  RUT_VARIANTS,
  SEISMIC_SLAM,
  SPIKES_PER_CAST,
  SPIKE_FAN,
  SPLINTER,
  TREMOR,
} from './earthLevels';
import { BASE_BOULDER_STATS } from './earthRoster';
import { MAX_LIVE_AREAS } from './fx';
import { PROFILE_CLAMPS } from './passives';
import { BASE_EARTH_SHIELD_STATS } from './shields';
import { SPELL_LEVEL_STATS } from './spellLevels';
import { BASE_SPELL_STATS } from './spells';

const HASTE = PROFILE_CLAMPS.cooldownMul?.min ?? 1;
/** The game view's height in px (`main.ts`'s `GAME_HEIGHT`, which imports Phaser). */
const VIEW_HEIGHT = 540;
const clips = new Set(ANIMATIONS.map((anim) => anim.name));

describe('Earth level tunables (#330)', () => {
  it('keeps a positive number in every rule', () => {
    for (const rule of [
      SPIKE_FAN,
      SPIKES_PER_CAST,
      SPLINTER,
      BOULDER_SPLIT,
      TREMOR,
      QUAKE_SPLIT,
      AFTERSHOCK,
      EARTH_COMPANION_SWEEP,
      SEISMIC_SLAM,
      LANDSLIDE,
    ]) {
      for (const value of Object.values(rule)) {
        if (typeof value === 'number') expect(value).toBeGreaterThan(0);
      }
    }
    expect(MAX_LIVE_SEISMIC_PATCHES).toBeGreaterThan(0);
    expect(MAX_LIVE_RUT_TILES).toBeGreaterThan(0);
  });

  it('reads the Haste clamp it sizes the pools against', () => {
    expect(HASTE).toBe(0.35);
  });

  it('draws every level look with a clip the atlas defines', () => {
    for (const clip of [
      SPLINTER.clip,
      AFTERSHOCK.clip,
      'earth.quakeRift',
      'earth.impact',
      'earth.dust',
      RUT_CLIP,
    ]) {
      expect(clips, clip).toContain(clip);
    }
  });

  it('gives whole counts to the things that are counted', () => {
    for (const n of [
      BOULDER_SPLIT.count,
      QUAKE_SPLIT.count,
      EARTH_COMPANION_SWEEP.maxTargets,
      MAX_LIVE_SEISMIC_PATCHES,
      MAX_LIVE_RUT_TILES,
      RUT_VARIANTS,
      ...Object.values(SPIKES_PER_CAST),
    ]) {
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(BOULDER_SPLIT.count).toBeGreaterThanOrEqual(2);
    expect(QUAKE_SPLIT.count).toBeGreaterThanOrEqual(2);
    expect(SPIKES_PER_CAST[1]).toBe(1);
    expect(SPIKES_PER_CAST[2]).toBeGreaterThanOrEqual(2);
  });

  it('keeps every new crowd-control time under the second the boss can be held for', () => {
    for (const stagger of [TREMOR.staggerS, SEISMIC_SLAM.staggerS, LANDSLIDE.staggerS]) {
      expect(stagger).toBeLessThan(1);
    }
    expect(AFTERSHOCK.bossMaxThrowPx).toBeLessThan(BASE_QUAKE_STATS.radius);
  });

  it('pools four times the spikes a cast of two keeps in the air at the Haste clamp', () => {
    const base = BASE_SPELL_STATS.earth;
    const flight = base.range / base.speed;
    const casts = Math.ceil(flight / (base.cooldown * HASTE));
    expect(MAX_LIVE_SPIKES).toBeGreaterThanOrEqual(SPIKES_PER_CAST[3] * casts * 4);
  });

  it('pools four times the boulders two a throw keep rolling at the Haste clamp', () => {
    const flight = BASE_BOULDER_STATS.range / BASE_BOULDER_STATS.speed;
    const rolling = (BOULDER_SPLIT.count * flight) / (BASE_BOULDER_STATS.cooldown * HASTE);
    expect(MAX_LIVE_BOULDERS).toBeGreaterThanOrEqual(rolling * 4);
  });

  it('pools four times the quakes two a cast keep up at the Haste clamp, and the seismic patches too', () => {
    const cadence = BASE_QUAKE_STATS.cooldown * HASTE;
    const quakes = (QUAKE_SPLIT.count * BASE_QUAKE_STATS.duration) / cadence;
    expect(MAX_LIVE_AREAS).toBeGreaterThanOrEqual(quakes * 4 + MAX_LIVE_SEISMIC_PATCHES);
  });

  it('caps the rut tiles above every tile the throws alive together lay at the Haste clamp', () => {
    const perBoulder = Math.floor(BASE_BOULDER_STATS.range / LANDSLIDE.spacingPx) + 1;
    const perThrow = perBoulder * BOULDER_SPLIT.count;
    const cadence = BASE_BOULDER_STATS.cooldown * HASTE;
    // A tile lives durationS, so the throws whose tiles can be down at once are those cast within it.
    const throwsAlive = Math.floor(LANDSLIDE.durationS / cadence) + 1;
    expect(perBoulder).toBe(6);
    expect(MAX_LIVE_RUT_TILES).toBeGreaterThanOrEqual(perThrow * throwsAlive);
    // And it is a margin, not a blank cheque: under twice that.
    expect(MAX_LIVE_RUT_TILES).toBeLessThan(perThrow * throwsAlive * 2);
  });

  it('caps the seismic patches above what a companion swinging at the Haste clamp keeps up', () => {
    const swing =
      BASE_COMPANION_STATS.earth_companion.attackCooldown *
      EARTH_COMPANION_SWEEP.cooldownFactor *
      HASTE;
    expect(MAX_LIVE_SEISMIC_PATCHES).toBeGreaterThanOrEqual(SEISMIC_SLAM.durationS / swing);
    expect(MAX_LIVE_SEISMIC_PATCHES).toBeLessThan(MAX_LIVE_AREAS);
  });

  it('holds the ring, level 3 included, in the stone pool', () => {
    const stones =
      BASE_EARTH_SHIELD_STATS.count +
      (levelStatAdds(SPELL_LEVEL_STATS, 'earth_shield', 3).count ?? 0);
    expect(stones).toBe(4);
    expect(MAX_BOULDERS).toBeGreaterThanOrEqual(stones);
  });

  it('lays a rut as wide as a stone and no wider than the boulder, its tiles overlapping and each fading within its life', () => {
    expect(LANDSLIDE.widthPx).toBeLessThan(2 * BASE_BOULDER_STATS.radius);
    expect(LANDSLIDE.spacingPx).toBeLessThan(LANDSLIDE.tileLengthPx);
    expect(LANDSLIDE.fadeS).toBeGreaterThan(0);
    expect(LANDSLIDE.fadeS).toBeLessThan(LANDSLIDE.durationS);
    expect(LANDSLIDE.durationS / LANDSLIDE.tickEveryS).toBeGreaterThanOrEqual(3);
    // A boulder is spent inside the half view it is thrown across.
    expect(BASE_BOULDER_STATS.range).toBeLessThan(VIEW_HEIGHT / 2);
    expect(LANDSLIDE.spacingPx).toBeLessThan(BASE_BOULDER_STATS.range);
  });

  it('cuts one frame of rut art for each variant a tile can wear', () => {
    for (let n = 0; n < RUT_VARIANTS; n += 1) {
      expect(FRAMES, `${RUT_CLIP}.${n}`).toHaveProperty(`${RUT_CLIP}.${n}`);
    }
    expect(FRAMES).not.toHaveProperty(`${RUT_CLIP}.${RUT_VARIANTS}`);
    // The art box is wide enough to give a tile its whole length at the scale that makes the band the rut's width.
    const art = ART_BOXES[RUT_CLIP];
    expect((art.w * LANDSLIDE.widthPx) / art.h).toBeGreaterThanOrEqual(LANDSLIDE.tileLengthPx);
  });

  it('opens the second quake clear of the first', () => {
    expect(QUAKE_SPLIT.minGapFactor).toBeGreaterThanOrEqual(2);
    // Two quakes at least two radii apart both fit in the range a cast looks over.
    expect(QUAKE_SPLIT.minGapFactor * BASE_QUAKE_STATS.radius).toBeLessThan(
      2 * BASE_QUAKE_STATS.targetRange,
    );
  });

  it('keeps the seismic patch smaller than a quake, ticking more than once in its life', () => {
    expect(SEISMIC_SLAM.radius).toBeLessThan(BASE_QUAKE_STATS.radius);
    expect(SEISMIC_SLAM.durationS / SEISMIC_SLAM.tickEveryS).toBeGreaterThanOrEqual(3);
  });
});
