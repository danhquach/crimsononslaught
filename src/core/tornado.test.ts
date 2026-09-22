import { describe, expect, it } from 'vitest';
import { BASE_TORNADO_STATS } from '../config/lightningRoster';
import { advanceArea, createArea, membersOf } from './groundArea';
import { TORNADO_EYE, driftArea, tornadoHeading, tornadoPulls } from './tornado';

const base = BASE_TORNADO_STATS;
const caster = { x: 0, y: 0 };

function area(at = caster) {
  return createArea(at, {
    radius: base.radius,
    durationS: base.duration,
    tickEveryS: base.tickRate,
  });
}

describe('tornadoHeading (#142)', () => {
  it('points at the nearest enemy within targetRange as a unit vector', () => {
    const near = { x: 300, y: 0 };
    const nearer = { x: 0, y: -100 };
    expect(tornadoHeading(caster, [near, nearer], base.targetRange)).toEqual({ x: 0, y: -1 });
  });

  it('normalises a diagonal', () => {
    const heading = tornadoHeading(caster, [{ x: 100, y: 100 }], base.targetRange);
    expect(heading?.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(heading?.y).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it('is undefined with nothing in range, inclusive at the edge', () => {
    expect(tornadoHeading(caster, [], base.targetRange)).toBeUndefined();
    expect(
      tornadoHeading(caster, [{ x: base.targetRange + 1, y: 0 }], base.targetRange),
    ).toBeUndefined();
    expect(tornadoHeading(caster, [{ x: base.targetRange, y: 0 }], base.targetRange)).toEqual({
      x: 1,
      y: 0,
    });
  });

  it('is undefined for a target standing on the caster', () => {
    expect(tornadoHeading(caster, [{ x: 0, y: 0 }], base.targetRange)).toBeUndefined();
  });
});

describe('driftArea (#142)', () => {
  it('moves speed px/s along the heading and nothing else', () => {
    const start = area();
    const moved = driftArea(start, { x: 1, y: 0 }, base.speed, 0.5);
    expect(moved.x).toBeCloseTo(base.speed * 0.5, 9);
    expect(moved.y).toBe(0);
    expect({ ...moved, x: 0 }).toEqual(start);
  });

  it('over its whole life a base tornado travels speed * duration', () => {
    let patch = area();
    const frames = 300;
    for (let i = 0; i < frames; i += 1) {
      patch = driftArea(patch, { x: 0, y: 1 }, base.speed, base.duration / frames);
    }
    expect(patch.y).toBeCloseTo(base.speed * base.duration, 6);
  });

  it('a bad frame or no speed leaves the patch where it is', () => {
    const start = area({ x: 5, y: 6 });
    expect(driftArea(start, { x: 1, y: 0 }, base.speed, 0)).toEqual(start);
    expect(driftArea(start, { x: 1, y: 0 }, base.speed, Number.NaN)).toEqual(start);
    expect(driftArea(start, { x: 1, y: 0 }, 0, 1)).toEqual(start);
  });

  it('composes with advanceArea: the moved patch keeps its clock and pays its ticks', () => {
    const moved = driftArea(area(), { x: 1, y: 0 }, base.speed, 0.4);
    const step = advanceArea(moved, 0.4);
    expect(step.ticks).toBe(1);
    expect(step.area.x).toBeCloseTo(base.speed * 0.4, 9);
    expect(step.area.remainingS).toBeCloseTo(base.duration - 0.4, 9);
  });

  it('membership follows the patch: an enemy it drifts onto is inside, one it leaves is not', () => {
    const behind = { x: -50, y: 0 };
    const ahead = { x: 200, y: 0 };
    let patch = area();
    expect(membersOf(patch, [behind, ahead])).toEqual([behind]);
    patch = driftArea(patch, { x: 1, y: 0 }, base.speed, 3);
    expect(membersOf(patch, [behind, ahead])).toEqual([ahead]);
  });
});

describe('tornadoPulls (#142)', () => {
  it('pulls everything between the eye and pullRadius straight at the centre at pullForce', () => {
    const centre = { x: 100, y: 100 };
    const right = { x: 200, y: 100 };
    const pulls = tornadoPulls(centre, [right], base.pullRadius, base.pullForce);
    expect(pulls).toHaveLength(1);
    expect(pulls[0]?.enemy).toBe(right);
    expect(pulls[0]?.force.x).toBeCloseTo(-base.pullForce, 9);
    expect(pulls[0]?.force.y).toBeCloseTo(0, 9);
  });

  it('leaves out what is beyond pullRadius, inside the eye, or at the centre', () => {
    const centre = { x: 0, y: 0 };
    const far = { x: base.pullRadius + 1, y: 0 };
    const eye = { x: TORNADO_EYE, y: 0 };
    const dead = { x: 0, y: 0 };
    const edge = { x: base.pullRadius, y: 0 };
    const pulls = tornadoPulls(centre, [far, eye, dead, edge], base.pullRadius, base.pullForce);
    expect(pulls.map((pull) => pull.enemy)).toEqual([edge]);
  });

  it('pulls nothing with no force', () => {
    expect(tornadoPulls(caster, [{ x: 50, y: 0 }], base.pullRadius, 0)).toEqual([]);
  });

  it('the pull reaches further than the damage: pullRadius is wider than radius at base', () => {
    expect(base.pullRadius).toBeGreaterThan(base.radius);
  });
});
