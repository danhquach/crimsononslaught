import { describe, expect, it } from 'vitest';
import { BASE_NOVA_BOMB_STATS } from '../config/iceRoster';
import { FREEZE_DURATION } from '../config/spells';
import {
  MAX_LIVE_BOMBS,
  NO_FROST,
  applyFrost,
  bombFrost,
  bombTarget,
  frostSpeedFactor,
  isSlowed,
  pulseTargets,
  rollFreeze,
  tickFrost,
} from './frostNova';
import { createRng } from './rng';
import type { NovaBombStats } from './spellStats';

const base: NovaBombStats = { ...BASE_NOVA_BOMB_STATS };

describe('applyFrost slow stacking (CO-045)', () => {
  it('starts out unslowed at full speed', () => {
    expect(isSlowed(NO_FROST)).toBe(false);
    expect(frostSpeedFactor(NO_FROST)).toBe(1);
  });

  it('a pulse applies its slow for its duration', () => {
    const state = applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 1.5, freeze: false });
    expect(state).toEqual({ slowPct: 0.3, slowRemainingS: 1.5, frozenS: 0 });
    expect(isSlowed(state)).toBe(true);
    expect(frostSpeedFactor(state)).toBeCloseTo(0.7, 9);
  });

  it('is max, not additive: a second pulse never stacks the slow', () => {
    const once = applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 1.5, freeze: false });
    const twice = applyFrost(once, { slowPct: 0.3, slowDuration: 1.5, freeze: false });
    expect(twice.slowPct).toBe(0.3);
    expect(frostSpeedFactor(twice)).toBeCloseTo(0.7, 9);
  });

  it('a stronger slow replaces a weaker one', () => {
    const weak = applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 1.5, freeze: false });
    expect(applyFrost(weak, { slowPct: 0.5, slowDuration: 1.5, freeze: false }).slowPct).toBe(0.5);
  });

  it('a weaker slow never dilutes a stronger one', () => {
    const strong = applyFrost(NO_FROST, { slowPct: 0.5, slowDuration: 1.5, freeze: false });
    expect(applyFrost(strong, { slowPct: 0.3, slowDuration: 1.5, freeze: false }).slowPct).toBe(
      0.5,
    );
  });

  it('refreshes the duration and never shortens it', () => {
    const { state: half } = tickFrost(
      applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 2, freeze: false }),
      1,
    );
    expect(half.slowRemainingS).toBe(1);
    expect(
      applyFrost(half, { slowPct: 0.3, slowDuration: 1.5, freeze: false }).slowRemainingS,
    ).toBe(1.5);
    expect(
      applyFrost(half, { slowPct: 0.3, slowDuration: 0.5, freeze: false }).slowRemainingS,
    ).toBe(1);
  });

  it('an expired slow is forgotten when a new one lands', () => {
    const { state: done } = tickFrost(
      applyFrost(NO_FROST, { slowPct: 0.5, slowDuration: 1, freeze: false }),
      5,
    );
    expect(isSlowed(done)).toBe(false);
    expect(applyFrost(done, { slowPct: 0.3, slowDuration: 1, freeze: false }).slowPct).toBe(0.3);
  });

  it('a slowPct of 0 or a duration of 0 applies nothing', () => {
    expect(applyFrost(NO_FROST, { slowPct: 0, slowDuration: 1.5, freeze: false })).toEqual(
      NO_FROST,
    );
    expect(applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 0, freeze: false })).toEqual(
      NO_FROST,
    );
  });
});

describe('freeze (CO-045)', () => {
  const frozen = applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 1.5, freeze: true });

  it('is a full stop for FREEZE_DURATION', () => {
    expect(frozen.frozenS).toBe(FREEZE_DURATION);
    expect(frostSpeedFactor(frozen)).toBe(0);
    expect(isSlowed(frozen)).toBe(true);
  });

  it('a second freeze restarts the stop rather than extending it', () => {
    const { state: half } = tickFrost(frozen, 0.5);
    const again = applyFrost(half, { slowPct: 0.3, slowDuration: 1.5, freeze: true });
    expect(again.frozenS).toBe(FREEZE_DURATION);
  });

  it('a non-freezing pulse leaves a running freeze alone', () => {
    const { state: half } = tickFrost(frozen, 0.5);
    const again = applyFrost(half, { slowPct: 0.3, slowDuration: 1.5, freeze: false });
    expect(again.frozenS).toBeCloseTo(0.5, 9);
  });

  it('the slow keeps running once the freeze ends', () => {
    const { state } = tickFrost(frozen, FREEZE_DURATION);
    expect(state.frozenS).toBe(0);
    expect(frostSpeedFactor(state)).toBeCloseTo(0.7, 9);
    expect(state.slowRemainingS).toBeCloseTo(0.5, 9);
  });
});

