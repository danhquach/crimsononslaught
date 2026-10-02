import { describe, expect, it } from 'vitest';
import { BOSS, BOSS_CC_DR, BOSS_CC_RESIST } from '../config/boss';
import { BASE_SWORD_STATS } from '../config/lightningRoster';
import { PASSIVES } from '../config/passives';
import { RELIC_BUFFS } from '../config/relics';
import { FREEZE_DURATION } from '../config/spells';
import {
  NO_BOSS_CC,
  applyBossCc,
  bossFrost,
  immunePopDue,
  resistBossCc,
  type BossCcState,
} from './bossCrowdControl';
import { freezeDurationOf, type FrostHit } from './frostNova';
import { startBossCycle, stepBossCycle } from './boss';
import { applyStagger, staggerSpeedFactor, tickStagger } from './status';

const { factor, resetS } = BOSS_CC_DR;
const resist = BOSS_CC_RESIST;
const cut = resist.durationFactor;

/** Apply `kind` for `durationS` at each of `times`; the durations the boss took. */
function run(kind: 'stagger' | 'slow', durationS: number, times: number[]): number[] {
  let state: BossCcState = NO_BOSS_CC;
  return times.map((nowS) => {
    const applied = applyBossCc(state, kind, durationS, nowS);
    state = applied.state;
    return applied.durationS;
  });
}

