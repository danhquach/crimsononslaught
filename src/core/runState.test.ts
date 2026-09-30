import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES } from '../config/enemies';
import { HIT_STOP_BUDGET_MS, HIT_STOP_MS } from '../config/hitFeedback';
import { ROSTER_SPELL_IDS } from '../config/loadout';
import { BOSS_START_TIME } from '../config/waves';
import { RUN_EVENT, RUN_EVENT_NAMES, type RunEvent, type RunEventName } from './runEvents';
import { resolveSeed } from './rng';
import { isRunStats } from './scenePayloads';
import {
  BOSS_START_MS,
  MAX_SWITCH_LIST,
  MAX_SWITCH_TOKENS,
  MAX_TIME_SCALE,
  MIN_TIME_SCALE,
  RunState,
  SIM_STEP_MS,
  type RunFrame,
  clampTimeScale,
  gateTestSwitches,
  resolveInvulnerable,
  resolveEnemyFilter,
  parseLoadoutSwitch,
  resolveLoadout,
  resolveLoadoutLevels,
  resolveStartAt,
  resolveTimeScale,
  simulationSteps,
} from './runState';

/** Records every run event in order; only `emit` is exercised by RunState. */
function recordingEmitter() {
  const events: RunEvent[] = [];
  const byName = new Map<string, RunEventName>(
    RUN_EVENT_NAMES.map((name) => [RUN_EVENT[name], name]),
  );
  return {
    events,
    of: (name: RunEventName) => events.filter((e) => e.name === name),
    emit(event: string, ...args: unknown[]) {
      const name = byName.get(event);
      if (name) events.push({ name, payload: args[0] } as RunEvent);
      return true;
    },
  };
}

const newRun = (timeScale?: number) => {
  const emitter = recordingEmitter();
  return { emitter, run: new RunState(emitter, timeScale) };
};

describe('BOSS_START_MS', () => {
  it('is the boss start time from the wave table, in milliseconds', () => {
    expect(BOSS_START_MS).toBe(BOSS_START_TIME * 1000);
  });
});

describe('RunState initial state', () => {
  it('starts at zero on the waves phase with level 1 and no kills or xp', () => {
    const { run } = newRun();
    expect(run.elapsedMs).toBe(0);
    expect(run.phase).toBe('waves');
    expect(run.level).toBe(1);
    expect(run.kills).toBe(0);
    expect(run.xp).toBe(0);
  });

  it('emits nothing before the first tick', () => {
    const { emitter } = newRun();
    expect(emitter.events).toEqual([]);
  });
});

describe('RunState.tick', () => {
  it('accumulates the clock and emits the absolute elapsed time each frame', () => {
    const { emitter, run } = newRun();
    run.tick(16);
    run.tick(16);
    expect(run.elapsedMs).toBe(32);
    expect(emitter.of('timer')).toEqual([
      { name: 'timer', payload: { elapsedMs: 16 } },
      { name: 'timer', payload: { elapsedMs: 32 } },
    ]);
  });

  it('returns the half-open window [startMs, startMs + deltaMs) the frame covers', () => {
    const { run } = newRun();
    expect(run.tick(16)).toEqual({ startMs: 0, deltaMs: 16 });
    expect(run.tick(20)).toEqual({ startMs: 16, deltaMs: 20 });
  });

  it('multiplies the frame delta by the time scale', () => {
    const { run } = newRun(10);
    expect(run.tick(16)).toEqual({ startMs: 0, deltaMs: 160 });
    expect(run.elapsedMs).toBe(160);
  });

  it('runs at real time when handed a scale that is not a positive finite number', () => {
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const run = new RunState(recordingEmitter(), scale);
      expect(run.tick(16)).toEqual({ startMs: 0, deltaMs: 16 });
    }
  });

  it('ignores a non-positive or non-finite delta without emitting', () => {
    const { emitter, run } = newRun();
    for (const delta of [0, -16, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(run.tick(delta)).toEqual({ startMs: 0, deltaMs: 0 });
    }
    expect(run.elapsedMs).toBe(0);
    expect(emitter.events).toEqual([]);
  });
});

