import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  BOSS,
  BOSS_CHAIN,
  BOSS_ENRAGE,
  BOSS_SLAM,
  BOSS_SUMMON,
  BOSS_VOLLEY,
  type BossSkillId,
} from '../config/boss';
import {
  BOSS_EVENT,
  beginWindup,
  bossEnraged,
  bossMods,
  bossRangeBand,
  bossSkillsFor,
  chainChargeCount,
  enrageThresholdHp,
  enterEnrage,
  phaseLengthS,
  pickBossSkill,
  shouldEnrage,
  slamDamage,
  startBossCycle,
  stepBossCycle,
  summonCount,
  summonPack,
  summonPoints,
  type BossCycle,
  volleyBoltDirections,
  volleyDamage,
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
      skill: null,
      skillDir: { x: 0, y: 0 },
      clockS: 0,
      readyAtS: {},
      chainLength: 1,
      link: 0,
      telegraphAtS: 0,
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
        locks: [],
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

  it('has a 5250 HP threshold, and one rule for "enraged" at its edges', () => {
    expect(enrageThresholdHp()).toBe(5250);
    expect(bossEnraged(0)).toBe(false);
    expect(bossEnraged(1)).toBe(true);
    expect(bossEnraged(5250)).toBe(true);
    expect(bossEnraged(5251)).toBe(false);
  });

  it('latches once: a hit in range enrages a calm boss, never an enraged one', () => {
    expect(shouldEnrage(false, 5251)).toBe(false);
    expect(shouldEnrage(false, 5250)).toBe(true);
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

  it('keeps the chain-leg period across a long frame: 1.4 s chase, then the chain', () => {
    const cycle: BossCycle = { ...startBossCycle(), remainingS: ENRAGED_CHASE_S };
    // The default rand (0) draws two charges: 1.4 + 0.8 + 0.6 + (0.4 + 0.6) = 3.8 s a leg.
    const period = ENRAGED_CHASE_S + 0.8 + 0.6 + (BOSS_CHAIN.telegraphS + 0.6);
    expect(period).toBeCloseTo(3.8, 9);
    // The skill leg between them is empty (`skills = []`), so every leg is a charge leg.
    const { cycle: after } = stepBossCycle(
      cycle,
      period * 10 + 0.5,
      ORIGIN,
      { x: 100, y: 0 },
      1,
      true,
    );
    expect(after.phase).toBe('chase');
    expect(after.remainingS).toBeCloseTo(ENRAGED_CHASE_S - 0.5, 6);
  });

  it('moves at 182 px/s chasing, 520 charging and 0 telegraphing', () => {
    const target = { x: 100, y: 0 };
    const chase = stepBossCycle(
      { ...startBossCycle(), phase: 'chase', remainingS: 1, chargeDir: { x: 0, y: 0 } },
      0.5,
      ORIGIN,
      target,
      1,
      true,
    );
    expect(chase.velocity.x).toBeCloseTo(182, 6);
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
    expect(after.impacts).toMatchObject([{ skill: 'slam' }]);
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
    expect(step.impacts).toMatchObject([{ skill: 'slam' }]);
    expect(step.cycle.phase).toBe('skill');
    expect(stepBossCycle(step.cycle, 0.1, ORIGIN, TARGET, 1, false, SLAM).impacts).toEqual([]);
  });

  it('picks the one skill a list holds, and clamps the list to the last bar', () => {
    expect(pickBossSkill(['slam'], {}, 0, 0, () => 0.99)).toBe('slam');
    expect(pickBossSkill(['slam'], {}, 0, 999, () => 0)).toBe('slam');
    expect(bossSkillsFor(0)).toEqual(['slam']);
    expect(bossSkillsFor(1)).toEqual(['slam', 'volley', 'summon']);
    expect(bossSkillsFor(9)).toEqual(bossSkillsFor(BOSS.bars - 1));
    expect(bossSkillsFor(-1)).toEqual(bossSkillsFor(0));
  });

  it('keeps the chosen skill when the list changes mid-windup', () => {
    const chase = { ...startBossCycle(), next: 'skill' as const, remainingS: 0.1 };
    const windup = stepBossCycle(chase, 0.2, ORIGIN, TARGET, 1, false, SLAM).cycle;
    expect(windup).toMatchObject({ phase: 'windup', skill: 'slam' });
    const step = stepBossCycle(windup, 2, ORIGIN, TARGET, 1, false, []);
    expect(step.impacts).toMatchObject([{ skill: 'slam' }]);
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

describe('boss bolt volley (CO-223)', () => {
  const BOTH: readonly BossSkillId[] = ['slam', 'volley'];
  const TARGET = { x: 100, y: 0 };
  const DEG = Math.PI / 180;

  it('picks only ready skills, by weight: roll 0 is the first, the top of the roll the last', () => {
    expect(pickBossSkill(BOTH, {}, 0, 100, () => 0)).toBe('slam');
    expect(pickBossSkill(BOTH, {}, 0, 100, () => 0.999)).toBe('volley');
    // Cooling down until 15 s: only the slam is in the roll.
    expect(pickBossSkill(BOTH, { volley: 15 }, 14.9, 400, () => 0.999)).toBe('slam');
    expect(pickBossSkill(BOTH, { volley: 15 }, 15, 400, () => 0.999)).toBe('volley');
    expect(pickBossSkill(['volley'], { volley: 15 }, 1, 400, () => 0)).toBeNull();
    expect(pickBossSkill([], {}, 0, 0, () => 0)).toBeNull();
  });

  it('draws nothing from the stream when no skill is ready', () => {
    let draws = 0;
    const rand = () => (draws += 1);
    pickBossSkill(['volley'], { volley: 15 }, 1, 400, rand);
    pickBossSkill([], {}, 0, 0, rand);
    expect(draws).toBe(0);
    pickBossSkill(BOTH, {}, 0, 0, rand);
    expect(draws).toBe(1);
  });

  it('bands the hero distance: under 160 near, over 280 far, between mid', () => {
    expect(bossRangeBand(0)).toBe('near');
    expect(bossRangeBand(159.9)).toBe('near');
    expect(bossRangeBand(160)).toBe('mid');
    expect(bossRangeBand(280)).toBe('mid');
    expect(bossRangeBand(280.1)).toBe('far');
  });

  /** Share of `n` seeded rolls that pick `want`, with both skills ready. */
  function share(distancePx: number, want: BossSkillId, readyAtS = {}, seed = 7, n = 4000): number {
    const rng = createRng(seed);
    let hits = 0;
    for (let i = 0; i < n; i += 1)
      if (pickBossSkill(BOTH, readyAtS, 100, distancePx, () => rng.next()) === want) hits += 1;
    return hits / n;
  }

  it('near the hero it slams about 75% of the time, far it volleys about 75%', () => {
    expect(share(100, 'slam')).toBeGreaterThan(0.65);
    expect(share(100, 'slam')).toBeLessThan(0.85);
    expect(share(400, 'volley')).toBeGreaterThan(0.65);
    expect(share(400, 'volley')).toBeLessThan(0.85);
    // Mid: an even toss.
    expect(share(220, 'slam')).toBeGreaterThan(0.45);
    expect(share(220, 'slam')).toBeLessThan(0.55);
  });

  it('always slams while the volley cools, at any distance', () => {
    for (const d of [0, 100, 220, 400]) expect(share(d, 'slam', { volley: 999 }, 3, 500)).toBe(1);
  });

  it('repeats its picks for a seed and differs across seeds', () => {
    const picks = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 40 }, () => pickBossSkill(BOTH, {}, 0, 220, () => rng.next()));
    };
    expect(picks(5)).toEqual(picks(5));
    expect(picks(5)).not.toEqual(picks(6));
  });

  it('picks by the distance between boss and hero as the chase ends, through the cycle', () => {
    const chase = { ...startBossCycle(), next: 'skill' as const, remainingS: 0 };
    const high = () => 0.5;
    const far = stepBossCycle(chase, 0.01, ORIGIN, { x: 400, y: 0 }, 1, false, BOTH, high);
    const near = stepBossCycle(chase, 0.01, ORIGIN, { x: 50, y: 0 }, 1, false, BOTH, high);
    // The same roll: far, the middle of it is a volley; near, it falls on the slam.
    expect(far.cycle.skill).toBe('volley');
    expect(near.cycle.skill).toBe('slam');
  });

  it('never volleys on bar 1: that list holds the slam alone', () => {
    let cycle = startBossCycle();
    const seen = new Set<string>();
    for (let t = 0; t < 120; t += 0.05) {
      const step = stepBossCycle(cycle, 0.05, ORIGIN, TARGET, 1, false, bossSkillsFor(0));
      step.impacts.forEach((i) => seen.add(i.skill));
      cycle = step.cycle;
    }
    expect([...seen]).toEqual(['slam']);
  });

  it('falls back to a charge when the only skill is cooling down', () => {
    const chase = {
      ...startBossCycle(),
      next: 'skill' as const,
      remainingS: 0,
      readyAtS: { volley: 99 },
    };
    expect(stepBossCycle(chase, 0.01, ORIGIN, TARGET, 1, false, ['volley']).cycle.phase).toBe(
      'telegraph',
    );
  });

  for (const [label, stepS, enraged, heroX] of [
    ['1/60 s frames, far', 1 / 60, false, 400],
    ['3 s frames, far', 3, false, 400],
    ['1/60 s frames, near', 1 / 60, false, 100],
    ['3 s frames, near', 3, false, 100],
    ['1/60 s frames, far, enraged', 1 / 60, true, 400],
    ['3 s frames, far, enraged', 3, true, 400],
  ] as const) {
    it(`keeps volley wind-ups 15 s apart and still volleys over 180 s (${label})`, () => {
      const rng = createRng(11);
      const hero = { x: heroX, y: 0 };
      let cycle = startBossCycle();
      const starts: number[] = [];
      const impacts: number[] = [];
      for (let t = 0; t < 180 - 1e-9; t += stepS) {
        const step = stepBossCycle(cycle, stepS, ORIGIN, hero, 1, enraged, BOTH, () => rng.next());
        cycle = step.cycle;
        for (const hit of step.impacts) if (hit.skill === 'volley') impacts.push(hit.atS);
        const after = cycle.readyAtS.volley;
        if (after !== undefined && starts[starts.length - 1] !== after) starts.push(after);
      }
      // Each stamp is the wind-up's start plus the cooldown, so stamps 15 s apart = starts 15 s apart.
      for (let i = 1; i < starts.length; i += 1)
        expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(
          BOSS_VOLLEY.cooldownS - 1e-6,
        );
      for (let i = 1; i < impacts.length; i += 1)
        expect((impacts[i] as number) - (impacts[i - 1] as number)).toBeGreaterThanOrEqual(
          BOSS_VOLLEY.cooldownS - 1e-6,
        );
      expect(impacts.length).toBeGreaterThanOrEqual(heroX > 280 ? 3 : 1);
    });
  }

  it('locks the aim as the wind-up starts and reports it at the impact', () => {
    const chase = { ...startBossCycle(), next: 'skill' as const, remainingS: 0 };
    const wound = stepBossCycle(chase, 0.01, ORIGIN, { x: 0, y: 50 }, 1, false, ['volley']);
    expect(wound.cycle.skillDir).toEqual({ x: 0, y: 1 });
    // The hero moves; the aim stays.
    const landed = stepBossCycle(wound.cycle, 2, ORIGIN, { x: 50, y: 0 }, 1, false, ['volley']);
    expect(landed.impacts).toHaveLength(1);
    expect(landed.impacts[0]?.aim).toEqual({ x: 0, y: 1 });
    expect(landed.impacts[0]?.atS).toBeCloseTo(BOSS_VOLLEY.windupS, 9);
  });

  it('fires 14 bolts: slot 0 on the aim, none within 11 degrees of the sides', () => {
    for (const aim of [0, 1, -2.5, Math.PI]) {
      const dirs = volleyBoltDirections(aim);
      expect(dirs).toHaveLength(14);
      expect(Math.atan2(dirs[0]?.y as number, dirs[0]?.x as number)).toBeCloseTo(
        Math.atan2(Math.sin(aim), Math.cos(aim)),
        9,
      );
      for (const side of [aim + Math.PI / 2, aim - Math.PI / 2]) {
        for (const d of dirs) {
          const diff = Math.atan2(
            Math.sin(Math.atan2(d.y, d.x) - side),
            Math.cos(Math.atan2(d.y, d.x) - side),
          );
          expect(Math.abs(diff)).toBeGreaterThan(11 * DEG);
        }
      }
    }
  });

  it('deals 25, or 37.5 enraged', () => {
    expect(volleyDamage(false)).toBe(25);
    expect(volleyDamage(true)).toBe(37.5);
  });
});

describe('boss summon (CO-224)', () => {
  const ALL: readonly BossSkillId[] = ['slam', 'volley', 'summon'];
  const TARGET = { x: 100, y: 0 };
  const BLOCKED = new Set<BossSkillId>(['summon']);
  const ARENA = { width: 3000, height: 3000 };

  it('is on the second bar only', () => {
    expect(bossSkillsFor(0)).not.toContain('summon');
    expect(bossSkillsFor(1)).toContain('summon');
    let cycle = startBossCycle();
    const seen = new Set<string>();
    for (let t = 0; t < 120; t += 0.05) {
      const step = stepBossCycle(cycle, 0.05, ORIGIN, TARGET, 1, false, bossSkillsFor(0));
      step.impacts.forEach((i) => seen.add(i.skill));
      cycle = step.cycle;
    }
    expect(seen.has('summon')).toBe(false);
  });

  it('weights it 1:2:2 near, mid, far against the others at one each', () => {
    const rng = createRng(3);
    const share = (d: number) => {
      let n = 0;
      for (let i = 0; i < 6000; i += 1)
        if (pickBossSkill(ALL, {}, 0, d, () => rng.next()) === 'summon') n += 1;
      return n / 6000;
    };
    // Near 1/(3+1+1), mid 2/(1+1+2), far 2/(1+3+2).
    expect(share(100)).toBeCloseTo(1 / 5, 1);
    expect(share(220)).toBeCloseTo(2 / 4, 1);
    expect(share(400)).toBeCloseTo(2 / 6, 1);
  });

  it('never picks a blocked skill, and charges instead when it was the only one left', () => {
    for (const d of [0, 100, 220, 400])
      for (const roll of [0, 0.3, 0.6, 0.999])
        expect(pickBossSkill(ALL, {}, 0, d, () => roll, BLOCKED)).not.toBe('summon');
    // Capped, the others cooling: no skill, so the leg is a charge.
    expect(pickBossSkill(ALL, { slam: 99, volley: 99 }, 1, 100, () => 0, BLOCKED)).toBeNull();
    expect(pickBossSkill(ALL, { slam: 99 }, 1, 100, () => 0.999, BLOCKED)).toBe('volley');
    expect(pickBossSkill(['summon'], {}, 1, 100, () => 0, BLOCKED)).toBeNull();
    const chase = { ...startBossCycle(), next: 'skill' as const, remainingS: 0 };
    const step = stepBossCycle(chase, 0.01, ORIGIN, TARGET, 1, false, ['summon'], () => 0, BLOCKED);
    expect(step.cycle.phase).toBe('telegraph');
    expect(
      stepBossCycle(chase, 0.01, ORIGIN, TARGET, 1, false, ['summon'], () => 0).cycle.skill,
    ).toBe('summon');
  });

  it('stamps the cooldown as the wind-up starts', () => {
    const chase = { ...startBossCycle(), next: 'skill' as const, remainingS: 0, clockS: 20 };
    const step = stepBossCycle(chase, 0.01, ORIGIN, TARGET, 1, false, ['summon']);
    expect(step.cycle.readyAtS.summon).toBeCloseTo(20 + BOSS_SUMMON.cooldownS, 9);
  });

  it('winds up for 1 s and lands 0.6 s of pose after', () => {
    expect(phaseLengthS('windup', false, 'summon')).toBe(BOSS_SUMMON.windupS);
    expect(phaseLengthS('skill', true, 'summon')).toBe(BOSS_SUMMON.activeS);
  });

  it('places the pack on a ring of 110 px, the first on the aim, evenly', () => {
    const c = { x: 1500, y: 1500 };
    const pts = summonPoints(c, 0.7, undefined, undefined, ARENA);
    expect(pts).toHaveLength(BOSS_SUMMON.packSize);
    for (const p of pts) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(110, 6);
    expect(pts[0]?.x).toBeCloseTo(c.x + Math.cos(0.7) * 110, 6);
    expect(pts[0]?.y).toBeCloseTo(c.y + Math.sin(0.7) * 110, 6);
    const angle = (p: { x: number; y: number }) => Math.atan2(p.y - c.y, p.x - c.x);
    const gap = (angle(pts[1] as never) - angle(pts[0] as never) + 2 * Math.PI) % (2 * Math.PI);
    expect(gap).toBeCloseTo((2 * Math.PI) / 5, 6);
    expect(summonPoints(c, 0.7, undefined, undefined, ARENA)).toEqual(pts);
  });

  it('keeps every circle inside the arena by the circle radius', () => {
    for (const c of [
      { x: 5, y: 5 },
      { x: 2995, y: 1500 },
      { x: 1500, y: 2999 },
      { x: 0, y: 3000 },
    ])
      for (const aim of [0, 1.5, 3, -2]) {
        for (const p of summonPoints(c, aim, undefined, undefined, ARENA)) {
          expect(p.x).toBeGreaterThanOrEqual(BOSS_SUMMON.circleRadius);
          expect(p.x).toBeLessThanOrEqual(ARENA.width - BOSS_SUMMON.circleRadius);
          expect(p.y).toBeGreaterThanOrEqual(BOSS_SUMMON.circleRadius);
          expect(p.y).toBeLessThanOrEqual(ARENA.height - BOSS_SUMMON.circleRadius);
        }
      }
  });

  it('counts the pack as the cap and the pool allow', () => {
    expect(summonCount(0, 999)).toBe(5);
    expect(summonCount(5, 999)).toBe(5);
    expect(summonCount(7, 999)).toBe(3);
    expect(summonCount(10, 999)).toBe(0);
    expect(summonCount(14, 999)).toBe(0);
    expect(summonCount(0, 2)).toBe(2);
    expect(summonCount(0, 0)).toBe(0);
    expect(summonCount(0, -3)).toBe(0);
  });

  it('draws the pack from the higher tiers, never Swarm or a splitling (CO-231)', () => {
    const rng = createRng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) for (const type of summonPack(rng, 5)) seen.add(type);
    expect([...seen].sort()).toEqual([...BOSS_SUMMON.types].sort());
    expect(seen.has('swarm')).toBe(false);
    expect(seen.has('splitling')).toBe(false);
  });

  it('puts at most 2 Tanks and Shielded together in a landing (CO-231)', () => {
    const rng = createRng(3);
    const heavy = new Set<string>(BOSS_SUMMON.heavy);
    let full = 0;
    for (let i = 0; i < 2000; i += 1) {
      const n = summonPack(rng, 5).filter((type) => heavy.has(type)).length;
      expect(n).toBeLessThanOrEqual(BOSS_SUMMON.maxHeavy);
      if (n === BOSS_SUMMON.maxHeavy) full += 1;
    }
    // The cap is reached, not just never hit by chance.
    expect(full).toBeGreaterThan(0);
  });

  it('weights the light types equally (CO-231)', () => {
    const rng = createRng(5);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i += 1)
      for (const type of summonPack(rng, 1)) counts[type] = (counts[type] ?? 0) + 1;
    const share = 4000 / BOSS_SUMMON.types.length;
    for (const type of BOSS_SUMMON.types)
      expect(Math.abs((counts[type] ?? 0) - share)).toBeLessThan(share * 0.15);
  });

  it('replays the same pack from the same seed, one draw a member (CO-231)', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(summonPack(a, 5)).toEqual(summonPack(b, 5));
    expect(summonPack(createRng(1), 0)).toEqual([]);
    const c = createRng(9);
    summonPack(c, 3);
    const d = createRng(9);
    d.next();
    d.next();
    d.next();
    expect(c.next()).toBe(d.next());
  });

  it('keeps the pack under the cap whatever the kills: two summons on a full cap add nothing', () => {
    let live = 0;
    for (let i = 0; i < 6; i += 1) live += summonCount(live, 999);
    expect(live).toBe(BOSS_SUMMON.maxLive);
  });

  for (const [label, stepS, enraged] of [
    ['1/60 s frames', 1 / 60, false],
    ['3 s frames', 3, false],
    ['1/60 s frames, enraged', 1 / 60, true],
    ['3 s frames, enraged', 3, true],
  ] as const) {
    it(`keeps summon wind-ups 14 s apart and still summons over 180 s (${label})`, () => {
      const rng = createRng(11);
      const hero = { x: 400, y: 0 };
      let cycle = startBossCycle();
      const starts: number[] = [];
      const impacts: number[] = [];
      for (let t = 0; t < 180 - 1e-9; t += stepS) {
        const step = stepBossCycle(cycle, stepS, ORIGIN, hero, 1, enraged, ALL, () => rng.next());
        cycle = step.cycle;
        for (const hit of step.impacts) if (hit.skill === 'summon') impacts.push(hit.atS);
        const after = cycle.readyAtS.summon;
        if (after !== undefined && starts[starts.length - 1] !== after) starts.push(after);
      }
      for (let i = 1; i < starts.length; i += 1)
        expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(
          BOSS_SUMMON.cooldownS - 1e-6,
        );
      for (let i = 1; i < impacts.length; i += 1)
        expect((impacts[i] as number) - (impacts[i - 1] as number)).toBeGreaterThanOrEqual(
          BOSS_SUMMON.cooldownS - 1e-6,
        );
      expect(impacts.length).toBeGreaterThanOrEqual(2);
    });
  }
});

