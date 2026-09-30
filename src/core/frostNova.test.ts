import { describe, expect, it } from 'vitest';
import { BASE_NOVA_BOMB_STATS } from '../config/iceRoster';
import { FREEZE_DURATION } from '../config/spells';
import { SPELL_LEVEL_STATS } from '../config/spellLevels';
import {
  BURST_TRIGGER_COUNT,
  ICICLE_SPIRAL_STEP_DEG,
  MAX_LIVE_BOMBS,
  MAX_LIVE_ICICLES,
  NO_FROST,
  applyFrost,
  bombAim,
  bombFrost,
  frostSpeedFactor,
  icicleFrost,
  isSlowed,
  pulseTargets,
  rollFreeze,
  shouldBurst,
  BURST_ARM_DISTANCE,
  throwAngles,
  throwsDue,
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

describe('MAX_LIVE_ICICLES (CO-182)', () => {
  it('holds every icicle a hasted, long-range build can have in the air', () => {
    const cooldown = base.cooldown * 0.5;
    const interval = base.throwInterval * 0.5;
    const bombs = Math.ceil((base.range * 1.5) / base.speed / cooldown);
    const lifeS = (base.icicleRange * 1.5) / base.icicleSpeed;
    const perBomb = Math.ceil(lifeS / interval) * base.icicles;
    expect(MAX_LIVE_ICICLES).toBeGreaterThanOrEqual(bombs * perBomb);
  });

  it('still holds them once level 2 has doubled the spray (#328)', () => {
    const cooldown = base.cooldown * 0.5;
    const interval = base.throwInterval * 0.5;
    const bombs = Math.ceil((base.range * 1.5) / base.speed / cooldown);
    const lifeS = (base.icicleRange * 1.5) / base.icicleSpeed;
    const icicles = base.icicles + (SPELL_LEVEL_STATS.ice_nova_bomb?.[2]?.icicles ?? 0);
    expect(icicles).toBe(4);
    expect(MAX_LIVE_ICICLES).toBeGreaterThanOrEqual(bombs * Math.ceil(lifeS / interval) * icicles);
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

describe('bombAim (CO-182)', () => {
  const caster = { x: 0, y: 0 };
  const lone = { x: 40, y: 0 };
  const pack = [
    { x: 0, y: 150 },
    { x: 10, y: 150 },
    { x: -10, y: 150 },
    { x: 0, y: 160 },
  ];

  it('heads for the densest group, not the nearer lone enemy', () => {
    const aim = bombAim(caster, [lone, ...pack], 110, 240, createRng(1));
    expect(aim).toBeDefined();
    expect(aim?.y).toBeGreaterThan(0.9);
    expect(Math.hypot(aim?.x ?? 0, aim?.y ?? 0)).toBeCloseTo(1, 9);
  });

  it('aims at nothing with no enemy in range', () => {
    expect(bombAim(caster, [{ x: 500, y: 0 }], 110, 240, createRng(1))).toBeUndefined();
  });

  it('falls back to the nearest enemy when the densest spot is the caster itself', () => {
    // Two enemies on the caster: its own spot counts 2, the lone one 1, so no tie.
    const onTop = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const below = { x: 0, y: 100 };
    const aim = bombAim(caster, [...onTop, below], 20, 240, createRng(1));
    expect(aim?.x).toBeCloseTo(0, 9);
    expect(aim?.y).toBeCloseTo(1, 9);
  });

  it('heads right when every enemy in range stands on the caster', () => {
    const onTop = { x: 0, y: 0 };
    expect(bombAim(caster, [onTop, { ...onTop }], 110, 240, createRng(1))).toEqual({ x: 1, y: 0 });
  });

  it('draws nothing from the RNG when one group is clearly densest', () => {
    const rng = createRng(7);
    const control = createRng(7);
    // Radius 12: (0,150) has all four inside, every other pack member two, so no tie.
    bombAim(caster, [lone, ...pack], 12, 240, rng);
    expect(rng.next()).toBe(control.next());
  });
});

describe('throwAngles (CO-182)', () => {
  it('throws two opposite icicles, a quarter turn off the aim, on the first throw', () => {
    const [a, b] = throwAngles(0, 0, 2);
    expect(a).toBeCloseTo(Math.PI / 2, 9);
    expect(b).toBeCloseTo(Math.PI / 2 + Math.PI, 9);
  });

  it('turns the whole set by the spiral step on every throw', () => {
    const step = (ICICLE_SPIRAL_STEP_DEG * Math.PI) / 180;
    expect(throwAngles(0, 3, 2)[0]).toBeCloseTo(Math.PI / 2 + 3 * step, 9);
  });

  it('spaces three icicles a third of a turn apart', () => {
    const [a, b, c] = throwAngles(1, 0, 3);
    expect((b ?? 0) - (a ?? 0)).toBeCloseTo((2 * Math.PI) / 3, 9);
    expect((c ?? 0) - (b ?? 0)).toBeCloseTo((2 * Math.PI) / 3, 9);
  });

  it('throws nothing for a count of 0', () => {
    expect(throwAngles(0, 0, 0)).toEqual([]);
  });
});

describe('throwsDue (CO-182)', () => {
  it('owes the first throw one interval after the launch, not at it', () => {
    expect(throwsDue(0, 0, 0.25)).toBe(0);
    expect(throwsDue(0.24, 0, 0.25)).toBe(0);
    expect(throwsDue(0.25, 0, 0.25)).toBe(1);
  });

  it('owes every throw a long step skipped, minus those already thrown', () => {
    expect(throwsDue(1.0, 1, 0.25)).toBe(3);
  });

  it('owes nothing on a non-positive interval', () => {
    expect(throwsDue(5, 0, 0)).toBe(0);
  });

  it('makes 11 throws over the 3 s base flight, the last step bursting first', () => {
    const flightS = BASE_NOVA_BOMB_STATS.range / BASE_NOVA_BOMB_STATS.speed;
    // The step that reaches range bursts and throws nothing, so the 12th is never owed.
    expect(throwsDue(flightS - 1e-9, 0, BASE_NOVA_BOMB_STATS.throwInterval)).toBe(11);
  });
});

describe('shouldBurst (CO-182)', () => {
  const at = { x: 0, y: 0 };
  const near = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i * 5, y: 0 }));
  const armed = BURST_ARM_DISTANCE;
  const { range, radius } = BASE_NOVA_BOMB_STATS;

  it('holds with fewer than the trigger count inside the burst radius', () => {
    expect(shouldBurst(at, near(BURST_TRIGGER_COUNT - 1), armed, range, radius)).toBe(false);
  });

  it('bursts once its ring would catch the trigger count, the radius inclusive', () => {
    const pack = [...near(BURST_TRIGGER_COUNT - 1), { x: radius, y: 0 }];
    expect(shouldBurst(at, pack, armed, range, radius)).toBe(true);
  });

  it('ignores enemies just outside the burst radius', () => {
    const far = Array.from({ length: 5 }, () => ({ x: radius + 1, y: 0 }));
    expect(shouldBurst(at, far, armed, range, radius)).toBe(false);
  });

  it('holds through a crowd until it has rolled the arming distance', () => {
    expect(shouldBurst(at, near(10), 0, range, radius)).toBe(false);
    expect(shouldBurst(at, near(10), armed - 1, range, radius)).toBe(false);
    expect(shouldBurst(at, near(10), armed, range, radius)).toBe(true);
  });

  it('bursts at the end of its range with nobody near', () => {
    expect(shouldBurst(at, [], range, range, radius)).toBe(true);
    expect(shouldBurst(at, [], range - 1, range, radius)).toBe(false);
  });

  it('arms well inside the range', () => {
    expect(BURST_ARM_DISTANCE).toBeLessThan(range);
  });
});

describe('icicleFrost (CO-182)', () => {
  it('carries the bomb slow and never freezes', () => {
    expect(icicleFrost(base)).toEqual({
      slowPct: base.slowPct,
      slowDuration: base.slowDuration,
      freeze: false,
    });
  });
});
