import { describe, expect, it } from 'vitest';
import {
  DEEP_FREEZE,
  FROST_ORB,
  HAIL,
  ICE_ARROW_FAN,
  ICE_SHIELD_WAVE,
  ICE_WAVE_ART,
  SHATTER,
} from '../config/iceLevels';
import { BASE_NOVA_BOMB_STATS } from '../config/iceRoster';
import { PROFILE_CLAMPS } from '../config/passives';
import type { SpellLevel } from '../config/spellLevels';
import { BOSS_CC_RESIST } from '../config/boss';
import { NO_BOSS_CC, bossFrost } from './bossCrowdControl';
import { advanceArea, createArea } from './groundArea';
import { NO_FROST, applyFrost, freezeDurationOf, tickFrost, type FrostHit } from './frostNova';
import {
  deepFreezeHit,
  fanHeadings,
  frostOrbHit,
  hailsDue,
  hasNovaWave,
  iceWaveFade,
  iceWaveFrame,
  iceWaveScale,
  diamondWaveDamage,
  hasDiamondWave,
  hasShatter,
  isDeepFreezeTick,
  shardDamage,
  shatterHeadings,
  stormTickCount,
} from './iceLevels';
import { createRng } from './rng';

/** #328: the level 2 and 3 rules of the Ice spells, checked without an engine. */

const LEVELS: readonly SpellLevel[] = [1, 2, 3];
const DEG = Math.PI / 180;

describe('level gates', () => {
  it('turns each behaviour on at its own level and keeps it on', () => {
    expect(LEVELS.map(hasShatter)).toEqual([false, false, true]);
    expect(LEVELS.map(hasNovaWave)).toEqual([false, false, true]);
    expect(LEVELS.map(hasDiamondWave)).toEqual([false, false, true]);
  });

  it('marks the deep freeze only on the last paid tick, from level 3', () => {
    expect(LEVELS.map((level) => isDeepFreezeTick(8, 8, level))).toEqual([false, false, true]);
    expect(isDeepFreezeTick(7, 8, 3)).toBe(false);
    expect(isDeepFreezeTick(9, 8, 3)).toBe(false);
    // A patch that pays nothing has no last tick.
    expect(isDeepFreezeTick(0, 0, 3)).toBe(false);
  });
});

describe('fanHeadings', () => {
  it('is the aim itself for one arrow and nothing for none', () => {
    expect(fanHeadings(1.25, 1)).toEqual([1.25]);
    expect(fanHeadings(1.25, 0)).toEqual([]);
    expect(fanHeadings(1.25, -3)).toEqual([]);
  });

  it('puts two arrows 6 degrees either side of the aim by default', () => {
    const [a, b] = fanHeadings(0.5, 2);
    expect(a).toBeCloseTo(0.5 - 6 * DEG, 12);
    expect(b).toBeCloseTo(0.5 + 6 * DEG, 12);
    expect(b! - a!).toBeCloseTo(ICE_ARROW_FAN.spreadDeg * DEG, 12);
  });

  it('is symmetric about the aim and spans the spread for any count', () => {
    for (const aim of [0, 1, -2.5, Math.PI]) {
      for (const count of [2, 3, 4, 5]) {
        const h = fanHeadings(aim, count, 30);
        expect(h).toHaveLength(count);
        for (let i = 0; i < count; i += 1) {
          expect(h[i]! - aim, `${aim}/${count}/${i}`).toBeCloseTo(-(h[count - 1 - i]! - aim), 12);
        }
        expect(h[count - 1]! - h[0]!).toBeCloseTo(30 * DEG, 12);
      }
    }
  });

  it('floors a fractional count and shrugs off a non-number', () => {
    expect(fanHeadings(0, 2.9)).toHaveLength(2);
    expect(fanHeadings(0, Number.NaN)).toEqual([]);
  });
});

describe('Shatter', () => {
  it('throws its shards in a forward cone about the arrow', () => {
    const h = shatterHeadings(0.7);
    expect(h).toHaveLength(SHATTER.count);
    expect(h[1]).toBeCloseTo(0.7, 12);
    expect(h[2]! - h[0]!).toBeCloseTo(SHATTER.spreadDeg * DEG, 12);
    for (const heading of h) expect(Math.abs(heading - 0.7)).toBeLessThanOrEqual(15 * DEG + 1e-12);
  });

  it('deals a fraction of the arrow to each shard', () => {
    expect(shardDamage(10)).toBe(10 * SHATTER.damageFactor);
    expect(shardDamage(10, 0.25)).toBe(2.5);
    expect(shardDamage(0)).toBe(0);
  });
});

