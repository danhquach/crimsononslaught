import { describe, expect, it } from 'vitest';
import { BOSS, BOSS_CC_DR } from '../config/boss';
import { BASE_SWORD_STATS } from '../config/lightningRoster';
import { PASSIVES } from '../config/passives';
import { RELIC_BUFFS } from '../config/relics';
import { FREEZE_DURATION } from '../config/spells';
import { NO_BOSS_CC, applyBossCc, diminishFrost, type BossCcState } from './bossCrowdControl';
import { freezeDurationOf, type FrostHit } from './frostNova';
import { startBossCycle, stepBossCycle } from './boss';
import { applyStagger, staggerSpeedFactor, tickStagger } from './status';

const { factor, resetS } = BOSS_CC_DR;

/** Apply `kind` for `durationS` at each of `times`; the durations the boss took. */
function run(kind: 'stun' | 'stagger' | 'slow', durationS: number, times: number[]): number[] {
  let state: BossCcState = NO_BOSS_CC;
  return times.map((nowS) => {
    const applied = applyBossCc(state, kind, durationS, nowS);
    state = applied.state;
    return applied.durationS;
  });
}

describe('applyBossCc (#315)', () => {
  it('takes the first application in full and halves each repeat', () => {
    const taken = run('stun', 2, [0, 0.5, 1, 1.5]);
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

  it('counts stun, stagger and slow apart', () => {
    let state: BossCcState = NO_BOSS_CC;
    const first = applyBossCc(state, 'stun', 2, 0);
    state = first.state;
    const stagger = applyBossCc(state, 'stagger', 0.5, 0.1);
    state = stagger.state;
    const slow = applyBossCc(state, 'slow', 3, 0.2);
    state = slow.state;
    expect([first.durationS, stagger.durationS, slow.durationS]).toEqual([2, 0.5, 3]);
    expect(applyBossCc(state, 'stun', 2, 0.3).durationS).toBe(2 * factor);
    expect(applyBossCc(state, 'stagger', 0.5, 0.3).durationS).toBe(0.5 * factor);
    expect(applyBossCc(state, 'slow', 3, 0.3).durationS).toBe(3 * factor);
  });

  it('passes a duration of 0 or less through and does not count it', () => {
    for (const durationS of [0, -1, NaN]) {
      const applied = applyBossCc(NO_BOSS_CC, 'stun', durationS, 5);
      expect(applied.state).toBe(NO_BOSS_CC);
      expect(applied.durationS).toBe(durationS);
    }
    // A stun roll that missed (0 s) between two real ones costs the second nothing.
    expect(run('stun', 2, [0, 1])).toEqual([2, 2 * factor]);
    let state = applyBossCc(NO_BOSS_CC, 'stun', 2, 0).state;
    state = applyBossCc(state, 'stun', 0, 0.5).state;
    expect(applyBossCc(state, 'stun', 2, 1).durationS).toBe(2 * factor);
  });

  it('does not change the state it is given', () => {
    const before = applyBossCc(NO_BOSS_CC, 'stun', 2, 0).state;
    const snapshot = JSON.stringify(before);
    applyBossCc(before, 'stun', 2, 1);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('diminishFrost (#315)', () => {
  const slowOnly: FrostHit = { slowPct: 0.4, slowDuration: 3, freeze: false };
  const freezing: FrostHit = { slowPct: 0.4, slowDuration: 3, freeze: true, freezeDuration: 2 };

  it('counts a freeze in the stun bucket, at the hit length or the default', () => {
    const first = diminishFrost(NO_BOSS_CC, freezing, 0, 0);
    expect(first.hit.freezeDuration).toBe(2);
    // The freeze is a stun: a lightning stun right after it is the second stun.
    expect(applyBossCc(first.state, 'stun', 2, 0.1).durationS).toBe(2 * factor);
    const bare = diminishFrost(NO_BOSS_CC, { ...freezing, freezeDuration: undefined }, 0, 0);
    expect(bare.hit.freezeDuration).toBe(FREEZE_DURATION);
  });

  it('scales the slow length, not its strength, in the slow bucket', () => {
    const first = diminishFrost(NO_BOSS_CC, slowOnly, 0, 0);
    expect(first.hit).toEqual(slowOnly);
    const second = diminishFrost(first.state, slowOnly, 0, 1);
    expect(second.hit.slowPct).toBe(0.4);
    expect(second.hit.slowDuration).toBe(3 * factor);
    // Slows never touched the stun bucket.
    expect(applyBossCc(second.state, 'stun', 2, 1).durationS).toBe(2);
  });

  it('leaves a hit that does not freeze without a freeze, and counts no stun for it', () => {
    const { state, hit } = diminishFrost(NO_BOSS_CC, slowOnly, 0, 0);
    expect(hit.freeze).toBe(false);
    expect(hit.freezeDuration).toBeUndefined();
    expect(state.stun).toBe(NO_BOSS_CC.stun);
  });

  it('counts no slow for a hit with no slow to give', () => {
    const noSlow: FrostHit = { slowPct: 0, slowDuration: 0, freeze: true, freezeDuration: 2 };
    const { state, hit } = diminishFrost(NO_BOSS_CC, noSlow, 0, 0);
    expect(state.slow).toBe(NO_BOSS_CC.slow);
    expect(hit.slowDuration).toBe(0);
  });

  it('never hands back a freeze shorter than the one running', () => {
    const first = diminishFrost(NO_BOSS_CC, freezing, 0, 0);
    // A repeat 0.1 s later would be 1 s; 1.9 s of the first freeze is left.
    const repeat = diminishFrost(first.state, freezing, 1.9, 0.1);
    expect(repeat.hit.freezeDuration).toBe(1.9);
    // With less than the diminished length left, the diminished one stands.
    const later = diminishFrost(repeat.state, freezing, 0.1, 0.2);
    expect(later.hit.freezeDuration).toBe(2 * factor ** 2);
    expect(diminishFrost(NO_BOSS_CC, freezing, 0, 0).hit.freezeDuration).toBe(2);
  });

  it('does not mutate the hit it is given', () => {
    const hit: FrostHit = { ...freezing };
    diminishFrost(diminishFrost(NO_BOSS_CC, hit, 0, 0).state, hit, 0, 1);
    expect(hit).toEqual(freezing);
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
 * three calls in this order: `applyBossCc` scales, `applyStagger` refreshes,
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
      const applied = diminishing ? applyBossCc(cc, 'stagger', staggerS, nowS) : undefined;
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
});