describe('calm cycle is unchanged (CO-225)', () => {
  const ALL: readonly BossSkillId[] = ['slam', 'volley', 'summon'];

  /**
   * Calm boss, 180 s, `createRng(11)`, all skills: a readable summary of the
   * whole run. Pinned on the code before the chain charge existed, so a calm
   * boss provably still behaves as it did (`dist` re-pinned for CO-230's faster
   * chase; nothing else moved). To regenerate (only for a change
   * meant to alter calm behaviour): log `summary(...)` and paste it below.
   */
  function summary(stepS: number, heroX: number) {
    const rng = createRng(11);
    const hero = { x: heroX, y: 0 };
    let cycle = startBossCycle();
    let transitions = 0;
    let vx = 0;
    let vy = 0;
    const impacts: string[] = [];
    for (let t = 0; t < 180 - 1e-9; t += stepS) {
      const step = stepBossCycle(cycle, stepS, ORIGIN, hero, 1, false, ALL, () => rng.next());
      if (step.cycle.phase !== cycle.phase) transitions += 1;
      cycle = step.cycle;
      vx += step.velocity.x * stepS;
      vy += step.velocity.y * stepS;
      for (const hit of step.impacts) impacts.push(`${hit.skill}@${hit.atS.toFixed(3)}`);
    }
    return {
      transitions,
      dist: `${vx.toFixed(3)},${vy.toFixed(3)}`,
      end: `${cycle.phase} ${cycle.remainingS.toFixed(9)} ${cycle.next} ${cycle.clockS.toFixed(3)}`,
      impacts: impacts.slice(0, 8),
      impactCount: impacts.length,
    };
  }

  const PINNED = {
    a: {
      transitions: 133,
      dist: '21660.000,0.000',
      end: 'telegraph 0.700000000 charge 180.000',
      impacts: [
        'slam@7.600',
        'slam@15.600',
        'volley@23.800',
        'slam@31.900',
        'summon@39.900',
        'slam@48.100',
        'slam@56.100',
        'slam@64.100',
      ],
      impactCount: 22,
    },
    b: {
      transitions: 130,
      dist: '21296.000,0.000',
      end: 'windup 0.200000000 skill 180.000',
      impacts: [
        'volley@7.800',
        'summon@15.900',
        'volley@24.300',
        'summon@32.400',
        'volley@40.800',
        'summon@48.900',
        'slam@57.100',
        'volley@65.300',
      ],
      impactCount: 21,
    },
  };

  it('matches the pinned run at 1/60 s frames, hero 100 and 400 px out', () => {
    expect(summary(1 / 60, 100)).toEqual(PINNED.a);
    expect(summary(1 / 60, 400)).toEqual(PINNED.b);
  });

  it('matches the same pinned run at 3 s frames, transitions aside', () => {
    expect(summary(3, 100)).toEqual({ ...PINNED.a, transitions: 41 });
    expect(summary(3, 400)).toEqual({ ...PINNED.b, transitions: 40 });
  });

  it('draws nothing from rand when calm with no skills', () => {
    let draws = 0;
    let cycle = startBossCycle();
    for (let t = 0; t < 60; t += 0.05)
      cycle = stepBossCycle(cycle, 0.05, ORIGIN, { x: 100, y: 0 }, 1, false, [], () => {
        draws += 1;
        return 0.5;
      }).cycle;
    expect(draws).toBe(0);
  });
});

