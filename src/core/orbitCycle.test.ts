import { describe, expect, it } from 'vitest';
import {
  endEarly,
  isOut,
  startOrbitCycle,
  stepOrbitCycle,
  type OrbitCycleState,
} from './orbitCycle';

const RULE = { uptime: 5, recharge: 3 };

/** Run `seconds` in `frames` equal steps, collecting every change. */
function run(state: OrbitCycleState, seconds: number, frames: number) {
  let current = state;
  const log: string[] = [];
  for (let i = 0; i < frames; i += 1) {
    const step = stepOrbitCycle(current, seconds / frames, RULE);
    if (step.vanished) log.push('vanished');
    if (step.appeared) log.push('appeared');
    current = step.state;
  }
  return { state: current, log };
}

describe('startOrbitCycle', () => {
  it('starts out with the whole uptime ahead', () => {
    expect(startOrbitCycle(RULE)).toEqual({ phase: 'out', leftS: 5 });
  });
});

describe('stepOrbitCycle', () => {
  it('counts the uptime down and reports nothing mid-phase', () => {
    const step = stepOrbitCycle(startOrbitCycle(RULE), 1, RULE);
    expect(step).toEqual({ state: { phase: 'out', leftS: 4 }, appeared: false, vanished: false });
  });

  it('vanishes exactly when the uptime runs out, then reappears after the recharge', () => {
    const first = stepOrbitCycle({ phase: 'out', leftS: 0.5 }, 0.5, RULE);
    expect(first.vanished).toBe(true);
    expect(first.appeared).toBe(false);
    expect(first.state).toEqual({ phase: 'recharge', leftS: 3 });

    const back = stepOrbitCycle({ phase: 'recharge', leftS: 0.25 }, 0.25, RULE);
    expect(back.appeared).toBe(true);
    expect(back.vanished).toBe(false);
    expect(back.state).toEqual({ phase: 'out', leftS: 5 });
  });

  it('keeps an 8 s period over many small frames', () => {
    const { state, log } = run(startOrbitCycle(RULE), 15, 1500);
    expect(log).toEqual(['vanished', 'appeared', 'vanished']);
    expect(state.phase).toBe('recharge');
    expect(state.leftS).toBeCloseTo(1, 6);
  });

  it('carries the remainder of a step that spans a boundary into the next phase', () => {
    const step = stepOrbitCycle({ phase: 'out', leftS: 0.1 }, 0.5, RULE);
    expect(step.vanished).toBe(true);
    expect(step.state.phase).toBe('recharge');
    expect(step.state.leftS).toBeCloseTo(2.6, 9);
  });

  it('reports both changes, vanish first, when one step spans a whole recharge', () => {
    const step = stepOrbitCycle({ phase: 'out', leftS: 1 }, 5, RULE);
    expect(step.vanished).toBe(true);
    expect(step.appeared).toBe(true);
    expect(step.state.phase).toBe('out');
    expect(step.state.leftS).toBeCloseTo(4, 9);
  });

  it('reads the rule live: a longer uptime applies from the next phase', () => {
    const step = stepOrbitCycle({ phase: 'recharge', leftS: 1 }, 1, { uptime: 7.5, recharge: 3 });
    expect(step.state).toEqual({ phase: 'out', leftS: 7.5 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('ignores a step of %s', (dt) => {
    const state = { phase: 'out', leftS: 2 } as const;
    expect(stepOrbitCycle(state, dt, RULE)).toEqual({
      state,
      appeared: false,
      vanished: false,
    });
  });

  it('does not loop on a rule of zero lengths', () => {
    const step = stepOrbitCycle(startOrbitCycle({ uptime: 0, recharge: 0 }), 1, {
      uptime: 0,
      recharge: 0,
    });
    expect(step.state.leftS).toBe(0);
  });

  it('treats a bad length as zero', () => {
    const step = stepOrbitCycle({ phase: 'out', leftS: 1 }, 1, {
      uptime: Number.NaN,
      recharge: -2,
    });
    expect(step.vanished).toBe(true);
    expect(step.appeared).toBe(true);
  });
});

describe('endEarly', () => {
  it('vanishes the pieces now and starts the recharge', () => {
    expect(endEarly({ phase: 'out', leftS: 3.3 }, 3)).toEqual({
      state: { phase: 'recharge', leftS: 3 },
      vanished: true,
    });
  });

  it('leaves a recharge already running alone', () => {
    expect(endEarly({ phase: 'recharge', leftS: 1 }, 3)).toEqual({
      state: { phase: 'recharge', leftS: 1 },
      vanished: false,
    });
  });

  it('then comes back after the recharge, with no second vanish', () => {
    const early = endEarly({ phase: 'out', leftS: 4 }, 3);
    const { state, log } = run(early.state, 3, 30);
    expect(log).toEqual(['appeared']);
    expect(state.phase).toBe('out');
  });
});

describe('isOut', () => {
  it('is true only in the out phase', () => {
    expect(isOut({ phase: 'out', leftS: 1 })).toBe(true);
    expect(isOut({ phase: 'recharge', leftS: 1 })).toBe(false);
  });
});