describe('RunState.hitStop', () => {
  it('freezes the front of the next frame and moves the rest', () => {
    const { run } = newRun();
    run.tick(100);
    run.hitStop(HIT_STOP_MS);
    expect(run.tick(100)).toEqual({ startMs: 100, deltaMs: 100 - HIT_STOP_MS });
    expect(run.elapsedMs).toBe(200 - HIT_STOP_MS);
  });

  it('carries a long freeze across frames, holding the clock but still publishing it', () => {
    const { run, emitter } = newRun();
    run.hitStop(HIT_STOP_MS);
    expect(run.tick(16)).toEqual({ startMs: 0, deltaMs: 0 });
    expect(simulationSteps(run.tick(16))).toEqual([]);
    expect(emitter.of('timer').map((e) => e.payload)).toEqual([{ elapsedMs: 0 }, { elapsedMs: 0 }]);
    expect(run.tick(100).deltaMs).toBeCloseTo(100 - (HIT_STOP_MS - 32));
  });

  it('freezes in run time, so a scaled run freezes for the same share of itself', () => {
    const { run } = newRun(10);
    run.hitStop(HIT_STOP_MS);
    // One 16 ms frame at scale 10 is 160 ms of run time; the freeze is 45 of it.
    expect(run.tick(16).deltaMs).toBeCloseTo(160 - HIT_STOP_MS);
  });

  it('never adds requests up, and never freezes more than the budget', () => {
    const { run } = newRun();
    for (let i = 0; i < 100; i += 1) run.hitStop(HIT_STOP_BUDGET_MS * 10);
    expect(run.tick(10_000).deltaMs).toBe(10_000 - HIT_STOP_BUDGET_MS);
  });

  it('does nothing once the run is over', () => {
    const { run } = newRun();
    run.end();
    run.hitStop(HIT_STOP_MS);
    expect(run.tick(100)).toEqual({ startMs: 0, deltaMs: 0 });
  });

  it('slows a run heavy-hitting twice a second by under a tenth, and hands out only what moved', () => {
    const plain = newRun().run;
    const frozen = newRun().run;
    let frozenWindows = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      if (frame % 30 === 0) frozen.hitStop(HIT_STOP_MS);
      plain.tick(16);
      frozenWindows += frozen.tick(16).deltaMs;
    }
    expect(frozenWindows).toBeCloseTo(frozen.elapsedMs);
    expect(frozen.elapsedMs).toBeLessThan(plain.elapsedMs);
    expect(frozen.elapsedMs).toBeGreaterThan(plain.elapsedMs * 0.9);
  });
});

describe('RunState phase transitions', () => {
  it('stays on waves right up to the boss boundary', () => {
    const { emitter, run } = newRun();
    run.tick(BOSS_START_MS - 1);
    expect(run.phase).toBe('waves');
    expect(emitter.of('phase')).toEqual([]);
  });

  it('turns to boss on the frame that reaches the boundary, once', () => {
    const { emitter, run } = newRun();
    run.tick(BOSS_START_MS);
    expect(run.phase).toBe('boss');
    run.tick(16);
    run.tick(16);
    expect(emitter.of('phase')).toEqual([{ name: 'phase', payload: { phase: 'boss' } }]);
  });

  it('emits the timer before the phase it crossed into, so listeners see the clock first', () => {
    const { emitter, run } = newRun();
    run.tick(BOSS_START_MS + 40);
    expect(emitter.events).toEqual([
      { name: 'timer', payload: { elapsedMs: BOSS_START_MS + 40 } },
      { name: 'phase', payload: { phase: 'boss' } },
    ]);
  });

  it('reaches the boss phase across many small frames', () => {
    const { run } = newRun(10);
    for (let i = 0; i < BOSS_START_MS / 160; i += 1) run.tick(16);
    expect(run.phase).toBe('boss');
  });
});

describe('RunState.end', () => {
  it('moves to the over phase and emits it once', () => {
    const { emitter, run } = newRun();
    run.tick(1000);
    run.end();
    run.end();
    expect(run.phase).toBe('over');
    expect(emitter.of('phase')).toEqual([{ name: 'phase', payload: { phase: 'over' } }]);
  });

  it('freezes the clock: later ticks neither advance it nor emit', () => {
    const { emitter, run } = newRun();
    run.tick(1000);
    run.end();
    const before = emitter.events.length;
    expect(run.tick(16)).toEqual({ startMs: 1000, deltaMs: 0 });
    expect(run.elapsedMs).toBe(1000);
    expect(emitter.events).toHaveLength(before);
  });

  it('ends a run that is already in the boss phase', () => {
    const { run } = newRun();
    run.tick(BOSS_START_MS);
    run.end();
    expect(run.phase).toBe('over');
  });
});