describe('chain charge (CO-225)', () => {
  const ENRAGED_CHASE_S = 1.4;
  const unit = (dx: number, dy: number) => {
    const d = Math.hypot(dx, dy);
    return { x: dx / d, y: dy / d };
  };

  /** An enraged cycle at the start of a chase, stepped in `stepS` slices; `rand` is counted. */
  function run(
    totalS: number,
    stepS: number,
    draw: number,
    targetAt: (t: number) => { x: number; y: number } = () => ({ x: 100, y: 0 }),
  ) {
    let cycle: BossCycle = { ...startBossCycle(), remainingS: ENRAGED_CHASE_S };
    const phases: string[] = [];
    const locks: ReturnType<typeof stepBossCycle>['locks'][number][] = [];
    const targets: { x: number; y: number }[] = [];
    let draws = 0;
    let dist = 0;
    for (let t = 0; t < totalS - 1e-9; t += stepS) {
      const target = targetAt(t);
      const step = stepBossCycle(cycle, stepS, ORIGIN, target, 1, true, [], () => {
        draws += 1;
        return draw;
      });
      for (const lock of step.locks) {
        locks.push(lock);
        targets.push(target);
      }
      dist += Math.hypot(step.velocity.x, step.velocity.y) * stepS;
      cycle = step.cycle;
      if (phases[phases.length - 1] !== cycle.phase) phases.push(cycle.phase);
    }
    return { phases, locks, targets, draws, dist, cycle };
  }

  it('counts BOSS_CHAIN.maxCharges (2) whatever rand draws, with one draw', () => {
    let draws = 0;
    const count = (value: number) =>
      chainChargeCount(() => {
        draws += 1;
        return value;
      });
    expect([0, 0.4999, 0.5, 0.99999, 1].map(count)).toEqual([2, 2, 2, 2, 2]);
    expect(draws).toBe(5);
  });

  it('runs chase, telegraph, charge, telegraph, charge, chase for two charges', () => {
    const { phases, locks } = run(3.8 + 0.2, 0.01, 0);
    expect(phases).toEqual(['chase', 'telegraph', 'charge', 'telegraph', 'charge', 'chase']);
    expect(locks).toHaveLength(2);
  });

  it('never chains past maxCharges when rand draws high', () => {
    const { phases, locks } = run(3.8 + 0.2, 0.01, 0.9);
    expect(phases).toEqual(['chase', 'telegraph', 'charge', 'telegraph', 'charge', 'chase']);
    expect(locks.map((l) => [l.link, l.chainLength])).toEqual([
      [0, BOSS_CHAIN.maxCharges],
      [1, BOSS_CHAIN.maxCharges],
    ]);
  });

  it('warns 0.8 s before the first charge and 0.4 s before each chained one', () => {
    const { locks } = run(5, 0.01, 0.9);
    expect(locks.map((l) => l.chained)).toEqual([false, true]);
    for (const lock of locks) {
      const warn = lock.link === 0 ? BOSS.telegraphS : BOSS_CHAIN.telegraphS;
      expect(lock.atS - lock.telegraphAtS).toBeCloseTo(warn, 9);
    }
    // The next telegraph begins as the charge before it ends, 0.6 s after its lock.
    expect((locks[1] as { telegraphAtS: number }).telegraphAtS).toBeCloseTo(
      (locks[0] as { atS: number }).atS + BOSS.chargeS,
      9,
    );
  });

  it('draws once per chain from rand, and never when calm', () => {
    expect(run(ENRAGED_CHASE_S + 0.8 + 0.6 + 1.0 + 0.1, 0.01, 0).draws).toBe(1);
    // Three full chains of two: 3 x 3.8 s, 1.4 s chase in.
    expect(run(3.8 * 3 + 0.1, 0.01, 0).draws).toBe(3);
    let calmDraws = 0;
    let cycle = startBossCycle();
    for (let t = 0; t < 30; t += 0.05)
      cycle = stepBossCycle(cycle, 0.05, ORIGIN, { x: 100, y: 0 }, 1, false, [], () => {
        calmDraws += 1;
        return 0.5;
      }).cycle;
    expect(calmDraws).toBe(0);
  });

  it('re-aims each chained charge at where the hero stands as its telegraph ends', () => {
    // The hero walks along +y: every lock must follow it, so no two directions repeat.
    const { locks, targets } = run(5, 0.01, 0.9, (t) => ({ x: 100, y: 60 * t }));
    expect(locks).toHaveLength(2);
    locks.forEach((lock, i) => {
      const t = targets[i] as { x: number; y: number };
      const want = unit(t.x, t.y);
      expect(lock.dir.x).toBeCloseTo(want.x, 9);
      expect(lock.dir.y).toBeCloseTo(want.y, 9);
    });
    expect(locks[1]?.dir.y).toBeGreaterThan(locks[0]?.dir.y as number);
  });

  it('a long frame reports every lock once and moves the boss as the small frames do', () => {
    const small = run(10, 1 / 60, 0.9);
    const long = run(10, 10, 0.9);
    expect(long.locks).toHaveLength(small.locks.length);
    expect(long.locks.map((l) => [l.link, l.chainLength])).toEqual(
      small.locks.map((l) => [l.link, l.chainLength]),
    );
    expect(long.draws).toBe(small.draws);
    // 520 px/s for 0.6 s per charge, plus the chase legs: a single 10 s frame averages the
    // velocity, so compare the straight-line distance the whole frame asks for.
    const charges = small.locks.length;
    expect(long.dist).toBeCloseTo(small.dist, 3);
    expect(charges).toBeGreaterThanOrEqual(2);
  });

  it('an enrage mid-telegraph leaves that charge single, then a chain starts the leg after', () => {
    let cycle: BossCycle = startBossCycle();
    // Calm: into the first telegraph.
    for (let t = 0; t < 2.7; t += 0.05)
      cycle = stepBossCycle(cycle, 0.05, ORIGIN, { x: 100, y: 0 }, 1, false).cycle;
    expect(cycle.phase).toBe('telegraph');
    const enraged = enterEnrage(cycle);
    expect(enraged).toBe(cycle);
    expect(enraged.chainLength).toBe(1);
    const phases: string[] = [];
    for (let t = 0; t < 1.6; t += 0.05) {
      cycle = stepBossCycle(cycle, 0.05, ORIGIN, { x: 100, y: 0 }, 1, true).cycle;
      if (phases[phases.length - 1] !== cycle.phase) phases.push(cycle.phase);
    }
    expect(phases).toEqual(['telegraph', 'charge', 'chase']);
  });

  it('a forced wind-up mid-chain drops the rest of the chain', () => {
    let cycle: BossCycle = { ...startBossCycle(), remainingS: ENRAGED_CHASE_S };
    for (let t = 0; t < 2.9; t += 0.05)
      cycle = stepBossCycle(cycle, 0.05, ORIGIN, { x: 100, y: 0 }, 1, true, [], () => 0.9).cycle;
    expect(cycle.chainLength).toBe(BOSS_CHAIN.maxCharges);
    expect(cycle.link).toBeGreaterThan(0);
    const forced = beginWindup(cycle, 'slam', cycle.clockS, ORIGIN, { x: 100, y: 0 });
    expect(forced.chainLength).toBe(1);
    expect(forced.link).toBe(0);
  });

  it('phaseLengthS gives the chained telegraph only when asked', () => {
    expect(phaseLengthS('telegraph', true, null, true)).toBe(BOSS_CHAIN.telegraphS);
    expect(phaseLengthS('telegraph', true)).toBe(BOSS.telegraphS);
    expect(phaseLengthS('charge', true, null, true)).toBe(BOSS.chargeS);
  });
});