describe('tickFrost (CO-045)', () => {
  it('runs a slow out exactly over its duration', () => {
    let state = applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 1.5, freeze: false });
    // 1.5 s in 16.67 ms frames, plus one more past the end.
    for (let i = 0; i < 91; i += 1) state = tickFrost(state, 1 / 60).state;
    expect(isSlowed(state)).toBe(false);
    expect(state).toEqual(NO_FROST);
  });

  it('reports the frame a slow ended on, once', () => {
    const state = applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 1, freeze: false });
    const first = tickFrost(state, 0.5);
    expect(first.ended).toBe(false);
    const second = tickFrost(first.state, 0.6);
    expect(second.ended).toBe(true);
    expect(tickFrost(second.state, 1).ended).toBe(false);
  });

  it('a zero or negative frame changes nothing', () => {
    const state = applyFrost(NO_FROST, { slowPct: 0.3, slowDuration: 1.5, freeze: true });
    expect(tickFrost(state, 0)).toEqual({ state, ended: false });
    expect(tickFrost(state, -1)).toEqual({ state, ended: false });
  });
});

describe('bombTarget (#141)', () => {
  const caster = { x: 0, y: 0 };

  it('aims at the nearest enemy inside the range', () => {
    const near = { x: 100, y: 0 };
    const far = { x: 250, y: 0 };
    expect(bombTarget(caster, [far, near], 300)).toBe(near);
  });

  it('aims at nothing with no enemy in range', () => {
    expect(bombTarget(caster, [{ x: 301, y: 0 }], 300)).toBeUndefined();
    expect(bombTarget(caster, [], 300)).toBeUndefined();
  });
});

describe('bombFrost (#141)', () => {
  it('carries the bomb slow and its own freeze duration', () => {
    const hit = bombFrost({ ...base, freezeChance: 0 }, createRng(1));
    expect(hit).toEqual({
      slowPct: base.slowPct,
      slowDuration: base.slowDuration,
      freeze: false,
      freezeDuration: base.freezeDuration,
    });
  });

  it('freezes on the roll, for the block freeze duration rather than the constant', () => {
    const hit = bombFrost({ ...base, freezeChance: 1, freezeDuration: 2.5 }, createRng(1));
    expect(hit.freeze).toBe(true);
    expect(applyFrost(NO_FROST, hit).frozenS).toBe(2.5);
  });

  it('draws one roll per enemy, reproducible from the seed', () => {
    const roll = (seed: number): boolean[] => {
      const rng = createRng(seed);
      return Array.from({ length: 40 }, () => bombFrost(base, rng).freeze);
    };
    expect(roll(3)).toEqual(roll(3));
    expect(roll(3)).toContain(true);
    expect(roll(3)).toContain(false);
  });
});

describe('MAX_LIVE_BOMBS (#141)', () => {
  it('holds every bomb a hasted, long-range build can have in flight', () => {
    const cooldown = base.cooldown * 0.5;
    const flight = (base.range * 1.5) / base.speed;
    expect(MAX_LIVE_BOMBS).toBeGreaterThanOrEqual(Math.ceil(flight / cooldown));
  });
});

describe('pulseTargets (CO-045)', () => {
  const origin = { x: 100, y: 100 };
  const near = { x: 150, y: 100 };
  const edge = { x: 190, y: 100 };
  const outside = { x: 191, y: 100 };

  it('hits everything inside the radius, inclusive, and nothing outside', () => {
    expect(pulseTargets(origin, [outside, near, edge], 90)).toEqual([near, edge]);
  });

  it('measures true distance, not per-axis', () => {
    const diagonal = { x: 165, y: 165 }; // ~91.9 px away
    expect(pulseTargets(origin, [diagonal], 90)).toEqual([]);
    expect(pulseTargets(origin, [diagonal], 92)).toEqual([diagonal]);
  });

  it('hits nothing when nothing is near', () => {
    expect(pulseTargets(origin, [], 90)).toEqual([]);
    expect(pulseTargets(origin, [outside], 90)).toEqual([]);
  });
});

describe('rollFreeze (CO-045)', () => {
  it('never freezes at chance 0 and never touches the RNG', () => {
    let draws = 0;
    const rng = { ...createRng(1), next: () => (draws += 1) * 0 };
    expect(rollFreeze(rng, 0)).toBe(false);
    expect(draws).toBe(0);
  });

  it('always freezes at chance 1', () => {
    const rng = createRng(7);
    for (let i = 0; i < 20; i += 1) expect(rollFreeze(rng, 1)).toBe(true);
  });

  it('is reproducible from the seed', () => {
    const roll = (seed: number): boolean[] => {
      const rng = createRng(seed);
      return Array.from({ length: 30 }, () => rollFreeze(rng, 0.2));
    };
    expect(roll(42)).toEqual(roll(42));
    expect(roll(42)).toContain(true);
    expect(roll(42)).toContain(false);
  });
});