describe('RunState.recordKill', () => {
  it('emits the running total, not the delta', () => {
    const { emitter, run } = newRun();
    run.recordKill();
    run.recordKill();
    expect(run.kills).toBe(2);
    expect(emitter.of('kill')).toEqual([
      { name: 'kill', payload: { kills: 1 } },
      { name: 'kill', payload: { kills: 2 } },
    ]);
  });
});

describe('RunState.addXp', () => {
  it('emits progress inside the level with the level threshold', () => {
    const { emitter, run } = newRun();
    expect(run.addXp(1)).toBe(0);
    expect(run.addXp(3)).toBe(0);
    expect(run.xp).toBe(4);
    expect(run.level).toBe(1);
    expect(emitter.of('xp')).toEqual([
      { name: 'xp', payload: { xp: 1, xpToNext: 15, level: 1 } },
      { name: 'xp', payload: { xp: 4, xpToNext: 15, level: 1 } },
    ]);
  });

  it('levels on the curve and carries the surplus over', () => {
    const { emitter, run } = newRun();
    run.addXp(12);
    expect(run.addXp(10)).toBe(1);
    expect(run.level).toBe(2);
    expect(run.xp).toBe(7);
    expect(run.xpToNext).toBe(20);
    expect(emitter.of('xp').at(-1)).toEqual({
      name: 'xp',
      payload: { xp: 7, xpToNext: 20, level: 2 },
    });
  });

  it('reports every level a single gain crossed, in one event (spec §5)', () => {
    const { emitter, run } = newRun();
    expect(run.addXp(100)).toBe(4);
    expect(run.level).toBe(5);
    expect(run.xp).toBe(10);
    expect(emitter.of('xp')).toEqual([{ name: 'xp', payload: { xp: 10, xpToNext: 35, level: 5 } }]);
  });

  it('ignores a non-positive amount', () => {
    const { emitter, run } = newRun();
    expect(run.addXp(0)).toBe(0);
    expect(run.addXp(-5)).toBe(0);
    expect(run.xp).toBe(0);
    expect(emitter.of('xp')).toEqual([]);
  });
});

describe('RunState.stats', () => {
  it('produces a valid RunStats for the result screen', () => {
    const { run } = newRun();
    run.tick(1500);
    run.recordKill();
    run.addXp(15);
    run.addEmbers(3);
    run.recordConsumable();
    run.recordRelic();
    run.recordRelic();

    const stats = run.stats('fire');
    expect(isRunStats(stats)).toBe(true);
    expect(stats).toEqual({
      timeSurvivedMs: 1500,
      level: 2,
      kills: 1,
      spellId: 'fire',
      embers: 3,
      consumables: 1,
      relics: 2,
    });
  });

  it('starts every pickup tally at 0', () => {
    const { run } = newRun();
    expect(run.stats('ice')).toMatchObject({ embers: 0, consumables: 0, relics: 0 });
  });
});

describe('RunState.addEmbers (#195)', () => {
  it('emits the running total, not the delta', () => {
    const { emitter, run } = newRun();
    run.addEmbers(1);
    run.addEmbers(3);
    run.addEmbers(100);
    expect(run.embers).toBe(104);
    expect(emitter.of('embers')).toEqual([
      { name: 'embers', payload: { embers: 1 } },
      { name: 'embers', payload: { embers: 4 } },
      { name: 'embers', payload: { embers: 104 } },
    ]);
  });

  it('ignores nothing collected: no change, no event', () => {
    const { emitter, run } = newRun();
    for (const amount of [0, -3, Number.NaN, Infinity]) run.addEmbers(amount);
    expect(run.embers).toBe(0);
    expect(emitter.of('embers')).toEqual([]);
  });
});

describe('RunState pickup counts (#195)', () => {
  it('returns each running total', () => {
    const { run } = newRun();
    expect(run.recordConsumable()).toBe(1);
    expect(run.recordConsumable()).toBe(2);
    expect(run.recordRelic()).toBe(1);
    expect(run.consumables).toBe(2);
    expect(run.relics).toBe(1);
  });
});

