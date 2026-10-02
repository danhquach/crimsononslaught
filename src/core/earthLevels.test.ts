import { describe, expect, it } from 'vitest';
import { BOSS } from '../config/boss';
import { BASE_COMPANION_STATS } from '../config/companions';
import {
  AFTERSHOCK,
  BOULDER_SPLIT,
  EARTH_COMPANION_SWEEP,
  LANDSLIDE,
  MAX_LIVE_SEISMIC_PATCHES,
  QUAKE_SPLIT,
  RUT_VARIANTS,
  SEISMIC_SLAM,
  SPIKE_FAN,
  SPLINTER,
  TREMOR,
} from '../config/earthLevels';
import { BASE_BOULDER_STATS } from '../config/earthRoster';
import { BASE_QUAKE_STATS } from '../config/areas';
import { PASSIVES } from '../config/passives';
import type { SpellLevel } from '../config/spellLevels';
import { BASE_SPELL_STATS } from '../config/spells';
import { startBossCycle, stepBossCycle } from './boss';
import { NO_BOSS_CC, resistBossCc, type BossCcState } from './bossCrowdControl';
import { rollBleed } from './earthSpike';
import {
  aftershockDamage,
  aftershockThrow,
  boulderHeadings,
  bouldersPerCast,
  earthCompanionAttackCooldown,
  earthSweepPush,
  earthSweepTargets,
  hasAftershock,
  hasEarthSweep,
  hasSeismicSlam,
  hasLandslide,
  hasSplinter,
  hasTremor,
  quakeSpots,
  quakesPerCast,
  onRut,
  patchAllowed,
  rutAlpha,
  rutStaggerS,
  rutTickDamage,
  rutTilesDue,
  rutWindowOffset,
  ruttedBy,
  seismicPatchRule,
  seismicStaggerS,
  spikeHeadings,
  spikeRollsOnLevelStream,
  spikesPerCast,
  splinterDamage,
  splinterPush,
  splinterTargets,
  tremorPush,
  tremorReach,
  tremorTargets,
  tremorsDue,
  type RutTile,
} from './earthLevels';
import { advanceArea, areaStaggerS, createArea, densestSpot } from './groundArea';
import { companionAttackCooldown } from './lightningLevels';
import { knockbackVector } from './orbitingBoulders';
import { createRng } from './rng';
import { rollTarget } from './rollingBoulder';
import { applyStagger, staggerSpeedFactor, tickStagger } from './status';

/** #330: the level 2 and 3 rules of the Earth spells, checked without an engine. */

const LEVELS: readonly SpellLevel[] = [1, 2, 3];
const DEG = Math.PI / 180;
const PERSISTENCE = PASSIVES.find((p) => p.id === 'passive_persistence')?.amount ?? NaN;

interface Body {
  x: number;
  y: number;
  bodyRadius?: number;
}
const at = (x: number, y: number, bodyRadius?: number): Body => ({ x, y, bodyRadius });
const dist = (a: Body, b: Body): number => Math.hypot(a.x - b.x, a.y - b.y);
const len = (v: { x: number; y: number }): number => Math.hypot(v.x, v.y);

describe('level gates', () => {
  it('turns each behaviour on at its own level and keeps it on', () => {
    expect(LEVELS.map(hasSplinter)).toEqual([false, false, true]);
    expect(LEVELS.map(hasLandslide)).toEqual([false, false, true]);
    expect(LEVELS.map(hasTremor)).toEqual([false, false, true]);
    expect(LEVELS.map(hasAftershock)).toEqual([false, false, true]);
    expect(LEVELS.map(hasEarthSweep)).toEqual([false, true, true]);
    expect(LEVELS.map(hasSeismicSlam)).toEqual([false, false, true]);
  });

  it('counts the casts a level changes', () => {
    expect(LEVELS.map(spikesPerCast)).toEqual([1, 2, 2]);
    expect(LEVELS.map(bouldersPerCast)).toEqual([1, BOULDER_SPLIT.count, BOULDER_SPLIT.count]);
    expect(LEVELS.map(quakesPerCast)).toEqual([1, QUAKE_SPLIT.count, QUAKE_SPLIT.count]);
  });
});

describe('Earth Spike level 2: a fan of two', () => {
  it('flings one spike along the aim at level 1, exactly', () => {
    for (const aim of [0, 0.7, -2.4, Math.PI]) expect(spikeHeadings(aim, 1)).toEqual([aim]);
  });

  it('flings two symmetric about the aim, 20 degrees from the first to the last', () => {
    for (const level of [2, 3] as const) {
      const [a, b] = spikeHeadings(0.5, level);
      expect(a).toBeCloseTo(0.5 - 10 * DEG, 12);
      expect(b).toBeCloseTo(0.5 + 10 * DEG, 12);
      expect((b as number) - (a as number)).toBeCloseTo(SPIKE_FAN.spreadDeg * DEG, 12);
    }
  });

  it('takes the spread it is given', () => {
    const [a, b] = spikeHeadings(0, 2, 40);
    expect(a).toBeCloseTo(-20 * DEG, 12);
    expect(b).toBeCloseTo(20 * DEG, 12);
  });

  it('rolls the first spike on the run stream and the rest on the level stream', () => {
    expect([0, 1, 2].map(spikeRollsOnLevelStream)).toEqual([false, true, true]);
  });

  it('leaves the run stream exactly as a level-1 run reads it, however many casts', () => {
    const chance = BASE_SPELL_STATS.earth.bleedChance;
    const drive = (level: SpellLevel): { run: number; levelRng: number } => {
      const run = createRng(11);
      const levelRng = createRng(99);
      for (let cast = 0; cast < 200; cast += 1) {
        spikeHeadings(0, level).forEach((_, i) => {
          rollBleed(spikeRollsOnLevelStream(i) ? levelRng : run, chance);
        });
      }
      return { run: run.next(), levelRng: levelRng.next() };
    };
    const one = drive(1);
    for (const level of [2, 3] as const) {
      const more = drive(level);
      expect(more.run).toBe(one.run);
      expect(more.levelRng).not.toBe(createRng(99).next());
    }
    // Level 1 never touches the level stream.
    expect(one.levelRng).toBe(createRng(99).next());
  });
});

