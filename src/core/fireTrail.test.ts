import { describe, expect, it } from 'vitest';
import { FIRE_TRAIL, SCORCH_VARIANTS } from '../config/fireLevels';
import type { SpellLevel } from '../config/spellLevels';
import {
  hasFireTrail,
  inSweptSector,
  ringsDue,
  scorchPieces,
  scorchSlots,
  stepTrailClock,
  trailBurnDps,
  trailRingRadii,
  type TrailClock,
} from './fireTrail';
import { inArc } from './fireWave';
import { createRng } from './rng';

/** #327: the Fire Wave level 3 burnt ground, checked without an engine. */

const DEG = Math.PI / 180;
const ORIGIN = { x: 100, y: -40 };
const HEADING = 0.7;
const BASE_RANGE = 180;

describe('hasFireTrail', () => {
  it('starts at level 3', () => {
    const levels: SpellLevel[] = [1, 2, 3];
    expect(levels.map(hasFireTrail)).toEqual([false, false, true]);
  });
});

describe('scorchSlots', () => {
  it('lays 4, 6, 8 and 11 pieces on four rings of the 150 degree wave', () => {
    const slots = scorchSlots(150);
    const counts = [0, 1, 2, 3].map((ring) => slots.filter((s) => s.ring === ring).length);
    expect(counts).toEqual([4, 6, 8, 11]);
    expect(slots).toHaveLength(29);
  });

  it('runs the rings outward, inside the arc', () => {
    const slots = scorchSlots(150);
    const halfArc = 75 * DEG;
    for (const s of slots)
      expect(Math.abs(s.angle)).toBeLessThanOrEqual(FIRE_TRAIL.arcInset * halfArc + 1e-9);
    const fracs = [...new Set(slots.map((s) => s.rFrac))];
    expect(fracs).toEqual([...fracs].sort((a, b) => a - b));
    expect(fracs[0]).toBeCloseTo(FIRE_TRAIL.innerFrac);
    expect(fracs[fracs.length - 1]).toBeCloseTo(FIRE_TRAIL.outerFrac);
  });

  it('lays fewer for a narrower wave', () => {
    expect(scorchSlots(95).length).toBeLessThan(scorchSlots(150).length);
  });
});

describe('scorchPieces', () => {
  const lay = (range = BASE_RANGE, seed = 5) =>
    scorchPieces(ORIGIN, HEADING, range, 150, createRng(seed));

  it('replays a seed', () => {
    expect(lay()).toEqual(lay());
    expect(lay(BASE_RANGE, 6)).not.toEqual(lay());
  });

  it('lays the same number at any range', () => {
    expect(lay(BASE_RANGE * 1.12 ** 3)).toHaveLength(lay(BASE_RANGE).length);
    expect(lay()).toHaveLength(scorchSlots(150).length);
  });

  it('keeps every centre inside the fan, give or take its jitter', () => {
    for (const range of [BASE_RANGE, BASE_RANGE * 1.12 ** 3]) {
      const jitter =
        FIRE_TRAIL.jitter * ((FIRE_TRAIL.step * FIRE_TRAIL.pieceSpan) / BASE_RANGE) * range;
      for (const p of lay(range)) {
        expect(inArc(ORIGIN, HEADING, 75 * DEG, p, jitter)).toBe(true);
        expect(Math.hypot(p.x - ORIGIN.x, p.y - ORIGIN.y)).toBeLessThanOrEqual(range);
      }
    }
  });

  it('turns, flips and sizes each piece from the rule', () => {
    for (const p of lay()) {
      expect(p.rotation).toBeGreaterThanOrEqual(0);
      expect(p.rotation).toBeLessThan(Math.PI * 2);
      expect(p.scale).toBeGreaterThanOrEqual(FIRE_TRAIL.scale.min);
      expect(p.scale).toBeLessThanOrEqual(FIRE_TRAIL.scale.max);
      expect(Number.isInteger(p.variant)).toBe(true);
      expect(p.variant).toBeGreaterThanOrEqual(0);
      expect(p.variant).toBeLessThan(SCORCH_VARIANTS);
    }
  });

  it('puts the flames on four middle-ring pieces, never the first ring or the rim', () => {
    const pieces = lay();
    const flames = pieces.filter((p) => p.flame);
    expect(flames).toHaveLength(FIRE_TRAIL.flames);
    const last = Math.max(...pieces.map((p) => p.ring));
    for (const f of flames) {
      expect(f.ring).toBeGreaterThan(0);
      expect(f.ring).toBeLessThan(last);
    }
  });

  it('draws the same count from the RNG at any range, so timing never moves the next draw', () => {
    const a = createRng(9);
    const b = createRng(9);
    scorchPieces(ORIGIN, HEADING, BASE_RANGE, 150, a);
    scorchPieces(ORIGIN, HEADING, BASE_RANGE * 2, 150, b);
    expect(a.next()).toBe(b.next());
  });
});

describe('trailRingRadii', () => {
  it('scales the rings with the range', () => {
    expect(trailRingRadii(BASE_RANGE).map(Math.round)).toEqual([45, 81, 117, 153]);
    expect(trailRingRadii(360)[0]).toBeCloseTo(90);
  });
});