describe('clampTimeScale', () => {
  it('keeps a positive finite scale, up to the ceiling', () => {
    expect(clampTimeScale(10)).toBe(10);
    expect(clampTimeScale(0.5)).toBe(0.5);
    expect(clampTimeScale(MAX_TIME_SCALE * 5)).toBe(MAX_TIME_SCALE);
  });

  it('caps at the fastest scale the arena still plays correctly at (#89)', () => {
    // Pinned, not derived: above this the per-frame decisions stop tracking the
    // arena and the boss outlives Earth's ring. The full-run browser check
    // drives this same ceiling, so raising it here turns that check red.
    expect(MAX_TIME_SCALE).toBe(30);
  });

  it('holds a tiny positive scale at the floor, so the run clock still moves (#316)', () => {
    expect(MIN_TIME_SCALE).toBe(0.1);
    for (const value of [1e-320, Number.MIN_VALUE, 0.01, MIN_TIME_SCALE / 2]) {
      expect(clampTimeScale(value)).toBe(MIN_TIME_SCALE);
    }
    expect(clampTimeScale(MIN_TIME_SCALE)).toBe(MIN_TIME_SCALE);
    expect(clampTimeScale(0.25)).toBe(0.25);
  });

  it('reads negative zero as no scale at all', () => {
    expect(clampTimeScale(-0)).toBe(1);
  });

  it('falls back on anything else, so no caller can divide by it into Infinity', () => {
    for (const value of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, '10', null, undefined]) {
      expect(clampTimeScale(value)).toBe(1);
    }
  });
});

describe('resolveTimeScale', () => {
  it('defaults to 1 when the param is absent or blank', () => {
    expect(resolveTimeScale('')).toBe(1);
    expect(resolveTimeScale('?seed=1')).toBe(1);
    expect(resolveTimeScale('?timeScale=')).toBe(1);
    expect(resolveTimeScale('?timeScale=%20')).toBe(1);
  });

  it('reads a positive scale, whole or fractional', () => {
    expect(resolveTimeScale('?seed=1&timeScale=10')).toBe(10);
    expect(resolveTimeScale('?timeScale=0.5')).toBe(0.5);
  });

  it('falls back on anything that is not a positive finite number', () => {
    expect(resolveTimeScale('?timeScale=0')).toBe(1);
    expect(resolveTimeScale('?timeScale=-2')).toBe(1);
    expect(resolveTimeScale('?timeScale=fast')).toBe(1);
    expect(resolveTimeScale('?timeScale=Infinity')).toBe(1);
  });

  it('clamps to the maximum scale', () => {
    expect(resolveTimeScale(`?timeScale=${MAX_TIME_SCALE * 10}`)).toBe(MAX_TIME_SCALE);
  });

  it('clamps a scale near zero up to the floor (#316)', () => {
    expect(resolveTimeScale('?timeScale=1e-320')).toBe(MIN_TIME_SCALE);
    expect(resolveTimeScale('?timeScale=0.001')).toBe(MIN_TIME_SCALE);
  });

  it('survives hostile numerics', () => {
    expect(resolveTimeScale('?timeScale=1e308')).toBe(MAX_TIME_SCALE);
    // Number() semantics: hex and padding parse, so they are clamped, not refused.
    expect(resolveTimeScale('?timeScale=%200x10%20')).toBe(16);
    for (const raw of ['NaN', '-Infinity', '-0', '1e999', '%E2%80%AE5', '5%00']) {
      expect(resolveTimeScale(`?timeScale=${raw}`)).toBe(1);
    }
    // 100 kB of digits overflows to Infinity, which is not a scale.
    expect(resolveTimeScale(`?timeScale=${'9'.repeat(100_000)}`)).toBe(1);
  });

  it('takes the first of a repeated param', () => {
    expect(resolveTimeScale('?timeScale=2&timeScale=20')).toBe(2);
  });
});

describe('resolveStartAt (#127)', () => {
  it('reads seconds into ms', () => {
    expect(resolveStartAt('?startAt=1190')).toBe(1_190_000);
    expect(resolveStartAt('?startAt=0.5')).toBe(500);
  });

  it('reads anything absent, unparseable, negative or not before the boss as 0', () => {
    for (const search of [
      '',
      '?startAt=',
      '?startAt=abc',
      '?startAt=-5',
      `?startAt=${BOSS_START_TIME}`,
      '?startAt=Infinity',
    ]) {
      expect(resolveStartAt(search), search).toBe(0);
    }
  });
});

