import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  advanceTelegraphs,
  createTelegraph,
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
    expect(step.landed).toEqual([{ x: 40, y: -7, remainingS: 0, radius: RADIUS }]);
  });

  it('counts a live telegraph down by the frame', () => {
    const step = advanceTelegraphs([createTelegraph(ORIGIN, DELAY, RADIUS)], 0.25);
    expect(step.live).toEqual([{ ...ORIGIN, remainingS: 0.75, radius: RADIUS }]);
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
