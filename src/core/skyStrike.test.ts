import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { BASE_METEOR_STATS, METEOR_FALL_ANGLE_DEG, METEOR_FALL_PX } from '../config/strikes';
import {
  advanceTelegraphs,
  blastFalloff,
  createTelegraph,
  fallHeading,
  fallPosition,
  fallProgress,
  fallRotation,
  pickImpactPoint,
  strikeTargets,
  type Telegraph,
} from './skyStrike';

const ORIGIN = { x: 0, y: 0 };
/** Meteor's `fallDelay` (spec §9.2). */
const DELAY = 1;
/** Meteor's `aoeRadius`. */
const RADIUS = 110;

/** Step `telegraphs` in frames of `frameS` until `total` seconds have passed, returning when each landed. */
function landingTimes(telegraphs: Telegraph[], frameS: number, total: number): number[] {
  const times: number[] = [];
  let live = telegraphs;
  let elapsed = 0;
  while (elapsed < total - 1e-9) {
    elapsed += frameS;
    const step = advanceTelegraphs(live, frameS);
    for (let i = 0; i < step.landed.length; i += 1) times.push(elapsed);
    live = step.live;
  }
  return times;
}

describe('pickImpactPoint (#138)', () => {
  it('is deterministic per seed', () => {
    const a = pickImpactPoint(createRng(7), { x: 100, y: 50 }, 24);
    const b = pickImpactPoint(createRng(7), { x: 100, y: 50 }, 24);
    expect(a).toEqual(b);
    const other = pickImpactPoint(createRng(8), { x: 100, y: 50 }, 24);
    expect(other).not.toEqual(a);
  });

  it('never lands further from the target than the scatter', () => {
    const rng = createRng(3);
    for (let i = 0; i < 500; i += 1) {
      const point = pickImpactPoint(rng, { x: 100, y: 50 }, 24);
      expect(Math.hypot(point.x - 100, point.y - 50)).toBeLessThanOrEqual(24 + 1e-9);
    }
  });

  it('spreads over the whole disc rather than bunching at the centre', () => {
    // Uniform over a disc puts three quarters of the points outside half the radius.
    const rng = createRng(11);
    let outer = 0;
    const n = 2000;
    for (let i = 0; i < n; i += 1) {
      const point = pickImpactPoint(rng, ORIGIN, 24);
      if (Math.hypot(point.x, point.y) > 12) outer += 1;
    }
    expect(outer / n).toBeGreaterThan(0.7);
    expect(outer / n).toBeLessThan(0.8);
  });

  it('lands on the target itself with no scatter, without touching the stream', () => {
    const rng = createRng(5);
    const before = createRng(5).next();
    expect(pickImpactPoint(rng, { x: 3, y: 4 }, 0)).toEqual({ x: 3, y: 4 });
    expect(pickImpactPoint(rng, { x: 3, y: 4 }, -10)).toEqual({ x: 3, y: 4 });
    expect(pickImpactPoint(rng, { x: 3, y: 4 }, Number.NaN)).toEqual({ x: 3, y: 4 });
    expect(rng.next()).toBe(before);
  });

  it('returns a copy, never the target object', () => {
    const target = { x: 3, y: 4 };
    expect(pickImpactPoint(createRng(1), target, 0)).not.toBe(target);
  });
});

describe('createTelegraph', () => {
  it('commits to the point with the full delay and reach', () => {
    expect(createTelegraph({ x: 10, y: 20 }, DELAY, RADIUS)).toEqual({
      x: 10,
      y: 20,
      remainingS: DELAY,
      fallS: DELAY,
      radius: RADIUS,
    });
  });

  it('lands on the next frame for a delay that is not a positive number', () => {
    for (const delay of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const telegraph = createTelegraph(ORIGIN, delay, RADIUS);
      expect(telegraph.remainingS, `${delay}`).toBe(0);
      expect(advanceTelegraphs([telegraph], 1 / 60).landed).toHaveLength(1);
    }
  });

  it('clamps a negative reach to nothing', () => {
    expect(createTelegraph(ORIGIN, DELAY, -5).radius).toBe(0);
  });
});