describe('RunState start time (#127)', () => {
  it('starts the clock at startMs and counts on from there', () => {
    const emitter = recordingEmitter();
    const run = new RunState(emitter, 1, 1_000_000);
    expect(run.elapsedMs).toBe(1_000_000);
    run.tick(16);
    expect(emitter.of('timer')).toEqual([{ name: 'timer', payload: { elapsedMs: 1_000_016 } }]);
  });

  it('crosses into the boss phase at the same clock time as a full run', () => {
    const run = new RunState(recordingEmitter(), 1, BOSS_START_MS - 10);
    run.tick(9);
    expect(run.phase).toBe('waves');
    run.tick(1);
    expect(run.phase).toBe('boss');
  });

  it('ignores a start time that is not a usable clock value', () => {
    expect(new RunState(recordingEmitter(), 1, -5).elapsedMs).toBe(0);
    expect(new RunState(recordingEmitter(), 1, Number.NaN).elapsedMs).toBe(0);
  });
});

describe('resolveInvulnerable', () => {
  it('is off when the param is absent', () => {
    expect(resolveInvulnerable('')).toBe(false);
    expect(resolveInvulnerable('?seed=1&timeScale=100')).toBe(false);
  });

  it('is on only for the exact value 1', () => {
    expect(resolveInvulnerable('?invulnerable=1')).toBe(true);
    expect(resolveInvulnerable('?seed=1&invulnerable=1&timeScale=100')).toBe(true);
    expect(resolveInvulnerable('?invulnerable')).toBe(false);
    expect(resolveInvulnerable('?invulnerable=')).toBe(false);
    expect(resolveInvulnerable('?invulnerable=true')).toBe(false);
    expect(resolveInvulnerable('?invulnerable=0')).toBe(false);
  });
});

describe('resolveLoadout', () => {
  it('is empty when the param is absent', () => {
    expect(resolveLoadout('')).toEqual([]);
    expect(resolveLoadout('?seed=1&timeScale=10')).toEqual([]);
  });

  it('reads the ids in the order they were written', () => {
    expect(resolveLoadout('?loadout=lightning,fire')).toEqual(['lightning', 'fire']);
    expect(resolveLoadout('?seed=1&loadout=fire,ice,lightning')).toEqual([
      'fire',
      'ice',
      'lightning',
    ]);
  });

  it('tolerates spacing around an id', () => {
    expect(resolveLoadout('?loadout=fire,%20ice')).toEqual(['fire', 'ice']);
  });

  it('drops anything that is not a roster spell id', () => {
    expect(resolveLoadout('?loadout=')).toEqual([]);
    expect(resolveLoadout('?loadout=water,fire,,earth')).toEqual(['fire', 'earth']);
  });

  it('takes a Phase 2 roster id, so a mechanic can be driven before its slot is', () => {
    // #133's companions are the first of these; whether this build can cast one
    // is `Spellbook.equip`'s to say, not the query string's.
    expect(resolveLoadout('?loadout=fire_companion,fire_meteor')).toEqual([
      'fire_companion',
      'fire_meteor',
    ]);
  });
});

