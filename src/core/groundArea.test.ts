import { describe, expect, it } from 'vitest';
import {
  AREA_STAGGER_MAX_FRACTION,
  advanceArea,
  areaStaggerS,
  createArea,
  densestSpot,
  isLive,
  membersOf,
  type AreaRule,
  type GroundArea,
} from './groundArea';
import { createRng } from './rng';
import { applyStagger, staggerSpeedFactor, tickStagger } from './status';

/** A §9.3-shaped block (Ice Storm's before #219 cut its radius): 180 px for 6 s, ticking twice a second. */
const BLIZZARD: AreaRule = { radius: 180, durationS: 6, tickEveryS: 0.5 };

const CENTRE = { x: 100, y: 100 };

/** How many ticks a whole lifetime pays, one frame of `deltaS` at a time. */
function runOut(area: GroundArea, deltaS: number): number {
  let ticks = 0;
  let frames = 0;
  let live = area;
  while (isLive(live)) {
    const step = advanceArea(live, deltaS);
    ticks += step.ticks;
    frames += 1;
    live = step.area;
    // A rule that never expires would hang the suite rather than fail it.
    if (frames > 100_000) throw new Error('area never expired');
  }
  return ticks;
}

describe('createArea', () => {
  it('places the patch where it was cast with its numbers snapshotted', () => {
    expect(createArea(CENTRE, BLIZZARD)).toEqual({
      x: 100,
      y: 100,
      radius: 180,
      durationS: 6,
      tickEveryS: 0.5,
      remainingS: 6,
      ticksPaid: 0,
    });
  });

  it('is dead on arrival when the block gives it no lifetime', () => {
    const area = createArea(CENTRE, { ...BLIZZARD, durationS: 0 });
    expect(isLive(area)).toBe(false);
    expect(advanceArea(area, 1)).toEqual({ area, ticks: 0, expired: true });
  });
});

describe('advanceArea', () => {
  it('waits a full interval for its first tick', () => {
    const area = createArea(CENTRE, BLIZZARD);
    const early = advanceArea(area, 0.4);
    expect(early.ticks).toBe(0);
    expect(early.area.remainingS).toBeCloseTo(5.6);
    // The interval completes on the next frame, not the one that cast it.
    expect(advanceArea(early.area, 0.1).ticks).toBe(1);
  });

  it('pays every tick a long frame crossed', () => {
    // 2 s of run time is four 0.5 s intervals, however few frames covered it.
    expect(advanceArea(createArea(CENTRE, BLIZZARD), 2).ticks).toBe(4);
  });

  it('pays the same ticks over a lifetime whatever the frame length', () => {
    const area = createArea(CENTRE, BLIZZARD);
    // 12 = duration / tickRate. A 60 fps run, a 10 fps one, and the two frames
    // a `?timeScale=30` run steps a 3 s window in: the same twelve ticks. The
    // 60 fps run is the one that proves the count is not accumulated — 360
    // frames of 1/60 leave `remainingS` a hair above 0, and the tick that lands
    // on the edge is still paid by the frame that closes the lifetime.
    expect(runOut(area, 1 / 60)).toBe(12);
    expect(runOut(area, 0.1)).toBe(12);
    expect(runOut(area, 3)).toBe(12);
  });

  it('expires at exactly its duration, paying the tick that lands on the edge', () => {
    const area = createArea(CENTRE, BLIZZARD);
    const spent = advanceArea(area, 5.5);
    expect(spent.expired).toBe(false);
    expect(spent.ticks).toBe(11);
    const last = advanceArea(spent.area, 0.5);
    expect(last.ticks).toBe(1);
    expect(last.expired).toBe(true);
    expect(last.area.remainingS).toBe(0);
  });

  it('pays nothing past its duration however long the frame is', () => {
    const { area } = advanceArea(createArea(CENTRE, BLIZZARD), 60);
    expect(area.remainingS).toBe(0);
    expect(advanceArea(area, 10)).toEqual({ area, ticks: 0, expired: true });
  });

  it('leaves the patch alone on a zero-length or bad frame', () => {
    const area = createArea(CENTRE, BLIZZARD);
    for (const delta of [0, -1, NaN, Infinity]) {
      expect(advanceArea(area, delta), `${delta}`).toEqual({ area, ticks: 0, expired: false });
    }
  });

  it('never ticks on a block with no interval, and still expires', () => {
    for (const tickEveryS of [0, -1, NaN]) {
      const area = createArea(CENTRE, { ...BLIZZARD, tickEveryS });
      const step = advanceArea(area, 6);
      expect(step.ticks, `${tickEveryS}`).toBe(0);
      expect(step.expired, `${tickEveryS}`).toBe(true);
    }
  });
});

describe('membersOf', () => {
  const area = createArea(CENTRE, BLIZZARD);

  it('catches everything inside the radius, its own edge included', () => {
    const inside = { x: 100, y: 200 };
    const onEdge = { x: 280, y: 100 };
    const outside = { x: 281, y: 100 };
    expect(membersOf(area, [inside, onEdge, outside])).toEqual([inside, onEdge]);
  });

  it('is empty on an empty arena', () => {
    expect(membersOf(area, [])).toEqual([]);
  });

  it('hits an enemy that walked in on the next tick only, and not the one before', () => {
    const walker = { x: 500, y: 100 };
    const first = advanceArea(area, 0.5);
    expect(first.ticks).toBe(1);
    expect(membersOf(first.area, [walker])).toEqual([]);
    // It steps inside between the two ticks.
    walker.x = 150;
    const second = advanceArea(first.area, 0.5);
    expect(second.ticks).toBe(1);
    expect(membersOf(second.area, [walker])).toEqual([walker]);
  });

  it('stops hitting an enemy the moment it leaves', () => {
    const leaver = { x: 150, y: 100 };
    const inside = advanceArea(area, 0.5);
    expect(membersOf(inside.area, [leaver])).toEqual([leaver]);
    leaver.x = 400;
    expect(membersOf(advanceArea(inside.area, 0.5).area, [leaver])).toEqual([]);
  });

  it('counts an enemy standing in two overlapping patches in both', () => {
    const other = createArea({ x: 200, y: 100 }, BLIZZARD);
    const shared = { x: 150, y: 100 };
    expect(membersOf(area, [shared])).toEqual([shared]);
    expect(membersOf(other, [shared])).toEqual([shared]);
  });
});

