import { describe, expect, it } from 'vitest';
import { BOSS, BOSS_ENRAGE, BOSS_SLAM } from '../config/boss';
import {
  BOSS_EVENT,
  bossEnraged,
  bossMods,
  bossSkillsFor,
  enrageThresholdHp,
  enterEnrage,
  phaseLengthS,
  pickBossSkill,
  shouldEnrage,
  slamDamage,
  startBossCycle,
  stepBossCycle,
  type BossCycle,
} from './boss';

const ORIGIN = { x: 0, y: 0 };
const CHASE_S = BOSS.cycleS - BOSS.telegraphS - BOSS.chargeS;
/** How far one whole cycle moves the boss: the chase leg plus the charge leg. */
const CYCLE_DISTANCE = CHASE_S * BOSS.speed + BOSS.chargeS * BOSS.chargeSpeed;

/** Run the cycle forward `totalS` seconds in fixed `stepS` slices toward a fixed target. */
function advance(cycle: BossCycle, totalS: number, stepS: number, target = { x: 100, y: 0 }) {
  let next = cycle;
  for (let t = 0; t < totalS - 1e-9; t += stepS)
    next = stepBossCycle(next, stepS, ORIGIN, target).cycle;
  return next;
}

describe('startBossCycle (CO-050)', () => {
  it('opens with a chase that fills the cycle around the telegraph and charge', () => {
    expect(startBossCycle()).toEqual({
      phase: 'chase',
      remainingS: CHASE_S,
      chargeDir: { x: 0, y: 0 },
      next: 'charge',
      skillTurn: 0,
      skill: null,
    });
    expect(CHASE_S).toBeCloseTo(2.6, 9);
  });
});

describe('stepBossCycle phases', () => {
  it('counts a phase down without leaving it', () => {
    const { cycle } = stepBossCycle(startBossCycle(), 1, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S - 1, 9);
  });

  it('runs chase -> telegraph -> charge -> chase, one telegraph before every charge', () => {
    let cycle = startBossCycle();
    cycle = stepBossCycle(cycle, CHASE_S, ORIGIN, { x: 100, y: 0 }).cycle;
    expect(cycle.phase).toBe('telegraph');
    expect(cycle.remainingS).toBeCloseTo(BOSS.telegraphS, 9);
    cycle = stepBossCycle(cycle, BOSS.telegraphS, ORIGIN, { x: 100, y: 0 }).cycle;
    expect(cycle.phase).toBe('charge');
    expect(cycle.remainingS).toBeCloseTo(BOSS.chargeS, 9);
    cycle = stepBossCycle(cycle, BOSS.chargeS, ORIGIN, { x: 100, y: 0 }).cycle;
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S, 9);
  });

  it('carries a frame that overruns a phase into the next one', () => {
    const { cycle } = stepBossCycle(startBossCycle(), CHASE_S + 0.4, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('telegraph');
    expect(cycle.remainingS).toBeCloseTo(BOSS.telegraphS - 0.4, 9);
  });

  it('a frame longer than several phases lands in the right one', () => {
    // A whole cycle and a second later: through telegraph and charge, 1 s into the next chase.
    const { cycle } = stepBossCycle(startBossCycle(), BOSS.cycleS + 1, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S - 1, 9);
  });

  it('telegraphs every 4 s over a long run, and every charge follows a telegraph', () => {
    let cycle = startBossCycle();
    let previous = cycle.phase;
    let charges = 0;
    const stepS = 1 / 60;
    for (let t = 0; t < 60; t += stepS) {
      cycle = stepBossCycle(cycle, stepS, ORIGIN, { x: 100, y: 0 }).cycle;
      if (cycle.phase === 'charge' && previous !== 'charge') {
        expect(previous).toBe('telegraph');
        charges += 1;
      }
      previous = cycle.phase;
    }
    // Charges start at 3.4 s, 7.4 s, ... 59.4 s: fifteen in a minute.
    expect(charges).toBe(15);
  });

  it('ignores a zero, negative or non-finite frame', () => {
    const start = startBossCycle();
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stepBossCycle(start, bad, ORIGIN, { x: 100, y: 0 }), String(bad)).toEqual({
        cycle: start,
        velocity: { x: 0, y: 0 },
        impacts: [],
      });
    }
  });
});