describe('Frost wave ring art', () => {
  const range = 110;

  it('starts on the core burst and ends on the widest ring', () => {
    expect(iceWaveFrame(0, range)).toBe(0);
    expect(iceWaveFrame(range * 0.3, range)).toBe(1);
    expect(iceWaveFrame(range * 0.6, range)).toBe(2);
    expect(iceWaveFrame(range * 0.9, range)).toBe(3);
    expect(iceWaveFrame(range, range)).toBe(3);
    expect(iceWaveFrame(range * 2, range)).toBe(3);
  });

  it('never steps back as the wave grows', () => {
    let last = 0;
    for (let r = 0; r <= range; r += 1) {
      const frame = iceWaveFrame(r, range);
      expect(frame).toBeGreaterThanOrEqual(last);
      last = frame;
    }
  });

  it('puts the drawn outer edge on the radius, whichever frame shows', () => {
    for (let frame = 0; frame < ICE_WAVE_ART.outerRadius.length; frame += 1) {
      expect(iceWaveScale(80, frame) * ICE_WAVE_ART.outerRadius[frame]!).toBeCloseTo(80, 9);
    }
    expect(iceWaveScale(-5, 1)).toBe(0);
  });

  it('holds full opacity for the first 80% of the reach and fades to nothing at the end', () => {
    expect(iceWaveFade(0, range)).toBe(1);
    expect(iceWaveFade(range * 0.8, range)).toBe(1);
    expect(iceWaveFade(range * 0.9, range)).toBeCloseTo(0.5, 9);
    expect(iceWaveFade(range, range)).toBe(0);
    expect(iceWaveFade(1, 0)).toBe(0);
  });
});

describe('Ice Shield frost burst (#406)', () => {
  it('deals the wave 1.5 x the diamond damage, and nothing for none', () => {
    expect(diamondWaveDamage(12)).toBe(12 * ICE_SHIELD_WAVE.damageFactor);
    expect(diamondWaveDamage(12)).toBe(18);
    expect(diamondWaveDamage(10, 0.5)).toBe(5);
    expect(diamondWaveDamage(0)).toBe(0);
  });
});

describe('Frost orb and Deep freeze hits', () => {
  it('freezes for the fixed length and carries the companion slow', () => {
    expect(frostOrbHit({ slowPct: 0.25, slowDuration: 1.5 })).toEqual({
      slowPct: 0.25,
      slowDuration: 1.5,
      freeze: true,
      freezeDuration: FROST_ORB.freezeS,
    });
  });

  it('gives no slow for a companion block that has none, but still freezes', () => {
    const hit = frostOrbHit({});
    expect(hit.slowPct).toBe(0);
    expect(hit.freeze).toBe(true);
  });

  it('freezes a deep-frozen enemy for the fixed length and keeps the storm slow', () => {
    expect(deepFreezeHit({ slowPct: 0.5, slowDuration: 1 })).toEqual({
      slowPct: 0.5,
      slowDuration: 1,
      freeze: true,
      freezeDuration: DEEP_FREEZE.freezeS,
    });
  });
});

