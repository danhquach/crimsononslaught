import { describe, expect, it } from 'vitest';
import { BOSS_START_TIME } from '../config/waves';
import { RUN_EVENT, RUN_EVENT_NAMES, type RunEvent, type RunEventName } from './runEvents';
import { isRunStats } from './scenePayloads';
import {
  BOSS_START_MS,
  MAX_TIME_SCALE,
  RunState,
  SIM_STEP_MS,
  type RunFrame,
  clampTimeScale,
  resolveInvulnerable,
  resolveLoadout,
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
  it('starts at zero on the waves phase with level 1 and no kills, xp or perks', () => {
    const { run } = newRun();
    expect(run.elapsedMs).toBe(0);
    expect(run.phase).toBe('waves');
    expect(run.level).toBe(1);
    expect(run.kills).toBe(0);
    expect(run.xp).toBe(0);
    expect(run.perks).toEqual([]);
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

describe('RunState.recordPerk', () => {
  it('keeps the display names in pick order, repeats included', () => {
    const { run } = newRun();
    run.recordPerk('Sharper Edge');
    run.recordPerk('Quick Cast');
    run.recordPerk('Sharper Edge');
    expect(run.perks).toEqual(['Sharper Edge', 'Quick Cast', 'Sharper Edge']);
  });

  it('hands out a copy, so a caller cannot mutate the run', () => {
    const { run } = newRun();
    run.recordPerk('Sharper Edge');
    (run.perks as string[]).push('Not Taken');
    expect(run.perks).toEqual(['Sharper Edge']);
  });
});

describe('RunState.stats', () => {
  it('produces a valid RunStats for the result screen', () => {
    const { run } = newRun();
    run.tick(1500);
    run.recordKill();
    run.addXp(15);
    run.recordPerk('Quick Cast');

    const stats = run.stats('fire');
    expect(isRunStats(stats)).toBe(true);
    expect(stats).toEqual({
      timeSurvivedMs: 1500,
      level: 2,
      kills: 1,
      spellId: 'fire',
      perks: ['Quick Cast'],
    });
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
    for (let deltaMs = 1; deltaMs <= 6000; deltaMs += 7) {
      const frame = { startMs: 0, deltaMs };
      const steps = simulationSteps(frame);
      expect(steps.length, String(deltaMs)).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.deltaMs, String(deltaMs)).toBeLessThanOrEqual(SIM_STEP_MS * 1.5 + 1e-9);
      }
      contiguous(steps, frame);
    }
  });
});