describe('resolveLoadout hardening (#316)', () => {
  const rosterIds = ROSTER_SPELL_IDS;

  it('drops repeats, keeping the first place', () => {
    expect(resolveLoadout('?loadout=fire,fire,ice,fire')).toEqual(['fire', 'ice']);
  });

  it('caps the list', () => {
    expect(MAX_SWITCH_LIST).toBe(8);
    expect(rosterIds.length).toBeGreaterThan(MAX_SWITCH_LIST);
    const list = resolveLoadout(`?loadout=${rosterIds.slice(0, 20).join(',')}`);
    expect(list).toEqual(rosterIds.slice(0, MAX_SWITCH_LIST));
  });

  it('looks at a bounded number of pieces, so a huge value is cheap', () => {
    const huge = `?loadout=${'fire,'.repeat(400_000)}`;
    const t0 = performance.now();
    expect(resolveLoadout(huge)).toEqual(['fire']);
    expect(performance.now() - t0).toBeLessThan(50);
    // A valid id past the piece limit is never reached.
    const late = `?loadout=${'x,'.repeat(MAX_SWITCH_TOKENS)}ice`;
    expect(resolveLoadout(late)).toEqual([]);
  });

  it('refuses prototype keys and look-alike or invisible ids', () => {
    expect(resolveLoadout('?loadout=__proto__,constructor,toString,prototype,fire')).toEqual([
      'fire',
    ]);
    for (const bad of ['%EF%AC%81re', 'fire%E2%80%8B', '%E2%80%AEfire', 'FIRE', 'fire%00']) {
      expect(resolveLoadout(`?loadout=${bad}`)).toEqual([]);
    }
    expect(resolveLoadout('?loadout=%20fire%20')).toEqual(['fire']);
  });

  it('survives a 100 kB value and takes the first of a repeated param', () => {
    expect(resolveLoadout(`?loadout=${'a'.repeat(100_000)}`)).toEqual([]);
    expect(resolveLoadout('?loadout=fire&loadout=ice')).toEqual(['fire']);
  });
});