describe('advanceTelegraphs', () => {
  it('lands in the frame the run clock crosses the delay, whatever the frame length', () => {
    // A 60 fps frame, a 30 fps frame, a scaled run's long frame and an uneven
    // one: each lands in the first frame that ends at or after 1 s.
    for (const frameS of [1 / 60, 1 / 30, 0.25, 0.3]) {
      const [landed] = landingTimes([createTelegraph(ORIGIN, DELAY, RADIUS)], frameS, 2);
      const expected = Math.ceil(DELAY / frameS - 1e-9) * frameS;
      expect(landed, `frame ${frameS}`).toBeCloseTo(expected, 9);
      expect(landed, `frame ${frameS}`).toBeGreaterThanOrEqual(DELAY - 1e-9);
      expect(landed, `frame ${frameS}`).toBeLessThan(DELAY + frameS);
    }
  });

  it('lands exactly once', () => {
    const times = landingTimes([createTelegraph(ORIGIN, DELAY, RADIUS)], 1 / 60, 3);
    expect(times).toHaveLength(1);
  });

  it('lands a telegraph in the frame that spends its delay to the second', () => {
    const step = advanceTelegraphs([createTelegraph(ORIGIN, 0.5, RADIUS)], 0.5);
    expect(step.landed).toHaveLength(1);
    expect(step.live).toHaveLength(0);
  });

  it('carries the committed point and reach onto the landing, at zero remaining', () => {
    const step = advanceTelegraphs([createTelegraph({ x: 40, y: -7 }, 0.2, RADIUS)], 1);
    expect(step.landed).toEqual([{ x: 40, y: -7, remainingS: 0, fallS: 0.2, radius: RADIUS }]);
  });

  it('counts a live telegraph down by the frame', () => {
    const step = advanceTelegraphs([createTelegraph(ORIGIN, DELAY, RADIUS)], 0.25);
    expect(step.live).toEqual([{ ...ORIGIN, remainingS: 0.75, fallS: DELAY, radius: RADIUS }]);
    expect(step.landed).toEqual([]);
  });

  it('keeps cast order across both lists and lands several in one long frame', () => {
    const first = createTelegraph({ x: 1, y: 0 }, 0.2, RADIUS);
    const second = createTelegraph({ x: 2, y: 0 }, 5, RADIUS);
    const third = createTelegraph({ x: 3, y: 0 }, 0.9, RADIUS);
    const step = advanceTelegraphs([first, second, third], 1);
    expect(step.landed.map((t) => t.x)).toEqual([1, 3]);
    expect(step.live.map((t) => t.x)).toEqual([2]);
  });

  it('leaves everything alone on a bad or zero-length frame', () => {
    const telegraphs = [createTelegraph(ORIGIN, DELAY, RADIUS)];
    for (const deltaS of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const step = advanceTelegraphs(telegraphs, deltaS);
      expect(step.live, `${deltaS}`).toEqual(telegraphs);
      expect(step.landed, `${deltaS}`).toEqual([]);
    }
  });

  it('does not mutate its input', () => {
    const telegraphs = [createTelegraph(ORIGIN, DELAY, RADIUS)];
    const snapshot = JSON.stringify(telegraphs);
    advanceTelegraphs(telegraphs, 0.5);
    expect(JSON.stringify(telegraphs)).toBe(snapshot);
  });
});

describe('strikeTargets', () => {
  const crowd = [
    { id: 'centre', x: 0, y: 0 },
    { id: 'edge', x: RADIUS, y: 0 },
    { id: 'diagonal', x: 70, y: 70 }, // ~99 px
    { id: 'outside', x: RADIUS + 1, y: 0 },
    { id: 'far', x: 500, y: 500 },
  ];

  it('reaches everything within the radius, the edge included, and nothing beyond', () => {
    expect(strikeTargets(ORIGIN, crowd, RADIUS).map((c) => c.id)).toEqual([
      'centre',
      'edge',
      'diagonal',
    ]);
  });

  it('singles nobody out: the landing is a point, not a target', () => {
    // A dead target or one that walked off changes nothing about who is hit.
    const withoutOriginal = crowd.filter((c) => c.id !== 'centre');
    expect(strikeTargets(ORIGIN, withoutOriginal, RADIUS).map((c) => c.id)).toEqual([
      'edge',
      'diagonal',
    ]);
  });

  it('hits only what stands on the point with no reach, and nothing for a bad one', () => {
    expect(strikeTargets(ORIGIN, crowd, 0).map((c) => c.id)).toEqual(['centre']);
    expect(strikeTargets(ORIGIN, crowd, -1)).toEqual([]);
    expect(strikeTargets(ORIGIN, crowd, Number.NaN)).toEqual([]);
  });
});