describe('Splinter', () => {
  const hit = { x: 100, y: 50 };
  const struck = at(100, 50, 10);

  it('shatters over 60 px, 0.75 x the spike and a 24 px shove', () => {
    expect(SPLINTER.radiusPx).toBe(60);
    expect(SPLINTER.damageFactor).toBe(0.75);
    expect(SPLINTER.knockbackPx).toBe(24);
  });

  it('catches every enemy whose edge is within the radius, edge inclusive', () => {
    const edge = at(hit.x + SPLINTER.radiusPx + 10, hit.y, 10);
    const outside = at(hit.x + SPLINTER.radiusPx + 10.01, hit.y, 10);
    const close = at(hit.x + 20, hit.y + 5);
    expect(splinterTargets(hit, [outside, edge, close])).toEqual([close, edge]);
  });

  it('leaves out the enemy the spike struck, however it is passed', () => {
    const other = at(110, 50);
    expect(splinterTargets(hit, [struck, other], [struck])).toEqual([other]);
    expect(splinterTargets(hit, [struck, other], new Set([struck, other]))).toEqual([]);
  });

  it('lists the nearest edge first, input order on a tie, each enemy once', () => {
    const far = at(hit.x + 50, hit.y);
    const big = at(hit.x, hit.y + 70, 40);
    const twinA = at(hit.x - 30, hit.y);
    const twinB = at(hit.x, hit.y + 30);
    const caught = splinterTargets(hit, [far, big, twinA, twinB]);
    expect(caught).toEqual([big, twinA, twinB, far]);
    expect(new Set(caught).size).toBe(caught.length);
  });

  it('is empty for no enemies or a bad radius, and takes the radius it is given', () => {
    expect(splinterTargets(hit, [])).toEqual([]);
    expect(splinterTargets(hit, [at(100, 50)], [], -1)).toEqual([]);
    expect(splinterTargets(hit, [at(100, 50)], [], Number.NaN)).toEqual([]);
    expect(splinterTargets(hit, [at(130, 50)], [], 29)).toEqual([]);
    expect(splinterTargets(hit, [at(130, 50)], [], 30)).toHaveLength(1);
  });

  it('deals a fraction of the spike', () => {
    expect(splinterDamage(16)).toBeCloseTo(16 * SPLINTER.damageFactor, 12);
    expect(splinterDamage(16, 1)).toBe(16);
  });

  it('shoves the set distance straight out from the hit, and not at all from dead on it', () => {
    const push = splinterPush(hit, { x: 100, y: 80 });
    expect(push.x).toBeCloseTo(0, 9);
    expect(push.y).toBeCloseTo(SPLINTER.knockbackPx, 9);
    expect(len(splinterPush(hit, { x: 70, y: 50 }, 12))).toBeCloseTo(12, 9);
    expect(splinterPush(hit, hit)).toEqual({ x: 0, y: 0 });
    expect(splinterPush(hit, { x: 101, y: 50 }, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('Boulder level 2: two boulders', () => {
  const caster = { x: 0, y: 0 };
  const range = BASE_BOULDER_STATS.range;

  it('throws at the nearest two enemies in range, nearest first, as unit headings', () => {
    const enemies = [at(0, 150), at(100, 0), at(-90, 10), at(600, 0)];
    const headings = boulderHeadings(caster, enemies, 2, range);
    expect(headings).toHaveLength(2);
    expect(headings[0]!.x).toBeCloseTo(-90 / Math.hypot(90, 10), 12);
    expect(headings[1]!.x).toBeCloseTo(1, 12);
    for (const h of headings) expect(len(h)).toBeCloseTo(1, 12);
  });

  it('fans the second 25 degrees off the first when only one enemy is in range', () => {
    const [a, b] = boulderHeadings(caster, [at(100, 0), at(500, 0)], 2, range);
    const turn = Math.atan2(b!.y, b!.x) - Math.atan2(a!.y, a!.x);
    expect(Math.abs(turn)).toBeCloseTo(BOULDER_SPLIT.fallbackSpreadDeg * DEG, 12);
    expect(len(b!)).toBeCloseTo(1, 12);
  });

  it('is empty with nothing in range, and for no boulders', () => {
    expect(boulderHeadings(caster, [at(range + 1, 0)], 2, range)).toEqual([]);
    expect(boulderHeadings(caster, [at(10, 0)], 0, range)).toEqual([]);
    expect(boulderHeadings(caster, [], 2, range)).toEqual([]);
  });

  it('sends a single boulder exactly where level 1 throws it', () => {
    const rng = createRng(3);
    for (let trial = 0; trial < 50; trial += 1) {
      const enemies = Array.from({ length: 6 }, () =>
        at(rng.next() * 500 - 250, rng.next() * 500 - 250),
      );
      const target = rollTarget(caster, enemies, range);
      const [heading] = boulderHeadings(caster, enemies, bouldersPerCast(1), range);
      if (!target) {
        expect(heading).toBeUndefined();
        continue;
      }
      const d = Math.hypot(target.x, target.y);
      expect(heading).toEqual({ x: target.x / d, y: target.y / d });
    }
  });
});

describe('Landslide rut', () => {
  const { spacingPx, tileLengthPx, widthPx } = LANDSLIDE;

  /** Tiles a boulder lays over `frames` (px rolled per frame), counting as the spell does: laid so far is what it has placed. */
  function laying(
    level: SpellLevel,
    frames: readonly number[],
  ): { total: number; firstAt: number } {
    let travelled = 0;
    let laid = 0;
    let firstAt = NaN;
    for (const step of frames) {
      travelled += step;
      const due = rutTilesDue(level, travelled, laid);
      if (due > 0 && Number.isNaN(firstAt)) firstAt = travelled;
      laid += due;
    }
    return { total: laid, firstAt };
  }

  it('lays nothing below level 3, however far the boulder rolls', () => {
    for (const level of [1, 2] as const) {
      expect(rutTilesDue(level, 10_000, 0), String(level)).toBe(0);
      expect(laying(level, [200, 200, 200]).total).toBe(0);
    }
  });

  it('lays the first tile at the throw point, before the boulder has rolled a px', () => {
    expect(rutTilesDue(3, 0, 0)).toBe(1);
    expect(laying(3, [0]).firstAt).toBe(0);
    expect(rutTilesDue(3, 0, 1)).toBe(0);
    expect(rutTilesDue(3, spacingPx - 0.01, 1)).toBe(0);
    expect(rutTilesDue(3, spacingPx, 1)).toBe(1);
  });

  it('lays floor(travelled / spacing) + 1 in all, however the frames split', () => {
    const range = 207;
    const splits = [
      [0, range],
      [0, ...Array(207).fill(1)],
      [0, ...Array(30).fill(range / 30)],
      [0, 10, 150, 47],
      [0, 0, 0, range],
    ];
    for (const frames of splits) {
      expect(laying(3, frames).total, frames.length + ' frames').toBe(
        Math.floor(range / spacingPx) + 1,
      );
    }
  });

  it('pays every tile a long frame crossed, once', () => {
    expect(rutTilesDue(3, 3 * spacingPx + 1, 1)).toBe(3);
    expect(rutTilesDue(3, 3 * spacingPx + 1, 4)).toBe(0);
    expect(rutTilesDue(3, 4.5 * spacingPx, 4)).toBe(1);
  });

  it('owes nothing for a bad distance or spacing, or a distance the tiles already cover', () => {
    expect(rutTilesDue(3, Number.NaN, 0)).toBe(0);
    expect(rutTilesDue(3, Infinity, 0)).toBe(0);
    expect(rutTilesDue(3, -5, 0)).toBe(0);
    expect(rutTilesDue(3, 100, 0, 0)).toBe(0);
    expect(rutTilesDue(3, 100, 0, -5)).toBe(0);
    expect(rutTilesDue(3, 10, 5)).toBe(0);
  });

  it('overlaps neighbours, so the rut has no gap', () => {
    expect(spacingPx).toBeLessThan(tileLengthPx);
  });

  describe('onRut', () => {
    // One tile centred on the origin, lying along +x: the band is x in [-20, 20], y in [-22, 22].
    const along = (angle: number, at = { x: 0, y: 0 }): RutTile => ({
      x: at.x,
      y: at.y,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      tickDamage: 6,
    });
    const flat = [along(0)];
    const half = widthPx / 2;

    it('holds an enemy inside the band and outside neither end nor side', () => {
      expect(onRut({ x: 0, y: 0 }, flat)).toBe(true);
      expect(onRut({ x: tileLengthPx / 2, y: half }, flat)).toBe(true);
      expect(onRut({ x: 0, y: half + 0.01 }, flat)).toBe(false);
      expect(onRut({ x: 0, y: -(half + 0.01) }, flat)).toBe(false);
    });

    it('measures past the ends of the tile to its end points, not to a band without end', () => {
      // Beyond the end the nearest point is the end: a round cap of half the width.
      expect(onRut({ x: tileLengthPx / 2 + half, y: 0 }, flat)).toBe(true);
      expect(onRut({ x: tileLengthPx / 2 + half + 0.01, y: 0 }, flat)).toBe(false);
      // Diagonally off the end: half the width along the 45 degree ray, just inside and just out.
      const d = half / Math.SQRT2;
      expect(onRut({ x: tileLengthPx / 2 + d - 0.1, y: d - 0.1 }, flat)).toBe(true);
      expect(onRut({ x: tileLengthPx / 2 + d + 0.1, y: d + 0.1 }, flat)).toBe(false);
      expect(onRut({ x: -(tileLengthPx / 2 + half + 0.01), y: 0 }, flat)).toBe(false);
    });

    it('counts the enemy’s body radius', () => {
      expect(onRut({ x: 0, y: half + 8, bodyRadius: 8 }, flat)).toBe(true);
      expect(onRut({ x: 0, y: half + 8.01, bodyRadius: 8 }, flat)).toBe(false);
      expect(onRut({ x: 0, y: half + 8.01 }, flat)).toBe(false);
    });

    it('follows the heading of the tile', () => {
      const up = [along(Math.PI / 2)];
      expect(onRut({ x: 0, y: tileLengthPx / 2 }, up)).toBe(true);
      expect(onRut({ x: half, y: 0 }, up)).toBe(true);
      expect(onRut({ x: half + 0.01, y: 0 }, up)).toBe(false);
      const slant = [along(Math.PI / 4)];
      const r = tileLengthPx / 2 / Math.SQRT2;
      expect(onRut({ x: r, y: r }, slant)).toBe(true);
      // Across the band the reach is half the width, half / sqrt 2 on each axis of a 45 degree tile.
      const across = half / Math.SQRT2;
      expect(onRut({ x: -(across - 0.05), y: across - 0.05 }, slant)).toBe(true);
      expect(onRut({ x: -(across + 0.05), y: across + 0.05 }, slant)).toBe(false);
    });

    it('is on the rut when on any one of many tiles, and off it with none', () => {
      const trail = [0, 1, 2, 3].map((n) => along(0, { x: n * LANDSLIDE.spacingPx, y: 0 }));
      expect(onRut({ x: 3 * LANDSLIDE.spacingPx, y: 5 }, trail)).toBe(true);
      expect(onRut({ x: 4 * LANDSLIDE.spacingPx + tileLengthPx, y: 5 }, trail)).toBe(false);
      expect(onRut({ x: 0, y: 0 }, [])).toBe(false);
    });

    it('hits an enemy once a tick when many tiles overlap it', () => {
      // A tick, as the spell runs it: each enemy on any tile costs one hit.
      const trail = [0, 1, 2].map((n) => along(0, { x: n * 10, y: 0 }));
      const crossing = [0, 1].map((n) => ({
        ...along(Math.PI / 2, { x: 10, y: n * 5 }),
        tickDamage: 9,
      }));
      const enemies = [
        { x: 10, y: 2 },
        { x: 10, y: 400 },
        { x: 15, y: -50 },
      ];
      const hits = enemies.map((enemy) => {
        const under = ruttedBy(enemy, [...trail, ...crossing]);
        return under.length > 0 ? rutTickDamage(under) : 0;
      });
      expect(hits).toEqual([9, 0, 0]);
      expect(ruttedBy(enemies[0]!, [...trail, ...crossing]).length).toBe(5);
    });

    it('reports every tile an enemy stands on and charges the most any asks, never the sum', () => {
      const cheap = { ...along(0), tickDamage: 4 };
      const dear = { ...along(0, { x: 10, y: 0 }), tickDamage: 9 };
      const far = { ...along(0, { x: 500, y: 0 }), tickDamage: 100 };
      const under = ruttedBy({ x: 5, y: 0 }, [cheap, dear, far]);
      expect(under).toEqual([cheap, dear]);
      expect(rutTickDamage(under)).toBe(9);
      expect(rutTickDamage([])).toBe(0);
    });
  });

  describe('rutAlpha', () => {
    const { durationS, fadeS } = LANDSLIDE;

    it('is 1 until the fade begins, 0 at the end and after', () => {
      expect(rutAlpha(0)).toBe(1);
      expect(rutAlpha(durationS - fadeS)).toBe(1);
      expect(rutAlpha(durationS - fadeS / 2)).toBeCloseTo(0.5, 9);
      expect(rutAlpha(durationS)).toBe(0);
      expect(rutAlpha(durationS + 1)).toBe(0);
    });

    it('never rises with age, and stays within 0 and 1', () => {
      let last = 1;
      for (let age = 0; age <= durationS + 0.5; age += 0.01) {
        const alpha = rutAlpha(age);
        expect(alpha).toBeLessThanOrEqual(last + 1e-12);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
        last = alpha;
      }
    });

    it('holds full until the end for a fade of 0, and reads a bad age as gone', () => {
      expect(rutAlpha(durationS - 0.01, durationS, 0)).toBe(1);
      expect(rutAlpha(durationS, durationS, 0)).toBe(0);
      expect(rutAlpha(Number.NaN)).toBe(0);
    });
  });

  it('staggers for less than a tick, so the stop never runs into the next', () => {
    expect(rutStaggerS()).toBeGreaterThan(0);
    expect(rutStaggerS()).toBe(areaStaggerS(LANDSLIDE.staggerS, LANDSLIDE.tickEveryS));
    expect(rutStaggerS()).toBeLessThan(LANDSLIDE.tickEveryS);
    expect(areaStaggerS(10, LANDSLIDE.tickEveryS)).toBeLessThan(LANDSLIDE.tickEveryS);
  });

  describe('rutWindowOffset', () => {
    it('shows a different slice of the art as tiles are laid, wrapping', () => {
      const offsets = Array.from({ length: 12 }, (_, n) => rutWindowOffset(n, 120, 35));
      // The variants change with every tile, the slice only once a round of them is done.
      expect(offsets.slice(0, RUT_VARIANTS)).toEqual(Array(RUT_VARIANTS).fill(0));
      expect(offsets[RUT_VARIANTS]).toBe(35);
      expect(offsets[2 * RUT_VARIANTS]).toBe(70);
      expect(rutWindowOffset(3 * RUT_VARIANTS, 120, 35)).toBe(0);
    });

    it('keeps the window inside the art, and shows a window wider than the art whole', () => {
      for (let n = 0; n < 40; n += 1) {
        expect(rutWindowOffset(n, 120, 35) + 35).toBeLessThanOrEqual(120);
      }
      expect(rutWindowOffset(9, 30, 35)).toBe(0);
      expect(rutWindowOffset(9, 120, 35, 0)).toBe(0);
    });
  });
});

describe('Tremor', () => {
  it('pays floor(life / 2 s) tremors over the ring’s life, on any frame split', () => {
    const rng = createRng(5);
    for (const life of [2, 3.9, 8, 15.5, 60]) {
      for (const frame of [
        () => 1 / 60,
        () => 1 / 30,
        () => 0.25,
        () => 0.003 + rng.next() * 0.3,
      ]) {
        let clock = 0;
        let due = 0;
        while (clock < life - 1e-12) {
          const delta = Math.min(frame(), life - clock);
          due += tremorsDue(clock, delta);
          clock += delta;
        }
        expect(due, `life ${life}`).toBe(Math.floor(life / TREMOR.everyS + 1e-9));
      }
    }
  });

  it('pays nothing for a paused step, a short one or an interval that pays nothing', () => {
    expect(tremorsDue(1, 0)).toBe(0);
    expect(tremorsDue(0, TREMOR.everyS - 0.01)).toBe(0);
    expect(tremorsDue(0, 1, 0)).toBe(0);
    expect(tremorsDue(0, 1, -2)).toBe(0);
  });

  it('pays every tremor a long frame crossed', () => {
    expect(tremorsDue(0, 7)).toBe(3);
  });

  it('reaches the ring, a stone and the pad out', () => {
    expect(tremorReach(80, 14)).toBe(80 + 14 + TREMOR.padPx);
    expect(tremorReach(80, 14, 0)).toBe(94);
  });

  it('catches an enemy whose body edge is inside the reach, the reach counting as in', () => {
    const centre = { x: 0, y: 0 };
    const reach = tremorReach(80, 14);
    const outside = at(reach + 10.01, 0, 10);
    const edge = at(0, reach + 10, 10);
    const inside = at(30, 0, 8);
    expect(tremorTargets(centre, [outside, edge, inside], reach)).toEqual([edge, inside]);
    // With no body it is the centre that counts.
    expect(tremorTargets(centre, [at(reach + 0.01, 0), at(reach, 0)], reach)).toEqual([
      at(reach, 0),
    ]);
    expect(tremorTargets(centre, [], reach)).toEqual([]);
  });

  it('shoves the set distance out from the player, and not at all from dead on them', () => {
    const centre = { x: 10, y: 10 };
    expect(len(tremorPush(centre, { x: 60, y: 90 }))).toBeCloseTo(TREMOR.knockbackPx, 9);
    const push = tremorPush(centre, { x: 110, y: 10 });
    expect(push.x).toBeCloseTo(TREMOR.knockbackPx, 9);
    expect(push.y).toBeCloseTo(0, 9);
    expect(tremorPush(centre, centre)).toEqual({ x: 0, y: 0 });
  });
});

describe('Earthquake level 2: two quakes', () => {
  const { radius, targetRange } = BASE_QUAKE_STATS;
  const origin = { x: 0, y: 0 };

  /** A group of `n` enemies packed round `(cx, cy)`. */
  const group = (cx: number, cy: number, n: number): Body[] =>
    Array.from({ length: n }, (_, i) => at(cx + (i % 3) * 5, cy + Math.floor(i / 3) * 5));

  it('puts the first quake exactly where level 1 does, on the same stream', () => {
    const rng = createRng(21);
    for (let trial = 0; trial < 60; trial += 1) {
      const enemies = Array.from({ length: 12 }, () =>
        at(rng.next() * 300 - 150, rng.next() * 300 - 150),
      );
      const runA = createRng(trial + 1);
      const runB = createRng(trial + 1);
      const levelRng = createRng(500 + trial);
      const single = densestSpot(origin, enemies, radius, targetRange, runA);
      const spots = quakeSpots(origin, enemies, radius, targetRange, 2, runB, levelRng);
      expect(spots[0]).toEqual(single);
      // Whatever the first draw took from the run stream, the second cast reads on identically.
      expect(runB.next()).toBe(runA.next());
    }
  });

  it('never touches the level stream for a single quake', () => {
    const enemies = [...group(60, 0, 4), ...group(-100, 0, 4)];
    const levelRng = createRng(8);
    const untouched = createRng(8).next();
    const spots = quakeSpots(origin, enemies, radius, targetRange, 1, createRng(1), levelRng);
    expect(spots).toHaveLength(1);
    expect(levelRng.next()).toBe(untouched);
  });

  it('puts the second on the densest group outside the first, at least two radii away', () => {
    const big = group(0, 60, 6);
    const other = group(-140, -40, 3);
    const small = group(120, 20, 2);
    const spots = quakeSpots(
      origin,
      [...big, ...other, ...small],
      radius,
      targetRange,
      2,
      createRng(1),
      createRng(2),
    );
    expect(spots).toHaveLength(2);
    expect(dist(spots[0]!, at(big[0]!.x, big[0]!.y))).toBeLessThan(radius);
    expect(dist(spots[0]!, spots[1]!)).toBeGreaterThanOrEqual(QUAKE_SPLIT.minGapFactor * radius);
    // The three to the left are the densest left once the big group is covered.
    expect(dist(spots[1]!, at(other[0]!.x, other[0]!.y))).toBeLessThan(radius);
  });

  it('counts only the enemies the first quake leaves out', () => {
    // A tight group of 5 for the first; a second group of 3 far off; and 4 stragglers spread along
    // the first group’s edge. Those 4 are the densest thing near the first group but the first quake
    // already covers them, so they must not pull the second quake back onto it.
    const first = group(0, 0, 5);
    const straggle = [at(40, 0), at(40, 5), at(40, 10), at(40, 15)];
    const far = group(-200, 0, 3);
    const spots = quakeSpots(
      origin,
      [...first, ...straggle, ...far],
      radius,
      targetRange + 100,
      2,
      createRng(1),
      createRng(2),
    );
    expect(spots).toHaveLength(2);
    expect(dist(spots[1]!, at(-200, 0))).toBeLessThan(radius);
  });

  it('breaks a tie for the second on the level stream, never the run stream', () => {
    // A lone densest cluster for the first (a star round one enemy), then a four-way tie for the second.
    const star = [at(0, 0), at(70, 0), at(-70, 0), at(0, 70), at(0, -70)];
    const tied = [at(160, 0), at(-160, 0), at(0, 160), at(0, -160)];
    const run = createRng(4);
    const levelRng = createRng(9);
    const spots = quakeSpots(origin, [...star, ...tied], radius, targetRange, 2, run, levelRng);
    expect(spots).toHaveLength(2);
    expect(spots[0]).toEqual({ x: 0, y: 0 });
    expect(tied.some((e) => e.x === spots[1]!.x && e.y === spots[1]!.y)).toBe(true);
    // The first was no tie: no run draw. The second was: one level draw.
    expect(run.next()).toBe(createRng(4).next());
    const replay = createRng(9);
    replay.pick(tied);
    expect(levelRng.next()).toBe(replay.next());
  });

  it('opens one quake only when there is no second group', () => {
    const lone = group(0, 0, 5);
    expect(
      quakeSpots(origin, lone, radius, targetRange, 2, createRng(1), createRng(2)),
    ).toHaveLength(1);
    // A second group closer than two radii is not a second group.
    const close = [...lone, ...group(radius * 1.5, 0, 4)];
    const spots = quakeSpots(origin, close, radius, targetRange, 2, createRng(1), createRng(2));
    for (const spot of spots.slice(1)) {
      expect(dist(spot, spots[0]!)).toBeGreaterThanOrEqual(QUAKE_SPLIT.minGapFactor * radius);
    }
    expect(quakeSpots(origin, [], radius, targetRange, 2, createRng(1), createRng(2))).toEqual([
      origin,
    ]);
  });

  it('keeps its centres on enemies in the cast’s range', () => {
    const enemies = [...group(0, 0, 3), at(targetRange + 200, 0), at(targetRange + 200, 4)];
    const spots = quakeSpots(origin, enemies, radius, targetRange, 2, createRng(1), createRng(2));
    expect(spots).toHaveLength(1);
  });
});

describe('quake and seismic clocks', () => {
  it('lets two patches started at different times each pay all their ticks, on any frame split', () => {
    const rng = createRng(17);
    const rule = {
      radius: BASE_QUAKE_STATS.radius,
      durationS: BASE_QUAKE_STATS.duration,
      tickEveryS: BASE_QUAKE_STATS.tickRate,
    };
    const perPatch = BASE_QUAKE_STATS.duration / BASE_QUAKE_STATS.tickRate;
    for (const frame of [() => 1 / 60, () => 0.25, () => 0.003 + rng.next() * 0.4]) {
      let a = createArea({ x: 0, y: 0 }, rule);
      let b: ReturnType<typeof createArea> | undefined;
      let paidA = 0;
      let paidB = 0;
      let clock = 0;
      while (clock < 30) {
        const delta = frame();
        clock += delta;
        const stepA = advanceArea(a, delta);
        a = stepA.area;
        paidA += stepA.ticks;
        if (clock > 3.3 && !b) b = createArea({ x: 400, y: 0 }, rule);
        if (b) {
          const stepB = advanceArea(b, delta);
          b = stepB.area;
          paidB += stepB.ticks;
        }
      }
      expect(paidA).toBe(perPatch);
      expect(paidB).toBe(perPatch);
    }
  });

  it('pays a seismic patch its ticks: duration / tick', () => {
    let patch = createArea({ x: 0, y: 0 }, seismicPatchRule());
    let paid = 0;
    while (patch.remainingS > 0) {
      const step = advanceArea(patch, 1 / 60);
      patch = step.area;
      paid += step.ticks;
    }
    expect(paid).toBe(Math.floor(SEISMIC_SLAM.durationS / SEISMIC_SLAM.tickEveryS + 1e-9));
  });

  it('places a seismic patch with the rule’s numbers', () => {
    expect(seismicPatchRule()).toEqual({
      radius: SEISMIC_SLAM.radius,
      durationS: SEISMIC_SLAM.durationS,
      tickEveryS: SEISMIC_SLAM.tickEveryS,
    });
  });
});

describe('stagger caps', () => {
  const STEP_S = 0.005;

  it('holds each stop shorter than the tick that applies it, however far Persistence stretches it', () => {
    const quake = areaStaggerS(
      BASE_QUAKE_STATS.staggerDuration! * PERSISTENCE ** 4,
      BASE_QUAKE_STATS.tickRate,
    );
    expect(quake).toBeLessThan(BASE_QUAKE_STATS.tickRate);
    expect(quake).toBeGreaterThan(0);
    expect(seismicStaggerS()).toBeLessThan(SEISMIC_SLAM.tickEveryS);
    expect(seismicStaggerS()).toBe(SEISMIC_SLAM.staggerS);
    expect(TREMOR.staggerS).toBeLessThan(TREMOR.everyS);
  });

  /**
   * The fraction of a minute an enemy standing in one quake and one seismic patch spends stopped,
   * their ticks first landing `qFirst` and `sFirst` in, and the longest single stop.
   */
  function heldFraction(qFirst: number, sFirst: number, quakeStagger: number) {
    let remainingS = 0;
    let held = 0;
    let longest = 0;
    let run = 0;
    let nextQ = qFirst;
    let nextS = sFirst;
    const steps = Math.round(60 / STEP_S);
    for (let i = 0; i < steps; i += 1) {
      const nowS = i * STEP_S;
      while (nowS >= nextQ - 1e-9) {
        remainingS = applyStagger(remainingS, quakeStagger);
        nextQ += BASE_QUAKE_STATS.tickRate;
      }
      while (nowS >= nextS - 1e-9) {
        remainingS = applyStagger(remainingS, seismicStaggerS());
        nextS += SEISMIC_SLAM.tickEveryS;
      }
      if (staggerSpeedFactor(remainingS) === 0) {
        held += 1;
        run += STEP_S;
        longest = Math.max(longest, run);
      } else {
        run = 0;
      }
      remainingS = tickStagger(remainingS, STEP_S).remainingS;
    }
    return { fraction: held / steps, longest };
  }

  for (const [label, stretch] of [
    ['unstretched', 1],
    ['4 Persistence', PERSISTENCE ** 4],
  ] as const) {
    it(`${label}: an enemy in a quake and a seismic patch walks for a fifth of the time at any phasing`, () => {
      const quakeStagger = areaStaggerS(
        BASE_QUAKE_STATS.staggerDuration! * stretch,
        BASE_QUAKE_STATS.tickRate,
      );
      let worst = 0;
      let longest = 0;
      for (let q = 0; q < 10; q += 1) {
        for (let s = 0; s < 6; s += 1) {
          const run = heldFraction(
            (q / 10) * BASE_QUAKE_STATS.tickRate,
            (s / 6) * SEISMIC_SLAM.tickEveryS,
            quakeStagger,
          );
          worst = Math.max(worst, run.fraction);
          longest = Math.max(longest, run.longest);
        }
      }
      // Two patches at their ceilings together hold a target for well under all of the time.
      expect(worst).toBeLessThan(0.8);
      // And a stop longer than either tick means the two joined into one long lock, which the caps rule out.
      expect(longest).toBeLessThan(BASE_QUAKE_STATS.tickRate + SEISMIC_SLAM.tickEveryS);
    });
  }
});

describe('patchAllowed', () => {
  const at0 = { x: 0, y: 0 };

  it('places a patch with nothing live', () => {
    expect(patchAllowed(at0, [], MAX_LIVE_SEISMIC_PATCHES, SEISMIC_SLAM.radius)).toBe(true);
  });

  it('refuses one overlapping a live patch: a live centre closer than two radii', () => {
    const r = SEISMIC_SLAM.radius;
    expect(patchAllowed(at0, [{ x: 2 * r - 0.01, y: 0 }], 6, r)).toBe(false);
    expect(patchAllowed(at0, [{ x: 0, y: 5 }], 6, r)).toBe(false);
    expect(patchAllowed(at0, [{ x: 2 * r, y: 0 }], 6, r)).toBe(true);
  });

  it('refuses at the cap, however far apart', () => {
    const cap = MAX_LIVE_SEISMIC_PATCHES;
    const r = SEISMIC_SLAM.radius;
    const live = Array.from({ length: cap }, (_, i) => ({ x: 1000 * (i + 1), y: 0 }));
    expect(patchAllowed(at0, live, cap, r)).toBe(false);
    expect(patchAllowed(at0, live.slice(1), cap, r)).toBe(true);
    expect(patchAllowed(at0, [], 0, r)).toBe(false);
  });
});

describe('Aftershock', () => {
  const centre = { x: 0, y: 0 };
  const { radius } = BASE_QUAKE_STATS;

  it('deals five ticks, the number it is given otherwise', () => {
    expect(aftershockDamage(8)).toBe(8 * AFTERSHOCK.damageFactor);
    expect(aftershockDamage(8, 2)).toBe(16);
  });

  it('throws an enemy inside out to the pad past the rim, edge and all, along the way it came', () => {
    for (const [e, expectedR] of [
      [at(30, 40), radius + AFTERSHOCK.edgePadPx],
      [at(-20, 10, 12), radius + 12 + AFTERSHOCK.edgePadPx],
      [at(radius, 0, 5), radius + 5 + AFTERSHOCK.edgePadPx],
    ] as const) {
      const move = aftershockThrow(centre, e, radius, 0, false);
      const end = { x: e.x + move.x, y: e.y + move.y };
      expect(Math.hypot(end.x, end.y), JSON.stringify(e)).toBeCloseTo(expectedR, 9);
      // Straight out: the move is parallel to the way the enemy sits from the centre.
      expect(move.x * e.y - move.y * e.x).toBeCloseTo(0, 9);
      expect(move.x * e.x + move.y * e.y).toBeGreaterThan(0);
    }
  });

  it('ends with the enemy’s edge outside the radius', () => {
    const rng = createRng(2);
    for (let i = 0; i < 100; i += 1) {
      const e = at(rng.next() * 160 - 80, rng.next() * 160 - 80, rng.next() * 20);
      const move = aftershockThrow(centre, e, radius, i, false);
      const end = Math.hypot(e.x + move.x, e.y + move.y);
      if (Math.hypot(e.x, e.y) < radius + e.bodyRadius! + AFTERSHOCK.edgePadPx) {
        expect(end - e.bodyRadius!).toBeGreaterThanOrEqual(radius + AFTERSHOCK.edgePadPx - 1e-9);
      } else {
        expect(move).toEqual({ x: 0, y: 0 });
      }
    }
  });

  it('leaves an enemy already past the edge where it is', () => {
    const far = at(radius + 50, 0);
    expect(aftershockThrow(centre, far, radius, 0, false)).toEqual({ x: 0, y: 0 });
    const justOut = at(radius + AFTERSHOCK.edgePadPx, 0);
    expect(aftershockThrow(centre, justOut, radius, 0, false)).toEqual({ x: 0, y: 0 });
  });

  it('sends an enemy on the centre out along an angle set by its index, and no two the same', () => {
    const angles = [0, 1, 2, 3, 4].map((i) => {
      const move = aftershockThrow(centre, at(0, 0), radius, i, false);
      expect(len(move)).toBeCloseTo(radius + AFTERSHOCK.edgePadPx, 9);
      return Math.atan2(move.y, move.x);
    });
    expect(new Set(angles.map((a) => a.toFixed(6))).size).toBe(5);
    // Deterministic: the same index, the same throw.
    expect(aftershockThrow(centre, at(0, 0), radius, 3, false)).toEqual(
      aftershockThrow(centre, at(0, 0), radius, 3, false),
    );
  });

  it('throws a boss at most the clamp, in the same direction', () => {
    const boss = at(10, 0, 40);
    const free = aftershockThrow(centre, boss, radius, 0, false);
    const clamped = aftershockThrow(centre, boss, radius, 0, true);
    expect(len(free)).toBeGreaterThan(AFTERSHOCK.bossMaxThrowPx);
    expect(len(clamped)).toBeCloseTo(AFTERSHOCK.bossMaxThrowPx, 9);
    expect(clamped.y).toBeCloseTo(0, 9);
    expect(clamped.x).toBeGreaterThan(0);
    // A boss that needs less than the clamp is thrown what it needs.
    const nearEdge = at(radius + 30, 0, 40);
    expect(len(aftershockThrow(centre, nearEdge, radius, 0, true))).toBeCloseTo(18, 9);
    const needs = at(radius + 40 + AFTERSHOCK.edgePadPx - 10, 0, 40);
    expect(len(aftershockThrow(centre, needs, radius, 0, true))).toBeCloseTo(10, 9);
  });
});

describe('Earth Companion levels', () => {
  const base = BASE_COMPANION_STATS.earth_companion.attackCooldown;

  it('attacks twice as fast from level 2, and only the Earth Companion does', () => {
    expect(
      LEVELS.map((level) => earthCompanionAttackCooldown('earth_companion', base, level)),
    ).toEqual([
      base,
      base * EARTH_COMPANION_SWEEP.cooldownFactor,
      base * EARTH_COMPANION_SWEEP.cooldownFactor,
    ]);
    for (const id of ['fire_companion', 'ice_companion', 'lightning_companion']) {
      for (const level of LEVELS) expect(earthCompanionAttackCooldown(id, 1.4, level)).toBe(1.4);
    }
  });

  it('composes over Lightning’s rule without either touching the other’s companion', () => {
    const composed = (id: string, level: SpellLevel): number =>
      earthCompanionAttackCooldown(id, companionAttackCooldown(id, 1.6, level), level);
    for (const level of LEVELS) {
      expect(composed('lightning_companion', level)).toBe(
        companionAttackCooldown('lightning_companion', 1.6, level),
      );
      expect(composed('earth_companion', level)).toBe(
        earthCompanionAttackCooldown('earth_companion', 1.6, level),
      );
      expect(composed('fire_companion', level)).toBe(1.6);
    }
    expect(composed('earth_companion', 2)).toBe(0.8);
    expect(composed('lightning_companion', 2)).toBe(0.8);
  });

  describe('front arc', () => {
    const pos = { x: 100, y: 100 };
    const polar = (r: number, deg: number, radius?: number): Body =>
      at(pos.x + r * Math.cos(deg * DEG), pos.y + r * Math.sin(deg * DEG), radius);

    it('catches what stands inside 60 degrees either side of the aim, edges inclusive', () => {
      const inside = [polar(30, 0), polar(30, 60), polar(30, -60)];
      const outside = [polar(30, 61), polar(30, -61), polar(30, 180)];
      expect(earthSweepTargets(pos, 0, [...outside, ...inside])).toHaveLength(3);
      expect(earthSweepTargets(pos, 0, outside)).toEqual([]);
    });

    it('measures the reach to the enemy’s edge, inclusive', () => {
      const reach = EARTH_COMPANION_SWEEP.reachPx;
      expect(earthSweepTargets(pos, 0, [polar(reach + 10, 0, 10)])).toHaveLength(1);
      expect(earthSweepTargets(pos, 0, [polar(reach + 10.01, 0, 10)])).toEqual([]);
    });

    it('leaves out the enemy the swing landed on', () => {
      const target = polar(20, 0);
      const other = polar(30, 10);
      expect(earthSweepTargets(pos, 0, [target, other], [target])).toEqual([other]);
      expect(earthSweepTargets(pos, 0, [target, other], new Set([target, other]))).toEqual([]);
    });

    it('takes at most four, nearest first', () => {
      const six = [
        polar(40, 0),
        polar(20, 0),
        polar(35, 20),
        polar(35, -20),
        polar(10, 5),
        polar(30, 10),
      ];
      const caught = earthSweepTargets(pos, 0, six);
      expect(caught).toHaveLength(EARTH_COMPANION_SWEEP.maxTargets);
      expect(caught).toEqual([six[4], six[1], six[5], six[2]]);
    });

    it('shoves half the companion’s knockback, away from it', () => {
      const push = earthSweepPush(pos, { x: 150, y: 100 }, 80, pos);
      expect(push.x).toBeCloseTo(80 * EARTH_COMPANION_SWEEP.knockbackFactor, 9);
      expect(push.y).toBeCloseTo(0, 9);
      expect(earthSweepPush(pos, { x: 150, y: 100 }, 0, pos)).toEqual({ x: 0, y: 0 });
      // The same rule as every Earth shove.
      expect(earthSweepPush(pos, pos, 80, { x: 60, y: 100 })).toEqual(
        knockbackVector(pos, pos, 40, { x: 60, y: 100 }),
      );
    });
  });
});

describe('no Earth level rule has a stun number', () => {
  it('carries no stun key in any rule', () => {
    const rules = {
      SPIKE_FAN,
      SPLINTER,
      BOULDER_SPLIT,
      TREMOR,
      QUAKE_SPLIT,
      AFTERSHOCK,
      EARTH_COMPANION_SWEEP,
      SEISMIC_SLAM,
      LANDSLIDE,
    };
    for (const [name, rule] of Object.entries(rules)) {
      for (const key of Object.keys(rule)) expect(key, name).not.toMatch(/stun/i);
    }
  });
});

describe('boss crowd control, every Earth level 3 stagger at once', () => {
  const STEP_S = 0.01;
  const WINDOW_S = BOSS.cycleS;

  interface StaggerSource {
    name: string;
    period: number;
    /** The stagger before Persistence. */
    staggerS: number;
  }

  /** Every source that staggers, at the cadences of the Haste clamp. */
  const all: StaggerSource[] = [
    {
      name: 'quake tick',
      period: BASE_QUAKE_STATS.tickRate,
      staggerS: areaStaggerS(BASE_QUAKE_STATS.staggerDuration!, BASE_QUAKE_STATS.tickRate),
    },
    { name: 'seismic tick', period: SEISMIC_SLAM.tickEveryS, staggerS: seismicStaggerS() },
    { name: 'tremor', period: TREMOR.everyS, staggerS: TREMOR.staggerS },
    { name: 'rut tick', period: LANDSLIDE.tickEveryS, staggerS: rutStaggerS() },
  ];

  /** One boss cycle with `sources` landing from `firsts`, staggers stretched by `mul`, DR on or off. */
  function fightWindow(
    sources: readonly StaggerSource[],
    firsts: readonly number[],
    mul: number,
    diminishing: boolean,
  ): { staggeredFraction: number; chargeTravelPx: number } {
    let cc: BossCcState = NO_BOSS_CC;
    let remainingS = 0;
    let cycle = startBossCycle();
    const next = [...firsts];
    const steps = Math.round(WINDOW_S / STEP_S);
    let staggered = 0;
    let chargeTravelPx = 0;
    for (let i = 0; i < steps; i += 1) {
      const nowS = i * STEP_S;
      sources.forEach((source, s) => {
        while (nowS >= next[s]! - 1e-9) {
          const length = source.staggerS * mul;
          const applied = diminishing ? resistBossCc(cc, 'stagger', length, nowS) : undefined;
          if (applied) cc = applied.state;
          remainingS = applyStagger(remainingS, applied ? applied.durationS : length);
          next[s]! += source.period;
        }
      });
      const speedFactor = staggerSpeedFactor(remainingS);
      if (speedFactor === 0) staggered += 1;
      const wasCharging = cycle.phase === 'charge';
      const step = stepBossCycle(cycle, STEP_S, { x: 0, y: 0 }, { x: 500, y: 0 }, speedFactor);
      cycle = step.cycle;
      if (wasCharging) chargeTravelPx += Math.hypot(step.velocity.x, step.velocity.y) * STEP_S;
      remainingS = tickStagger(remainingS, STEP_S).remainingS;
    }
    return { staggeredFraction: staggered / steps, chargeTravelPx };
  }

  it('runs at the cadences the plan names', () => {
    expect(all.map((s) => [Number(s.period.toFixed(3)), Number(s.staggerS.toFixed(3))])).toEqual([
      [0.5, 0.2],
      [0.3, 0.1],
      [2, 0.4],
      [0.3, 0.15],
    ]);
  });

  for (const [label, mul] of [
    ['unstretched', 1],
    ['4 Persistence', PERSISTENCE ** 4],
  ] as const) {
    it(`${label}: with diminishing returns the boss is stopped for well under its cycle, and its charge lands, at any phasing`, () => {
      const phases = [0, 0.5];
      let worstFraction = 0;
      let leastTravel = Infinity;
      for (let mask = 0; mask < 2 ** all.length; mask += 1) {
        const firsts = all.map((s, i) => s.period * phases[(mask >> i) & 1]!);
        const free = fightWindow(all, firsts, mul, true);
        worstFraction = Math.max(worstFraction, free.staggeredFraction);
        leastTravel = Math.min(leastTravel, free.chargeTravelPx);
      }
      expect(worstFraction).toBeLessThan(0.6);
      expect(leastTravel).toBeGreaterThan(0.5 * BOSS.chargeSpeed * BOSS.chargeS);
    });
  }

  it('holds each source alone to less than half a cycle too', () => {
    for (const source of all) {
      const free = fightWindow([source], [source.period], PERSISTENCE ** 4, true);
      expect(free.staggeredFraction, source.name).toBeLessThan(0.5);
      expect(free.chargeTravelPx, source.name).toBeGreaterThan(
        0.5 * BOSS.chargeSpeed * BOSS.chargeS,
      );
    }
  });
});