describe('applyBossCc (#315)', () => {
  it('takes the first application in full and halves each repeat', () => {
    const taken = run('stagger', 2, [0, 0.5, 1, 1.5]);
    expect(taken).toEqual([2, 2 * factor, 2 * factor ** 2, 2 * factor ** 3]);
  });

  it('starts over once a kind has gone resetS without an application', () => {
    const taken = run('stagger', 1, [0, 1, 1 + resetS - 0.01, 1 + 2 * resetS]);
    // The third lands just inside the window the second opened, the fourth
    // a full window after the third.
    expect(taken).toEqual([1, factor, factor ** 2, 1]);
  });

  it('measures the window from the last application, not the first', () => {
    const times = [0, 3, 6, 9];
    expect(run('slow', 1, times)).toEqual([1, factor, factor ** 2, factor ** 3]);
  });

  it('counts stagger and slow apart', () => {
    let state: BossCcState = NO_BOSS_CC;
    const stagger = applyBossCc(state, 'stagger', 0.5, 0.1);
    state = stagger.state;
    const slow = applyBossCc(state, 'slow', 3, 0.2);
    state = slow.state;
    expect([stagger.durationS, slow.durationS]).toEqual([0.5, 3]);
    expect(applyBossCc(state, 'stagger', 0.5, 0.3).durationS).toBe(0.5 * factor);
    expect(applyBossCc(state, 'slow', 3, 0.3).durationS).toBe(3 * factor);
  });

  it('passes a duration of 0 or less through and does not count it', () => {
    for (const durationS of [0, -1, NaN]) {
      const applied = applyBossCc(NO_BOSS_CC, 'stagger', durationS, 5);
      expect(applied.state).toBe(NO_BOSS_CC);
      expect(applied.durationS).toBe(durationS);
    }
    // A roll that missed (0 s) between two real ones costs the second nothing.
    expect(run('stagger', 2, [0, 1])).toEqual([2, 2 * factor]);
    let state = applyBossCc(NO_BOSS_CC, 'stagger', 2, 0).state;
    state = applyBossCc(state, 'stagger', 0, 0.5).state;
    expect(applyBossCc(state, 'stagger', 2, 1).durationS).toBe(2 * factor);
  });

  it('does not change the state it is given', () => {
    const before = applyBossCc(NO_BOSS_CC, 'stagger', 2, 0).state;
    const snapshot = JSON.stringify(before);
    applyBossCc(before, 'stagger', 2, 1);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('resistBossCc (CO-221)', () => {
  it('cuts a first stagger or slow to a quarter, then halves repeats on top', () => {
    for (const kind of ['stagger', 'slow'] as const) {
      let state: BossCcState = NO_BOSS_CC;
      const taken = [0, 0.5, 1].map((nowS) => {
        const applied = resistBossCc(state, kind, 2, nowS);
        state = applied.state;
        return applied.durationS;
      });
      expect(taken).toEqual([2 * cut, 2 * cut * factor, 2 * cut * factor ** 2]);
    }
  });

  it('starts over at a quarter once resetS has passed', () => {
    const first = resistBossCc(NO_BOSS_CC, 'stagger', 2, 0);
    expect(resistBossCc(first.state, 'stagger', 2, resetS + 0.1).durationS).toBe(2 * cut);
  });

  it('counts nothing for a duration of 0 or less', () => {
    const applied = resistBossCc(NO_BOSS_CC, 'slow', 0, 0);
    expect(applied.state).toBe(NO_BOSS_CC);
    expect(applied.durationS).toBe(0);
  });

  it('cuts the Persistence-stretched length at every rank, with and without Everfrost', () => {
    for (let rank = 0; rank <= 20; rank++) {
      for (const relic of [1, EVERFROST]) {
        const mul = PERSISTENCE ** rank * relic;
        const stretched = BASE_SWORD_STATS.staggerDuration * mul;
        const first = resistBossCc(NO_BOSS_CC, 'stagger', stretched, 0);
        expect(first.durationS).toBeCloseTo(cut * BASE_SWORD_STATS.staggerDuration * mul, 9);
        const second = resistBossCc(first.state, 'stagger', stretched, 0.1);
        expect(second.durationS).toBeCloseTo(first.durationS * factor, 9);
      }
    }
  });
});

describe('bossFrost (CO-221)', () => {
  const slowOnly: FrostHit = { slowPct: 0.4, slowDuration: 3, freeze: false };
  const freezing: FrostHit = { slowPct: 0, slowDuration: 0, freeze: true, freezeDuration: 2 };

  it('turns a base freeze into a 50% slow of twice its length, cut to a quarter', () => {
    const base: FrostHit = { slowPct: 0, slowDuration: 0, freeze: true };
    const r = bossFrost(NO_BOSS_CC, base, 0);
    expect(r.shrugged).toBe(true);
    expect(r.hit.freeze).toBe(false);
    expect(r.hit.freezeDuration).toBeUndefined();
    expect(r.hit.slowPct).toBe(resist.freezeSlowPct);
    // A base 1 s freeze: 1 s x 2 x 0.25 = 0.5 s.
    expect(FREEZE_DURATION).toBe(1);
    expect(r.hit.slowDuration).toBe(0.5);
  });

  it('scales with the freeze length', () => {
    expect(bossFrost(NO_BOSS_CC, freezing, 0).hit.slowDuration).toBe(1);
  });

  it('keeps a stronger or longer slow the hit already carries', () => {
    const iceSlow: FrostHit = { slowPct: 0.6, slowDuration: 10, freeze: true, freezeDuration: 1 };
    const r = bossFrost(NO_BOSS_CC, iceSlow, 0);
    expect(r.hit.slowPct).toBe(0.6);
    expect(r.hit.slowDuration).toBe(10 * cut);
  });

  it('counts one slow application for a freeze that also slows', () => {
    const both: FrostHit = { slowPct: 0.6, slowDuration: 1, freeze: true, freezeDuration: 2 };
    const first = bossFrost(NO_BOSS_CC, both, 0);
    expect(first.state.slow.count).toBe(1);
    expect(first.state.stagger).toBe(NO_BOSS_CC.stagger);
  });

  it('halves a repeat inside the window', () => {
    const first = bossFrost(NO_BOSS_CC, freezing, 0);
    const second = bossFrost(first.state, freezing, 1);
    expect(second.hit.slowDuration).toBe(1 * factor);
    const base: FrostHit = { slowPct: 0, slowDuration: 0, freeze: true };
    const b1 = bossFrost(NO_BOSS_CC, base, 0);
    expect(bossFrost(b1.state, base, 1).hit.slowDuration).toBe(0.5 * factor);
  });

  it('cuts a plain slow to a quarter in length, not strength, and shrugs nothing', () => {
    const r = bossFrost(NO_BOSS_CC, slowOnly, 0);
    expect(r.shrugged).toBe(false);
    expect(r.hit.freeze).toBe(false);
    expect(r.hit.freezeDuration).toBeUndefined();
    expect(r.hit.slowPct).toBe(0.4);
    expect(r.hit.slowDuration).toBe(3 * cut);
    expect(bossFrost(r.state, slowOnly, 1).hit.slowDuration).toBe(3 * cut * factor);
  });

  it('counts nothing for a hit with no freeze and no slow', () => {
    const none: FrostHit = { slowPct: 0, slowDuration: 0, freeze: false };
    const r = bossFrost(NO_BOSS_CC, none, 0);
    expect(r.state).toBe(NO_BOSS_CC);
    expect(r.shrugged).toBe(false);
  });

  it('does not mutate the hit or the state it is given', () => {
    const hit: FrostHit = { ...freezing };
    const state = bossFrost(NO_BOSS_CC, hit, 0).state;
    const snapshot = JSON.stringify(state);
    bossFrost(state, hit, 1);
    expect(hit).toEqual(freezing);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('immunePopDue (CO-221)', () => {
  it('is due for the first pop, and again once the gap has passed', () => {
    expect(immunePopDue(-Infinity, 0)).toBe(true);
    expect(immunePopDue(0, resist.immunePopGapS - 0.01)).toBe(false);
    expect(immunePopDue(0, resist.immunePopGapS)).toBe(true);
  });
});

describe('freezeDurationOf', () => {
  it('is the hit length, else the default', () => {
    expect(
      freezeDurationOf({ slowPct: 0, slowDuration: 0, freeze: true, freezeDuration: 1.5 }),
    ).toBe(1.5);
    expect(freezeDurationOf({ slowPct: 0, slowDuration: 0, freeze: true })).toBe(FREEZE_DURATION);
  });
});

/**
 * The lock the ticket describes: Lightning Sword's stagger, stretched by
 * Persistence, is re-applied before the last one ends. `Boss` runs the same
 * three calls in this order: `resistBossCc` scales, `applyStagger` refreshes,
 * `tickStagger` counts down, and the cycle moves at `staggerSpeedFactor`.
 */
const STEP_S = 0.01;
const WINDOW_S = BOSS.cycleS;
const PERSISTENCE = PASSIVES.find((p) => p.id === 'passive_persistence')?.amount ?? NaN;
const EVERFROST = RELIC_BUFFS.find((b) => b.id === 'relic_everfrost')?.amount ?? NaN;
/** Three blades on the 4.5 rad/s ring pass a point this often. */
const BLADE_PASS_S = (2 * Math.PI) / (BASE_SWORD_STATS.count * BASE_SWORD_STATS.orbitSpeed);

function fightWindow(
  staggerS: number,
  everyS: number,
  diminishing: boolean,
): { staggeredFraction: number; chargeTravelPx: number } {
  let cc: BossCcState = NO_BOSS_CC;
  let remainingS = 0;
  let cycle = startBossCycle();
  const steps = Math.round(WINDOW_S / STEP_S);
  let staggered = 0;
  let chargeTravelPx = 0;
  let hits = 0;
  for (let i = 0; i < steps; i++) {
    const nowS = i * STEP_S;
    while (nowS >= hits * everyS - 1e-9) {
      hits += 1;
      const applied = diminishing ? resistBossCc(cc, 'stagger', staggerS, nowS) : undefined;
      if (applied) cc = applied.state;
      remainingS = applyStagger(remainingS, applied ? applied.durationS : staggerS);
    }
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

describe('Lightning Sword against the boss (#315)', () => {
  const cases = [
    { name: '4 Persistence', mul: PERSISTENCE ** 4, everyS: BASE_SWORD_STATS.hitCooldown },
    { name: '2 Persistence + Everfrost', mul: PERSISTENCE ** 2 * EVERFROST, everyS: BLADE_PASS_S },
  ];

  for (const { name, mul, everyS } of cases) {
    const staggerS = BASE_SWORD_STATS.staggerDuration * mul;

    it(`${name}: the stretched stagger outlasts the re-hit, so an undiminished boss never moves`, () => {
      expect(staggerS).toBeGreaterThan(everyS);
      const locked = fightWindow(BASE_SWORD_STATS.staggerDuration * mul, everyS, false);
      expect(locked.staggeredFraction).toBe(1);
      expect(locked.chargeTravelPx).toBe(0);
    });

    it(`${name}: diminishing returns leave the boss free, and its charge lands`, () => {
      const free = fightWindow(staggerS, everyS, true);
      expect(free.staggeredFraction).toBeLessThan(0.5);
      // Most of the charge's 0.6 s at 400 px/s is travelled, not frozen out.
      expect(free.chargeTravelPx).toBeGreaterThan(0.5 * BOSS.chargeSpeed * BOSS.chargeS);
    });
  }

  it('a heavy Persistence + Everfrost stack still leaves the boss free and its charge landing (CO-221)', () => {
    const staggerS = BASE_SWORD_STATS.staggerDuration * PERSISTENCE ** 10 * EVERFROST;
    const free = fightWindow(staggerS, BLADE_PASS_S, true);
    expect(free.staggeredFraction).toBeLessThan(0.5);
    expect(free.chargeTravelPx).toBeGreaterThan(0.5 * BOSS.chargeSpeed * BOSS.chargeS);
  });
});