/** CO-167: the meteor comes in along a straight 35° path and reaches its point on landing. */
describe('the fall', () => {
  const IMPACT = { x: 200, y: 150 };
  const sin = Math.sin((METEOR_FALL_ANGLE_DEG * Math.PI) / 180);
  const cos = Math.cos((METEOR_FALL_ANGLE_DEG * Math.PI) / 180);

  it('heads down and to the right, 35° off vertical, as a unit vector', () => {
    expect(METEOR_FALL_ANGLE_DEG).toBe(35);
    const heading = fallHeading();
    expect(heading.x).toBeCloseTo(sin, 12);
    expect(heading.y).toBeCloseTo(cos, 12);
    expect(Math.hypot(heading.x, heading.y)).toBeCloseTo(1, 12);
    expect(heading.x).toBeGreaterThan(0);
    expect(heading.y).toBeGreaterThan(heading.x);
  });

  it('starts 300 px back along the heading, up and to the left of the point', () => {
    expect(METEOR_FALL_PX).toBe(300);
    const start = fallPosition(IMPACT, 0);
    expect(start.x).toBeCloseTo(IMPACT.x - 300 * sin, 9);
    expect(start.y).toBeCloseTo(IMPACT.y - 300 * cos, 9);
    expect(Math.hypot(IMPACT.x - start.x, IMPACT.y - start.y)).toBeCloseTo(300, 9);
  });

  it('ends on the impact point', () => {
    const end = fallPosition(IMPACT, 1);
    expect(end.x).toBeCloseTo(IMPACT.x, 12);
    expect(end.y).toBeCloseTo(IMPACT.y, 12);
  });

  it('moves along a straight line at constant speed', () => {
    const start = fallPosition(IMPACT, 0);
    for (const t of [0.25, 0.5, 0.75]) {
      const at = fallPosition(IMPACT, t);
      expect(at.x, `${t}`).toBeCloseTo(start.x + (IMPACT.x - start.x) * t, 9);
      expect(at.y, `${t}`).toBeCloseTo(start.y + (IMPACT.y - start.y) * t, 9);
    }
  });

  it('holds progress outside 0-1 to the ends, so it never overshoots', () => {
    expect(fallPosition(IMPACT, 1.5)).toEqual(fallPosition(IMPACT, 1));
    expect(fallPosition(IMPACT, -1)).toEqual(fallPosition(IMPACT, 0));
    expect(fallPosition(IMPACT, Number.NaN)).toEqual(fallPosition(IMPACT, 1));
  });

  it('turns art drawn falling straight down by -35°, so the rock leads', () => {
    const rotation = fallRotation();
    expect(rotation).toBeCloseTo((-35 * Math.PI) / 180, 12);
    // Phaser turns (x, y) by r to (x cos r - y sin r, x sin r + y cos r): the
    // art's downward axis (0, 1) must come out along the heading.
    const heading = fallHeading();
    expect(-Math.sin(rotation)).toBeCloseTo(heading.x, 12);
    expect(Math.cos(rotation)).toBeCloseTo(heading.y, 12);
  });

  it('runs progress from 0 at the cast to 1 on landing, on the run clock', () => {
    const telegraph = createTelegraph(IMPACT, DELAY, RADIUS);
    expect(fallProgress(telegraph)).toBe(0);
    const [quarter] = advanceTelegraphs([telegraph], 0.25).live;
    expect(quarter && fallProgress(quarter)).toBeCloseTo(0.25, 12);
    const [landed] = advanceTelegraphs([telegraph], DELAY).landed;
    expect(landed && fallProgress(landed)).toBe(1);
    expect(fallProgress(createTelegraph(IMPACT, 0, RADIUS))).toBe(1);
  });
});

/** CO-167: the blast hits hardest at the centre and falls off evenly to the rim. */
describe('blastFalloff', () => {
  const { aoeRadius, aoeEdgeFactor, damage } = BASE_METEOR_STATS;

  it('is 1 at the centre and the edge factor at the rim', () => {
    expect(blastFalloff(0, aoeRadius, aoeEdgeFactor)).toBe(1);
    expect(blastFalloff(aoeRadius, aoeRadius, aoeEdgeFactor)).toBeCloseTo(aoeEdgeFactor, 12);
  });

  it('deals 60 at the centre and 24 at the rim at base', () => {
    expect(damage * blastFalloff(0, aoeRadius, aoeEdgeFactor)).toBe(60);
    expect(damage * blastFalloff(aoeRadius, aoeRadius, aoeEdgeFactor)).toBeCloseTo(24, 9);
  });

  it('falls off linearly in distance between them', () => {
    for (const share of [0.1, 0.25, 0.5, 0.9]) {
      expect(blastFalloff(share * aoeRadius, aoeRadius, aoeEdgeFactor), `${share}`).toBeCloseTo(
        1 - (1 - aoeEdgeFactor) * share,
        12,
      );
    }
    expect(blastFalloff(35, 70, 0.4)).toBeCloseTo(0.7, 12);
  });

  it('deals nothing beyond the rim', () => {
    expect(blastFalloff(aoeRadius + 0.01, aoeRadius, aoeEdgeFactor)).toBe(0);
    expect(blastFalloff(500, aoeRadius, aoeEdgeFactor)).toBe(0);
    expect(blastFalloff(Number.NaN, aoeRadius, aoeEdgeFactor)).toBe(0);
  });

  it('hits only the point, in full, with no reach', () => {
    expect(blastFalloff(0, 0, aoeEdgeFactor)).toBe(1);
    expect(blastFalloff(1, 0, aoeEdgeFactor)).toBe(0);
    expect(blastFalloff(0, -5, aoeEdgeFactor)).toBe(0);
  });
});