describe('stormTickCount', () => {
  it('is floor(duration / interval)', () => {
    expect(stormTickCount(4, 0.5)).toBe(8);
    expect(stormTickCount(4.8, 0.5)).toBe(9);
    expect(stormTickCount(5, 0.3)).toBe(16);
  });

  it('pays nothing for an interval or duration that pays nothing', () => {
    expect(stormTickCount(4, 0)).toBe(0);
    expect(stormTickCount(4, -1)).toBe(0);
    expect(stormTickCount(4, Number.NaN)).toBe(0);
    expect(stormTickCount(4, Number.POSITIVE_INFINITY)).toBe(0);
    expect(stormTickCount(0, 0.5)).toBe(0);
    expect(stormTickCount(-2, 0.5)).toBe(0);
  });

  /** Runs a patch to expiry in `frames` steps and returns the ticks `advanceArea` paid. */
  function paidTicks(durationS: number, tickEveryS: number, frame: () => number): number[] {
    let area = createArea({ x: 0, y: 0 }, { radius: 100, durationS, tickEveryS });
    const paid: number[] = [];
    for (let guard = 0; guard < 100_000; guard += 1) {
      const step = advanceArea(area, frame());
      for (let i = 0; i < step.ticks; i += 1) paid.push(area.ticksPaid + i + 1);
      area = step.area;
      if (step.expired) return paid;
    }
    throw new Error('the patch never expired');
  }

  it('equals the ticks advanceArea pays by expiry, on any frame size', () => {
    const rng = createRng(7);
    const cases: [number, number][] = [
      [4, 0.5],
      [4.8, 0.5],
      [5, 0.3],
      [4, 0.1],
      [0.6, 0.2],
      [0.9, 0.3],
      [4, 0.7],
      [6, 0.5],
    ];
    const frames: [string, () => number][] = [
      ['1/60', () => 1 / 60],
      ['1/30', () => 1 / 30],
      ['0.25', () => 0.25],
      ['one long frame', () => 100],
      ['random', () => 0.001 + rng.next() * 0.2],
    ];
    for (const [duration, tick] of cases) {
      for (const [name, frame] of frames) {
        const paid = paidTicks(duration, tick, frame);
        expect(paid.length, `${duration}/${tick} @ ${name}`).toBe(stormTickCount(duration, tick));
        // The ticks are numbered 1..count with none skipped: the last is the deep-freeze tick.
        expect(paid, `${duration}/${tick} @ ${name}`).toEqual(
          Array.from({ length: paid.length }, (_, i) => i + 1),
        );
      }
    }
  });

  it('agrees with a hundred random durations, intervals and frame sizes', () => {
    const rng = createRng(11);
    for (let n = 0; n < 100; n += 1) {
      const duration = 0.5 + rng.next() * 8;
      const tick = 0.05 + rng.next() * 1.2;
      const paid = paidTicks(duration, tick, () => 0.002 + rng.next() * 0.3);
      expect(paid.length, `${duration}/${tick}`).toBe(stormTickCount(duration, tick));
    }
  });
});