describe('?loadout= spell levels (#326)', () => {
  it('reads a level after a colon, and none when there is no suffix', () => {
    expect(parseLoadoutSwitch('?loadout=fire:3,fire_meteor:2,ice')).toEqual([
      { id: 'fire', level: 3 },
      { id: 'fire_meteor', level: 2 },
      { id: 'ice' },
    ]);
    expect(resolveLoadoutLevels('?loadout=fire:3,fire_meteor:2,ice')).toEqual([
      ['fire', 3],
      ['fire_meteor', 2],
    ]);
    expect(resolveLoadoutLevels('?loadout=fire,ice')).toEqual([]);
    expect(resolveLoadoutLevels('')).toEqual([]);
  });

  it('keeps resolveLoadout to the ids, in order, with or without levels', () => {
    expect(resolveLoadout('?loadout=fire:3,fire_meteor:2')).toEqual(['fire', 'fire_meteor']);
    expect(resolveLoadout('?loadout=fire:1,%20ice:2%20')).toEqual(['fire', 'ice']);
  });

  it('accepts each level from 1 to 3', () => {
    for (const level of [1, 2, 3]) {
      expect(resolveLoadoutLevels(`?loadout=fire:${level}`)).toEqual([['fire', level]]);
    }
  });

  it('drops the whole token for any suffix that is not one ASCII digit from 1 to 3', () => {
    const bad = [
      'fire:0',
      'fire:4',
      'fire:99999999999',
      'fire:2.5',
      'fire:-1',
      'fire:1e3',
      'fire:%EF%BC%92', // fullwidth 2
      'fire:%D9%A2', // Arabic-Indic 2
      'fire:%202',
      'fire%20:2',
      'fire:2:3',
      'fire:',
      ':2',
      'fire:%E2%80%8B2', // zero-width space
      'fire%E2%80%AE:2', // bidi override
      '__proto__:2',
      'constructor:2',
      'water:2',
      'FIRE:2',
      'fire:2%00',
      'fire:22',
      'fire:%0A2',
    ];
    for (const token of bad) {
      expect(parseLoadoutSwitch(`?loadout=${token}`), token).toEqual([]);
      expect(resolveLoadout(`?loadout=${token},ice`), token).toEqual(['ice']);
      expect(resolveLoadoutLevels(`?loadout=${token},ice:2`), token).toEqual([['ice', 2]]);
    }
  });

  it('lets the first write of a spell win, with or without a level', () => {
    expect(parseLoadoutSwitch('?loadout=fire,fire:3')).toEqual([{ id: 'fire' }]);
    expect(parseLoadoutSwitch('?loadout=fire:2,fire:3,fire')).toEqual([{ id: 'fire', level: 2 }]);
    // A refused repeat does not use up a place in the list.
    expect(parseLoadoutSwitch('?loadout=fire:2,fire:9,ice:3')).toEqual([
      { id: 'fire', level: 2 },
      { id: 'ice', level: 3 },
    ]);
  });

  it('caps the list and the pieces looked at, level suffixes included', () => {
    const list = parseLoadoutSwitch(
      `?loadout=${ROSTER_SPELL_IDS.map((id) => `${id}:3`).join(',')}`,
    );
    expect(list.map((entry) => entry.id)).toEqual(ROSTER_SPELL_IDS.slice(0, MAX_SWITCH_LIST));
    expect(list.every((entry) => entry.level === 3)).toBe(true);
    const t0 = performance.now();
    expect(resolveLoadoutLevels(`?loadout=${'fire:3,'.repeat(400_000)}`)).toEqual([['fire', 3]]);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(parseLoadoutSwitch(`?loadout=${'x,'.repeat(MAX_SWITCH_TOKENS)}ice:3`)).toEqual([]);
  });

  it('survives a 100 kB token, and a long digit run, in linear time', () => {
    const t0 = performance.now();
    expect(parseLoadoutSwitch(`?loadout=fire:${'3'.repeat(100_000)}`)).toEqual([]);
    expect(parseLoadoutSwitch(`?loadout=${'a'.repeat(100_000)}:3`)).toEqual([]);
    expect(parseLoadoutSwitch(`?loadout=fire${':'.repeat(100_000)}`)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('is stripped, levels and all, by the production gate', () => {
    const gated = gateTestSwitches('?seed=7&loadout=fire:3,fire_meteor:2', false);
    expect(gated).toBe('?seed=7');
    expect(parseLoadoutSwitch(gated)).toEqual([]);
    expect(resolveLoadoutLevels(gated)).toEqual([]);
    expect(resolveLoadoutLevels(gateTestSwitches('?loadout=fire:3', true))).toEqual([['fire', 3]]);
  });
});

describe('resolveEnemyFilter (#126)', () => {
  it('is no filter when the param is absent or names nothing known', () => {
    expect(resolveEnemyFilter('')).toEqual([]);
    expect(resolveEnemyFilter('?seed=1&startAt=360')).toEqual([]);
    expect(resolveEnemyFilter('?enemies=')).toEqual([]);
    expect(resolveEnemyFilter('?enemies=boss,dragon')).toEqual([]);
  });

  it('reads the known types, trimmed, dropping the rest', () => {
    expect(resolveEnemyFilter('?enemies=ranged')).toEqual(['ranged']);
    expect(resolveEnemyFilter('?enemies=tank,%20ranged,,Swarm')).toEqual(['tank', 'ranged']);
  });

  it('drops repeats and stops at the list cap (#316)', () => {
    expect(resolveEnemyFilter('?enemies=tank,tank,ranged,tank')).toEqual(['tank', 'ranged']);
    const many = `?enemies=${Array.from({ length: 20 }, () => 'tank').join(',')}`;
    expect(resolveEnemyFilter(many)).toEqual(['tank']);
    expect(MAX_SWITCH_LIST).toBeGreaterThanOrEqual(ENEMY_TYPES.length);
  });

  it('is bounded on a huge value and refuses hostile ids (#316)', () => {
    const t0 = performance.now();
    expect(resolveEnemyFilter(`?enemies=${'tank,'.repeat(400_000)}`)).toEqual(['tank']);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(resolveEnemyFilter(`?enemies=${'x,'.repeat(MAX_SWITCH_TOKENS)}tank`)).toEqual([]);
    expect(resolveEnemyFilter('?enemies=__proto__,constructor,toString,tank')).toEqual(['tank']);
    for (const bad of ['%EF%AC%81', 'tank%E2%80%8B', '%E2%80%AEtank', 'TANK', 'tank%00']) {
      expect(resolveEnemyFilter(`?enemies=${bad}`)).toEqual([]);
    }
    expect(resolveEnemyFilter('?enemies=tank&enemies=ranged')).toEqual(['tank']);
  });
});

describe('gateTestSwitches (#316)', () => {
  const all =
    '?seed=7&timeScale=30&invulnerable=1&startAt=1170&loadout=fire,ice&enemies=swarm&debug=textures';

  it('leaves every switch alone in a dev build', () => {
    expect(gateTestSwitches(all, true)).toBe(all);
    expect(gateTestSwitches('', true)).toBe('');
  });

  it('keeps only the seed in a production build', () => {
    expect(gateTestSwitches(all, false)).toBe('?seed=7');
    expect(gateTestSwitches('?timeScale=30&debug=collisions', false)).toBe('');
    expect(gateTestSwitches('', false)).toBe('');
  });

  it('takes the first of a repeated seed, as URLSearchParams does', () => {
    expect(gateTestSwitches('?seed=1&seed=2', false)).toBe('?seed=1');
  });

  it('drops a param whose name only differs in case', () => {
    expect(gateTestSwitches('?SEED=1&Seed=2', false)).toBe('');
  });

  it('turns every other switch off once composed with its parsers', () => {
    const gated = gateTestSwitches(all, false);
    expect(resolveSeed(gated, 99)).toBe(7);
    expect(resolveTimeScale(gated)).toBe(1);
    expect(resolveStartAt(gated)).toBe(0);
    expect(resolveInvulnerable(gated)).toBe(false);
    expect(resolveLoadout(gated)).toEqual([]);
    expect(resolveEnemyFilter(gated)).toEqual([]);
    expect(new URLSearchParams(gated).get('debug')).toBeNull();
  });

  it('survives hostile queries', () => {
    const hostile = '?__proto__=1&constructor=1&prototype=1&seed=5';
    expect(gateTestSwitches(hostile, false)).toBe('?seed=5');
    // The seed is passed on as text and the seed parser stays the one judge of it.
    const bidi = gateTestSwitches('?seed=%E2%80%AE5&startAt=1', false);
    expect(bidi).toBe('?seed=%E2%80%AE5');
    expect(resolveSeed(bidi, 42)).toBe(42);
    const zeroWidth = gateTestSwitches('?seed=5%E2%80%8B', false);
    expect(resolveSeed(zeroWidth, 42)).toBe(42);
    const huge = `?seed=1&x=${'a'.repeat(100_000)}`;
    expect(gateTestSwitches(huge, false)).toBe('?seed=1');
    expect(gateTestSwitches(`?seed=${'9'.repeat(100_000)}`, false).length).toBeGreaterThan(1000);
  });
});

describe('simulationSteps', () => {
  const contiguous = (steps: RunFrame[], frame: RunFrame) => {
    let cursor = frame.startMs;
    for (const step of steps) {
      expect(step.startMs).toBeCloseTo(cursor, 9);
      cursor += step.deltaMs;
    }
    expect(cursor).toBeCloseTo(frame.startMs + frame.deltaMs, 9);
  };

  it('is empty for the zero-length frame of a finished run', () => {
    expect(simulationSteps({ startMs: 1234, deltaMs: 0 })).toEqual([]);
  });

  it('leaves a real-time frame whole, jitter included', () => {
    for (const deltaMs of [16, 1000 / 60, 17, 24]) {
      expect(simulationSteps({ startMs: 100, deltaMs }), String(deltaMs)).toEqual([
        { startMs: 100, deltaMs },
      ]);
    }
  });

  it('cuts a scaled frame into equal, contiguous steps of about a 60 fps frame (#94)', () => {
    // A 60 fps frame at the maximum scale: what the Playwright full run drives.
    const frame = { startMs: 5000, deltaMs: (1000 / 60) * MAX_TIME_SCALE };
    const steps = simulationSteps(frame);
    expect(steps).toHaveLength(MAX_TIME_SCALE);
    for (const step of steps) expect(step.deltaMs).toBeCloseTo(SIM_STEP_MS, 9);
    contiguous(steps, frame);
  });

  it('bounds every step whatever the frame length', () => {
    // ~150k steps: checked in plain code and asserted once, since an `expect` per
    // step cost ~4 s on CI against the 5 s timeout (the code itself takes ~5 ms).
    const closeTo = (a: number, b: number) => Math.abs(a - b) < 5e-10; // toBeCloseTo(_, 9)
    const bad: string[] = [];
    for (let deltaMs = 1; deltaMs <= 6000; deltaMs += 7) {
      const steps = simulationSteps({ startMs: 0, deltaMs });
      if (steps.length === 0) bad.push(`${deltaMs}: no steps`);
      let cursor = 0;
      for (const step of steps) {
        if (step.deltaMs > SIM_STEP_MS * 1.5 + 1e-9) bad.push(`${deltaMs}: step ${step.deltaMs}`);
        if (!closeTo(step.startMs, cursor)) bad.push(`${deltaMs}: gap at ${step.startMs}`);
        cursor += step.deltaMs;
      }
      if (!closeTo(cursor, deltaMs)) bad.push(`${deltaMs}: ends at ${cursor}`);
    }
    expect(bad).toEqual([]);
  });
});