describe('ringsDue', () => {
  const radii = [45, 81, 117, 153];
  const LAG = 22;

  it('waits for the rim to get lagFrac of a span past a ring', () => {
    expect(ringsDue(0, 60, radii, LAG, 180)).toEqual([]);
    expect(ringsDue(0, 70, radii, LAG, 180)).toEqual([0]);
  });

  it('lays every ring on one long step', () => {
    expect(ringsDue(0, 180, radii, LAG, 180)).toEqual([0, 1, 2, 3]);
  });

  it('lays each ring once however the steps split', () => {
    for (const grow of [1, 7, 13, 40]) {
      const laid: number[] = [];
      for (let prev = 0; prev < 180; prev += grow) {
        laid.push(...ringsDue(prev, Math.min(180, prev + grow), radii, LAG, 180));
      }
      expect(laid).toEqual([0, 1, 2, 3]);
    }
  });

  it('lays the outer ring when the rim is 175 out', () => {
    expect(ringsDue(174, 175, radii, LAG, 180)).toEqual([3]);
  });

  it('clamps a ring that would be due past the range to the range', () => {
    expect(ringsDue(179, 180, [170], 30, 180)).toEqual([0]);
  });

  it('lays nothing for a rim that is not moving forward', () => {
    expect(ringsDue(50, 50, radii, LAG, 180)).toEqual([]);
    expect(ringsDue(100, 50, radii, LAG, 180)).toEqual([]);
    expect(ringsDue(0, Number.NaN, radii, LAG, 180)).toEqual([]);
    expect(ringsDue(Number.NaN, 100, radii, LAG, 180)).toEqual([]);
  });
});

describe('inSweptSector', () => {
  const half = 75 * DEG;
  const at = (dist: number, off = 0) => ({
    x: ORIGIN.x + Math.cos(HEADING + off) * dist,
    y: ORIGIN.y + Math.sin(HEADING + off) * dist,
  });

  it('holds an enemy inside the band and the arc', () => {
    expect(inSweptSector(ORIGIN, HEADING, half, 20, 150, at(80), 6)).toBe(true);
  });

  it('lets go of one the rim has not reached', () => {
    expect(inSweptSector(ORIGIN, HEADING, half, 20, 100, at(140), 6)).toBe(false);
  });

  it('lets go of one inside the inner edge', () => {
    expect(inSweptSector(ORIGIN, HEADING, half, 40, 150, at(10), 6)).toBe(false);
  });

  it('lets go of one outside the arc', () => {
    expect(inSweptSector(ORIGIN, HEADING, half, 20, 150, at(80, Math.PI), 6)).toBe(false);
  });

  it('holds one whose body straddles the edge', () => {
    expect(inSweptSector(ORIGIN, HEADING, half, 20, 100, at(104), 6)).toBe(true);
    expect(inSweptSector(ORIGIN, HEADING, half, 20, 150, at(80, half + 0.05), 6)).toBe(true);
  });

  it('is empty until the rim is past the inner edge', () => {
    expect(inSweptSector(ORIGIN, HEADING, half, 20, 20, at(20), 6)).toBe(false);
    expect(inSweptSector(ORIGIN, HEADING, half, 20, 10, at(15), 6)).toBe(false);
  });
});

describe('stepTrailClock', () => {
  const fresh = (): TrailClock => ({ ageS: 0, closedAtS: null, tickLeftS: 0 });

  it('ticks on the first frame, then every tickEveryS', () => {
    const clock = fresh();
    let ticks = 0;
    for (let i = 0; i < 60; i += 1) if (stepTrailClock(clock, 1 / 60).tick) ticks += 1;
    expect(ticks).toBe(4);
  });

  it('ticks at most once a frame, however long', () => {
    const clock = fresh();
    expect(stepTrailClock(clock, 1).tick).toBe(true);
    expect(stepTrailClock(clock, 1).tick).toBe(true);
    const spent = fresh();
    stepTrailClock(spent, 0.01);
    expect(stepTrailClock(spent, 0.01).tick).toBe(false);
  });

  it('never expires while its wave is out', () => {
    const clock = fresh();
    expect(stepTrailClock(clock, 100).expired).toBe(false);
  });

  it('expires holdS after its wave closes', () => {
    const clock = fresh();
    stepTrailClock(clock, 0.7);
    clock.closedAtS = clock.ageS;
    expect(stepTrailClock(clock, FIRE_TRAIL.holdS - 0.05).expired).toBe(false);
    expect(stepTrailClock(clock, 0.06).expired).toBe(true);
  });

  it('draws whole until the fade, then fades linearly to nothing', () => {
    const clock: TrailClock = { ageS: 5, closedAtS: 5, tickLeftS: 1 };
    const { holdS, fadeS, alpha } = FIRE_TRAIL;
    expect(stepTrailClock(clock, holdS - fadeS - 0.01).alpha).toBeCloseTo(alpha);
    const half = stepTrailClock(clock, 0.01 + fadeS / 2).alpha;
    expect(half).toBeCloseTo(alpha / 2);
    expect(stepTrailClock(clock, fadeS).alpha).toBe(0);
  });
});

describe('trailBurnDps', () => {
  it('is half the wave burn', () => {
    expect(trailBurnDps(8)).toBe(4);
    expect(trailBurnDps(8, 0.25)).toBe(2);
  });
});