describe('hailsDue', () => {
  it('drops a stone on every even tick when ticks are half a second and stones a second', () => {
    const per = Array.from({ length: 8 }, (_, i) => hailsDue(i + 1, 0.5, HAIL.everyS));
    expect(per).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('drops one stone per tick when the two intervals match, and none for a bad clock', () => {
    for (let n = 1; n <= 8; n += 1) expect(hailsDue(n, 1, 1)).toBe(1);
    expect(hailsDue(0, 0.5, 1)).toBe(0);
    expect(hailsDue(-1, 0.5, 1)).toBe(0);
    expect(hailsDue(3, 0, 1)).toBe(0);
    expect(hailsDue(3, 0.5, 0)).toBe(0);
    expect(hailsDue(Number.NaN, 0.5, 1)).toBe(0);
  });

  it('totals the whole stones the paid ticks cover, and never one too many', () => {
    for (const [duration, tick] of [
      [4, 0.5],
      [4.8, 0.5],
      [5, 0.3],
      [4, 0.25],
      [6, 0.4],
      [3.5, 0.7],
    ] as const) {
      const count = stormTickCount(duration, tick);
      let total = 0;
      for (let n = 1; n <= count; n += 1) {
        const due = hailsDue(n, tick, HAIL.everyS);
        expect(due, `${duration}/${tick} tick ${n}`).toBeGreaterThanOrEqual(0);
        total += due;
      }
      // A stone is dropped only on a tick, so the total is what the last paid tick's clock crossed:
      // exactly `floor(duration / everyS)` when the duration is a whole number of ticks, one less at most otherwise.
      expect(total).toBe(Math.floor((count * tick) / HAIL.everyS + 1e-9));
      expect(total).toBeLessThanOrEqual(Math.floor(duration / HAIL.everyS));
      expect(total).toBeGreaterThanOrEqual(Math.floor(duration / HAIL.everyS) - 1);
      if (Math.abs(count * tick - duration) < 1e-9)
        expect(total).toBe(Math.floor(duration / HAIL.everyS));
    }
  });
});

/**
 * The boss against every Ice level 3 freeze source (CO-221): it is never
 * frozen. Each source goes through the very functions `Boss.applyFrost` runs
 * (`bossFrost`, then `applyFrost`, then `tickFrost` each frame) and comes out a
 * slow, at most a quarter of twice its freeze (or of its own slow, when longer),
 * halved again on repeats. Each source is an always-lands freeze of its fixed
 * length, the strongest reading of its roll.
 */
describe('boss crowd control, every Ice level 3 freeze source', () => {
  const HASTE = PROFILE_CLAMPS.cooldownMul?.min ?? 1;
  const DT = 1 / 60;

  interface Source {
    name: string;
    period: number;
    hit: FrostHit;
  }
  const orb: Source = {
    name: 'frost orb',
    period: 4 * 1.4 * HASTE, // every 4th attack of a 1.4 s companion
    hit: frostOrbHit({ slowPct: 0.25, slowDuration: 1.5 }),
  };
  const deep: Source = {
    name: 'deep freeze',
    period: 12 * HASTE, // one Ice Storm cast, whose last tick freezes
    hit: deepFreezeHit({ slowPct: 0.5, slowDuration: 1 }),
  };
  const burst: Source = {
    name: 'nova burst',
    period: BASE_NOVA_BOMB_STATS.cooldown * HASTE,
    // The burst's roll comes up every time; its freeze length is the bomb's own.
    hit: {
      slowPct: BASE_NOVA_BOMB_STATS.slowPct,
      slowDuration: BASE_NOVA_BOMB_STATS.slowDuration,
      freeze: true,
      freezeDuration: BASE_NOVA_BOMB_STATS.freezeDuration,
    },
  };
  const all = [orb, deep, burst];

  it('runs at the cadences the plan names', () => {
    expect(all.map((s) => Number(s.period.toFixed(3)))).toEqual([1.96, 4.2, 1.225]);
    for (const source of all) expect(source.hit.freeze, source.name).toBe(true);
  });

  it('never freezes the boss, from any source or phasing, and slows it instead', () => {
    const cut = BOSS_CC_RESIST.durationFactor;
    for (const source of all) {
      for (const phase of [0, 0.3, 0.7, 1]) {
        let cc = NO_BOSS_CC;
        let frost = NO_FROST;
        for (let k = 0; k < 20; k += 1) {
          const nowS = source.period * (phase + k);
          const landed = bossFrost(cc, source.hit, nowS);
          cc = landed.state;
          frost = applyFrost(frost, landed.hit);
          expect(frost.frozenS, source.name).toBe(0);
          expect(landed.shrugged, source.name).toBe(true);
          expect(landed.hit.slowPct, source.name).toBeGreaterThanOrEqual(
            BOSS_CC_RESIST.freezeSlowPct,
          );
          // At most a quarter of the longer of its own slow and twice its freeze.
          const cap =
            cut *
            Math.max(
              source.hit.slowDuration,
              BOSS_CC_RESIST.freezeSlowPerFreezeS * freezeDurationOf(source.hit),
            );
          expect(landed.hit.slowDuration, source.name).toBeLessThanOrEqual(cap + 1e-9);
          expect(frost.slowRemainingS, source.name).toBeLessThanOrEqual(cap + 1e-9);
          frost = tickFrost(frost, source.period).state;
        }
      }
    }
  });

  it('keeps every source frame-by-frame unfrozen when all land together', () => {
    let cc = NO_BOSS_CC;
    let frost = NO_FROST;
    const next = all.map((s) => s.period);
    let slowedS = 0;
    for (let frame = 0; frame < Math.round(60 / DT); frame += 1) {
      const nowS = frame * DT;
      all.forEach((source, i) => {
        while (nowS >= next[i]! - 1e-9) {
          const landed = bossFrost(cc, source.hit, nowS);
          cc = landed.state;
          frost = applyFrost(frost, landed.hit);
          next[i]! += source.period;
        }
      });
      frost = tickFrost(frost, DT).state;
      expect(frost.frozenS).toBe(0);
      if (frost.slowRemainingS > 0) slowedS += DT;
    }
    expect(slowedS).toBeGreaterThan(0);
  });
});