describe('densestSpot', () => {
  const rng = createRng(1);
  const RADIUS = 100;
  const RANGE = 400;

  it('drops the patch on the caster when nothing is in range', () => {
    expect(densestSpot(CENTRE, [], RADIUS, RANGE, rng)).toEqual(CENTRE);
    expect(densestSpot(CENTRE, [{ x: 900, y: 100 }], RADIUS, RANGE, rng)).toEqual(CENTRE);
  });

  it('centres on the crowd rather than on the nearest enemy', () => {
    const lone = { x: 150, y: 100 };
    // Three in a row a patch-width apart: only the middle one covers all three.
    const crowd = [
      { x: 300, y: 100 },
      { x: 400, y: 100 },
      { x: 500, y: 100 },
    ];
    expect(densestSpot(CENTRE, [lone, ...crowd], RADIUS, RANGE, rng)).toEqual({ x: 400, y: 100 });
  });

  it('counts enemies out of range into the cluster it lands on', () => {
    // The candidate is in range; what makes it the densest spot is the pack
    // just beyond it, which the patch will cover once it is placed.
    const edge = { x: 480, y: 100 };
    const beyond = [
      { x: 560, y: 100 },
      { x: 570, y: 100 },
    ];
    const near = { x: 120, y: 100 };
    expect(densestSpot(CENTRE, [near, edge, ...beyond], RADIUS, RANGE, rng)).toEqual(edge);
  });

  it('draws from the run RNG only when clusters tie', () => {
    const lone = [{ x: 200, y: 100 }];
    const used = createRng(7);
    const untouched = createRng(7);
    expect(densestSpot(CENTRE, lone, RADIUS, RANGE, used)).toEqual(lone[0]);
    // A lone cluster left the sequence exactly where it was, so taking this
    // spell never shifts what the rest of the run draws.
    expect(used.next()).toBe(untouched.next());
  });

  it('breaks a tie the same way for the same seed, and does spend a draw on it', () => {
    const tied = [
      { x: 200, y: 100 },
      { x: 100, y: 400 },
    ];
    const picked = densestSpot(CENTRE, tied, RADIUS, RANGE, createRng(3));
    expect(tied).toContainEqual(picked);
    expect(densestSpot(CENTRE, tied, RADIUS, RANGE, createRng(3))).toEqual(picked);
    const drawn = createRng(3);
    densestSpot(CENTRE, tied, RADIUS, RANGE, drawn);
    expect(drawn.next()).not.toBe(createRng(3).next());
  });
});

describe('areaStaggerS (#220)', () => {
  it('passes the base 0.2 s stop through at a 0.5 s tick', () => {
    expect(areaStaggerS(0.2, 0.5)).toBe(0.2);
  });

  it('caps a scaled-up stop short of the next tick', () => {
    expect(areaStaggerS(0.5, 0.5)).toBeCloseTo(AREA_STAGGER_MAX_FRACTION * 0.5, 9);
    expect(areaStaggerS(0.5, 0.5)).toBeCloseTo(0.3, 9);
  });

  it('staggers nothing for a patch that carries no stagger', () => {
    expect(areaStaggerS(0, 0.5)).toBe(0);
  });

  it('never holds an enemy standing in the patch through a whole tick window', () => {
    // An 8 s / 0.5 s Earthquake ticking a standing enemy at 60 fps, for the
    // base stop and for stops a stacked duration build could scale it to.
    const tickEveryS = 0.5;
    const durationS = 8;
    const frameS = 1 / 60;
    const framesPerTick = Math.round(tickEveryS / frameS);
    for (const staggerDuration of [0.2, 0.3, 0.5, 1, 10]) {
      const stop = areaStaggerS(staggerDuration, tickEveryS);
      let area = createArea(CENTRE, { radius: 80, durationS, tickEveryS });
      let remainingS = 0;
      let windowFrames = 0;
      let freeFrames = 0;
      let windows = 0;
      let ticked = false;
      while (isLive(area)) {
        const step = advanceArea(area, frameS);
        area = step.area;
        for (let i = 0; i < step.ticks; i += 1) remainingS = applyStagger(remainingS, stop);
        if (step.ticks > 0) {
          // A window closes on every tick: it must have left the enemy free for 40%.
          if (ticked) {
            expect(freeFrames / windowFrames, `${staggerDuration}`).toBeGreaterThanOrEqual(0.4);
            windows += 1;
          }
          ticked = true;
          windowFrames = 0;
          freeFrames = 0;
        }
        remainingS = tickStagger(remainingS, frameS).remainingS;
        windowFrames += 1;
        if (staggerSpeedFactor(remainingS) === 1) freeFrames += 1;
      }
      expect(windowFrames, `${staggerDuration}`).toBeLessThanOrEqual(framesPerTick);
      expect(windows, `${staggerDuration}`).toBe(durationS / tickEveryS - 1);
    }
  });
});