describe('charge direction lock', () => {
  it('is fixed toward the target where it stood as the telegraph ended', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 }).cycle;
    // The frame that ends the telegraph sees the player at (30, 40): a 3-4-5 triangle.
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, { x: 30, y: 40 }).cycle;
    expect(charge.phase).toBe('charge');
    expect(charge.chargeDir.x).toBeCloseTo(0.6, 9);
    expect(charge.chargeDir.y).toBeCloseTo(0.8, 9);
    // The player moves during the charge; the boss does not turn.
    const later = stepBossCycle(charge, 0.2, ORIGIN, { x: -500, y: -500 });
    expect(later.cycle.phase).toBe('charge');
    expect(later.cycle.chargeDir).toEqual(charge.chargeDir);
    expect(later.velocity.x).toBeCloseTo(0.6 * BOSS.chargeSpeed, 9);
    expect(later.velocity.y).toBeCloseTo(0.8 * BOSS.chargeSpeed, 9);
  });

  it('does not move during the telegraph, then charges straight along the lock at 400 px/s', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 }).cycle;
    expect(
      stepBossCycle(telegraph, BOSS.telegraphS / 2, ORIGIN, { x: 100, y: 0 }).velocity,
    ).toEqual({ x: 0, y: 0 });
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, { x: 30, y: 40 }).cycle;
    const { velocity } = stepBossCycle(charge, BOSS.chargeS, ORIGIN, { x: -500, y: -500 });
    expect(velocity.x).toBeCloseTo(0.6 * BOSS.chargeSpeed, 9);
    expect(velocity.y).toBeCloseTo(0.8 * BOSS.chargeSpeed, 9);
  });

  it('a target standing on the boss as the telegraph ends leaves it nowhere to charge', () => {
    const telegraph = stepBossCycle(startBossCycle(), CHASE_S, ORIGIN, { x: 100, y: 0 }).cycle;
    const charge = stepBossCycle(telegraph, BOSS.telegraphS, ORIGIN, ORIGIN).cycle;
    expect(charge.phase).toBe('charge');
    expect(stepBossCycle(charge, BOSS.chargeS, ORIGIN, { x: 100, y: 0 }).velocity).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('the velocity a frame asks for', () => {
  it('chases the target at the boss speed between charges', () => {
    expect(stepBossCycle(startBossCycle(), 1, ORIGIN, { x: 0, y: 50 }).velocity).toEqual({
      x: 0,
      y: BOSS.speed,
    });
  });

  it('scales every move by the status speed factor, the charge included', () => {
    expect(stepBossCycle(startBossCycle(), 1, ORIGIN, { x: 0, y: 50 }, 0.5).velocity).toEqual({
      x: 0,
      y: BOSS.speed * 0.5,
    });
    const charge = advance(startBossCycle(), CHASE_S + BOSS.telegraphS, 0.1);
    expect(charge.phase).toBe('charge');
    const { velocity } = stepBossCycle(charge, BOSS.chargeS, ORIGIN, ORIGIN, 0.5);
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(BOSS.chargeSpeed * 0.5, 6);
    expect(stepBossCycle(charge, BOSS.chargeS, ORIGIN, ORIGIN, 0).velocity).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('spreads a frame that spans phases over the whole frame, not the phase it ends in', () => {
    // One whole cycle in one frame: 2.6 s of chase and 0.6 s of charge, both
    // toward (100, 0), with the telegraph standing still between them.
    const { velocity } = stepBossCycle(startBossCycle(), BOSS.cycleS, ORIGIN, { x: 100, y: 0 });
    expect(velocity.y).toBe(0);
    expect(velocity.x * BOSS.cycleS).toBeCloseTo(CYCLE_DISTANCE, 9);
    // Not the chase speed the frame ends in, and not the charge speed either.
    expect(velocity.x).toBeGreaterThan(BOSS.speed);
    expect(velocity.x).toBeLessThan(BOSS.chargeSpeed);
  });

  it('never charges further than 0.6 s of charge, however long the frame', () => {
    // The bug behind #89: a frame longer than the charge used to fly the boss at
    // 400 px/s for its whole length, throwing it thousands of px out of the
    // arena and out of reach of a melee spell.
    for (const deltaS of [1, 1.7, 4, 12, 60]) {
      const { velocity } = stepBossCycle(startBossCycle(), deltaS, ORIGIN, { x: 100, y: 0 });
      const cycles = deltaS / BOSS.cycleS;
      // At most one charge per cycle started, plus the part-cycle the frame ends in.
      const ceiling = (Math.ceil(cycles) * CYCLE_DISTANCE) / deltaS;
      expect(Math.hypot(velocity.x, velocity.y), `${deltaS} s`).toBeLessThanOrEqual(ceiling);
    }
  });

  it('holds the 4 s period over a long frame while moving only what the phases ask', () => {
    // Three whole cycles and a second of the fourth in one frame: three chase
    // legs, three charges and one more second of chase, no more.
    const deltaS = BOSS.cycleS * 3 + 1;
    const { cycle, velocity } = stepBossCycle(startBossCycle(), deltaS, ORIGIN, { x: 100, y: 0 });
    expect(cycle.phase).toBe('chase');
    expect(cycle.remainingS).toBeCloseTo(CHASE_S - 1, 9);
    expect(velocity.x * deltaS).toBeCloseTo(CYCLE_DISTANCE * 3 + BOSS.speed, 9);
  });
});

describe('boss enrage (#388)', () => {
  const ENRAGED_CHASE_S = 1.4;

  it('has a 3600 HP threshold, and one rule for "enraged" at its edges', () => {
    expect(enrageThresholdHp()).toBe(3600);
    expect(bossEnraged(0)).toBe(false);
    expect(bossEnraged(1)).toBe(true);
    expect(bossEnraged(3600)).toBe(true);
    expect(bossEnraged(3601)).toBe(false);
  });

  it('latches once: a hit in range enrages a calm boss, never an enraged one', () => {
    expect(shouldEnrage(false, 3601)).toBe(false);
    expect(shouldEnrage(false, 3600)).toBe(true);
    expect(shouldEnrage(true, 3000)).toBe(false);
    expect(shouldEnrage(false, 0)).toBe(false);
  });

  it('names its event', () => {
    expect(BOSS_EVENT.enrage).toBe('boss:enrage');
  });

  it('mods are all ones when calm and the config when enraged', () => {
    expect(bossMods(false)).toEqual({ damage: 1, speed: 1, damageTaken: 1 });
    expect(bossMods(true)).toEqual({
      damage: BOSS_ENRAGE.damageMul,
      speed: BOSS_ENRAGE.speedMul,
      damageTaken: BOSS_ENRAGE.damageTakenMul,
    });
  });

  it('shortens only the chase leg: 1.4 s, telegraph and charge untouched', () => {
    expect(phaseLengthS('chase', true)).toBeCloseTo(ENRAGED_CHASE_S, 9);
    expect(phaseLengthS('chase')).toBeCloseTo(CHASE_S, 9);
    expect(phaseLengthS('telegraph', true)).toBe(BOSS.telegraphS);
    expect(phaseLengthS('charge', true)).toBe(BOSS.chargeS);
  });

  it('keeps a 2.8 s period across a long frame', () => {
    const cycle: BossCycle = { ...startBossCycle(), remainingS: ENRAGED_CHASE_S };
    // Ten whole enraged cycles and 0.5 s: back to chase, 0.5 s in.
    const { cycle: after } = stepBossCycle(
      cycle,
      2.8 * 10 + 0.5,
      ORIGIN,
      { x: 100, y: 0 },
      1,
      true,
    );
    expect(after.phase).toBe('chase');
    expect(after.remainingS).toBeCloseTo(ENRAGED_CHASE_S - 0.5, 6);
  });

  it('moves at 91 px/s chasing, 520 charging and 0 telegraphing', () => {
    const target = { x: 100, y: 0 };
    const chase = stepBossCycle(
      { ...startBossCycle(), phase: 'chase', remainingS: 1, chargeDir: { x: 0, y: 0 } },
      0.5,
      ORIGIN,
      target,
      1,
      true,
    );
    expect(chase.velocity.x).toBeCloseTo(91, 6);
    const telegraph = stepBossCycle(
      { ...startBossCycle(), phase: 'telegraph', remainingS: 0.8, chargeDir: { x: 0, y: 0 } },
      0.5,
      ORIGIN,
      target,
      1,
      true,
    );
    expect(telegraph.velocity).toEqual({ x: 0, y: 0 });
    const charge = stepBossCycle(
      { ...startBossCycle(), phase: 'charge', remainingS: 0.6, chargeDir: { x: 1, y: 0 } },
      0.3,
      ORIGIN,
      target,
      1,
      true,
    );
    expect(charge.velocity.x).toBeCloseTo(520, 6);
  });

  it('a stun (speed factor 0) still holds an enraged boss still', () => {
    const { velocity } = stepBossCycle(startBossCycle(), 0.5, ORIGIN, { x: 100, y: 0 }, 0, true);
    expect(velocity.x).toBe(0);
    expect(velocity.y).toBe(0);
  });

  it('calm stepping is unchanged by the new parameter', () => {
    const calm = stepBossCycle(startBossCycle(), 0.5, ORIGIN, { x: 100, y: 0 });
    expect(calm.velocity.x).toBeCloseTo(BOSS.speed, 9);
  });

  it('cuts a running chase to the enraged one and leaves other phases alone', () => {
    const chasing: BossCycle = {
      ...startBossCycle(),
      phase: 'chase',
      remainingS: 2.5,
      chargeDir: { x: 0, y: 0 },
    };
    expect(enterEnrage(chasing).remainingS).toBeCloseTo(ENRAGED_CHASE_S, 9);
    const nearlyDone = { ...chasing, remainingS: 0.3 };
    expect(enterEnrage(nearlyDone).remainingS).toBe(0.3);
    const telegraph: BossCycle = {
      ...startBossCycle(),
      phase: 'telegraph',
      remainingS: 0.7,
      chargeDir: { x: 0, y: 0 },
    };
    expect(enterEnrage(telegraph)).toBe(telegraph);
    const charge: BossCycle = {
      ...startBossCycle(),
      phase: 'charge',
      remainingS: 0.5,
      chargeDir: { x: 1, y: 0 },
    };
    expect(enterEnrage(charge)).toBe(charge);
  });
});

describe('skill rotation (CO-222)', () => {
  const SLAM = ['slam' as const];
  const TARGET = { x: 100, y: 0 };

  /** Step in `stepS` slices, collecting each frame's phase and impacts. */
  function run(totalS: number, stepS: number, enraged = false) {
    let cycle = startBossCycle();
    const phases: string[] = [];
    let impacts = 0;
    for (let t = 0; t < totalS - 1e-9; t += stepS) {
      const step = stepBossCycle(cycle, stepS, ORIGIN, TARGET, 1, enraged, SLAM);
      impacts += step.impacts.length;
      cycle = step.cycle;
      if (phases[phases.length - 1] !== cycle.phase) phases.push(cycle.phase);
    }
    return { phases, impacts, cycle };
  }

  it('runs charge, then a skill: chase, telegraph, charge, chase, windup, skill, chase, telegraph', () => {
    const { phases } = run(14, 0.05);
    expect(phases.slice(0, 8)).toEqual([
      'chase',
      'telegraph',
      'charge',
      'chase',
      'windup',
      'skill',
      'chase',
      'telegraph',
    ]);
  });

  it('keeps the old charge-only cycle when given no skills', () => {
    let cycle = startBossCycle();
    for (let t = 0; t < 30; t += 0.05) {
      cycle = stepBossCycle(cycle, 0.05, ORIGIN, TARGET).cycle;
      expect(['chase', 'telegraph', 'charge']).toContain(cycle.phase);
    }
  });

  it('opens with the charge: first windup at 6.6 s, impact at 7.6 s', () => {
    const before = stepBossCycle(startBossCycle(), 7.5, ORIGIN, TARGET, 1, false, SLAM);
    expect(before.cycle.phase).toBe('windup');
    expect(before.impacts).toEqual([]);
    const after = stepBossCycle(startBossCycle(), 7.7, ORIGIN, TARGET, 1, false, SLAM);
    expect(after.cycle.phase).toBe('skill');
    expect(after.impacts).toEqual([{ skill: 'slam' }]);
  });

  it('alternates charge and skill legs over a minute: charges 8 s apart', () => {
    let cycle = startBossCycle();
    let charges = 0;
    let slams = 0;
    for (let t = 0; t < 60; t += 0.05) {
      const previous = cycle.phase;
      const step = stepBossCycle(cycle, 0.05, ORIGIN, TARGET, 1, false, SLAM);
      cycle = step.cycle;
      if (previous !== 'charge' && cycle.phase === 'charge') charges += 1;
      slams += step.impacts.length;
    }
    // Charges at 3.4 s, 11.4 s, ... 59.4 s; slams land at 7.6 s, 15.6 s, ... 55.6 s.
    expect(charges).toBe(8);
    expect(slams).toBe(7);
  });

  it('holds still in the windup and the landing', () => {
    for (const phase of ['windup', 'skill'] as const) {
      const cycle = { ...startBossCycle(), phase, remainingS: 0.5, skill: 'slam' as const };
      expect(stepBossCycle(cycle, 0.3, ORIGIN, TARGET, 1, false, SLAM).velocity).toEqual({
        x: 0,
        y: 0,
      });
    }
  });

  it('lands each slam exactly once, whatever the frame length', () => {
    // Landings at 7.6 s, 15.6 s, ... 55.6 s: seven in a minute.
    for (const stepS of [1 / 60, 0.37, 5]) expect(run(60, stepS).impacts, String(stepS)).toBe(7);
    // One frame covering many cycles still reports every landing.
    expect(
      stepBossCycle(startBossCycle(), 60, ORIGIN, TARGET, 1, false, SLAM).impacts,
    ).toHaveLength(7);
  });

  it('lands on the exact boundary of the windup, once', () => {
    const windup = {
      ...startBossCycle(),
      phase: 'windup' as const,
      remainingS: 1,
      skill: 'slam' as const,
    };
    const step = stepBossCycle(windup, 1, ORIGIN, TARGET, 1, false, SLAM);
    expect(step.impacts).toEqual([{ skill: 'slam' }]);
    expect(step.cycle.phase).toBe('skill');
    expect(stepBossCycle(step.cycle, 0.1, ORIGIN, TARGET, 1, false, SLAM).impacts).toEqual([]);
  });

  it('picks round-robin from a list, and clamps the list to the last bar', () => {
    expect(pickBossSkill(['slam'], 0)).toBe('slam');
    expect(pickBossSkill(['slam'], 5)).toBe('slam');
    expect(bossSkillsFor(0)).toEqual(['slam']);
    expect(bossSkillsFor(1)).toEqual(['slam']);
    expect(bossSkillsFor(9)).toEqual(bossSkillsFor(BOSS.bars - 1));
    expect(bossSkillsFor(-1)).toEqual(bossSkillsFor(0));
  });

  it('keeps the chosen skill when the list changes mid-windup, and counts the turn once', () => {
    const chase = { ...startBossCycle(), next: 'skill' as const, remainingS: 0.1 };
    const windup = stepBossCycle(chase, 0.2, ORIGIN, TARGET, 1, false, SLAM).cycle;
    expect(windup).toMatchObject({ phase: 'windup', skill: 'slam', skillTurn: 1 });
    const step = stepBossCycle(windup, 2, ORIGIN, TARGET, 1, false, []);
    expect(step.impacts).toEqual([{ skill: 'slam' }]);
    expect(step.cycle.skillTurn).toBe(1);
  });

  it('does not shorten a windup or landing when enrage starts', () => {
    const windup = {
      ...startBossCycle(),
      phase: 'windup' as const,
      remainingS: 0.7,
      skill: 'slam' as const,
    };
    expect(enterEnrage(windup)).toBe(windup);
    const skill = { ...windup, phase: 'skill' as const };
    expect(enterEnrage(skill)).toBe(skill);
    expect(phaseLengthS('windup', true, 'slam')).toBe(BOSS_SLAM.windupS);
    expect(phaseLengthS('skill', true, 'slam')).toBe(BOSS_SLAM.activeS);
  });

  it('enraged, the chase before a windup is 1.4 s', () => {
    const chase = { ...startBossCycle(), next: 'skill' as const, remainingS: 1.4 };
    expect(stepBossCycle(chase, 1.39, ORIGIN, TARGET, 1, true, SLAM).cycle.phase).toBe('chase');
    expect(stepBossCycle(chase, 1.41, ORIGIN, TARGET, 1, true, SLAM).cycle.phase).toBe('windup');
    expect(phaseLengthS('chase', true)).toBeCloseTo(1.4, 9);
  });

  it('deals 30, or 45 enraged', () => {
    expect(slamDamage(false)).toBe(30);
    expect(slamDamage(true)).toBe(45);
  });

  it('has an event name for the landing', () => {
    expect(BOSS_EVENT.skill).toBe('boss:skill');
  });
});
