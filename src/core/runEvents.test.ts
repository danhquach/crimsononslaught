import { describe, expect, it } from 'vitest';
import { RUN_EVENT, RUN_EVENT_NAMES, emitRunEvent, onRunEvents, type RunEvent } from './runEvents';

/** Minimal EventEmitter3-shaped fake: on / off / emit by event name. */
function fakeEmitter() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    on(event: string, fn: (payload: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(fn);
      return this;
    },
    off(event: string, fn: (payload: unknown) => void) {
      listeners.get(event)?.delete(fn);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) fn(args[0]);
      return true;
    },
    count: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

describe('onRunEvents', () => {
  it('delivers every channel to one listener as { name, payload } with the matching name', () => {
    const emitter = fakeEmitter();
    const received: RunEvent[] = [];
    onRunEvents(emitter, (e) => received.push(e));

    emitRunEvent(emitter, 'timer', { elapsedMs: 5 });
    emitRunEvent(emitter, 'hp', { hp: 1, maxHp: 2 });
    emitRunEvent(emitter, 'xp', { xp: 3, xpToNext: 4, level: 5 });
    emitRunEvent(emitter, 'kill', { kills: 6 });
    emitRunEvent(emitter, 'phase', { phase: 'over' });
    emitRunEvent(emitter, 'bossHp', { hp: 7, maxHp: 8 });
    emitRunEvent(emitter, 'shield', { pool: 9, max: 10 });
    const loadout = {
      spells: [{ id: 'fire', name: 'Fire Bolt', color: 0xff0000, progress: 0.5 }],
      passives: [{ name: 'Haste', rank: 2 }],
    };
    emitRunEvent(emitter, 'loadout', loadout);
    emitter.emit('shutdown', { not: 'ours' });

    expect(received).toEqual([
      { name: 'timer', payload: { elapsedMs: 5 } },
      { name: 'hp', payload: { hp: 1, maxHp: 2 } },
      { name: 'xp', payload: { xp: 3, xpToNext: 4, level: 5 } },
      { name: 'kill', payload: { kills: 6 } },
      { name: 'phase', payload: { phase: 'over' } },
      { name: 'bossHp', payload: { hp: 7, maxHp: 8 } },
      { name: 'shield', payload: { pool: 9, max: 10 } },
      { name: 'loadout', payload: loadout },
    ]);
  });

  it('returns an unsubscribe that removes exactly the handlers it added', () => {
    const emitter = fakeEmitter();
    const other = () => {};
    emitter.on(RUN_EVENT.timer, other);
    const unsubscribe = onRunEvents(emitter, () => {});
    for (const name of RUN_EVENT_NAMES) expect(emitter.count(RUN_EVENT[name])).toBeGreaterThan(0);

    unsubscribe();
    expect(emitter.count(RUN_EVENT.timer)).toBe(1); // `other` survives
    for (const name of RUN_EVENT_NAMES.filter((n) => n !== 'timer')) {
      expect(emitter.count(RUN_EVENT[name])).toBe(0);
    }
  });
});

describe('emitRunEvent', () => {
  it('emits the namespaced event name with the payload as the single argument', () => {
    const calls: unknown[][] = [];
    const emitter = { emit: (...args: unknown[]) => calls.push(args) };
    emitRunEvent(emitter, 'hp', { hp: 42, maxHp: 100 });
    emitRunEvent(emitter, 'phase', { phase: 'boss' });
    expect(calls).toEqual([
      ['run:hp', { hp: 42, maxHp: 100 }],
      ['run:phase', { phase: 'boss' }],
    ]);
  });
});

describe('RUN_EVENT', () => {
  it('covers every channel the run publishes (spec §4, CO-030; shield #134; loadout #144; embers #195)', () => {
    expect(RUN_EVENT_NAMES).toEqual([
      'timer',
      'hp',
      'xp',
      'kill',
      'phase',
      'bossHp',
      'shield',
      'loadout',
      'embers',
    ]);
    expect(Object.keys(RUN_EVENT).sort()).toEqual([...RUN_EVENT_NAMES].sort());
  });

  it('uses distinct emitter names in the run: namespace, clear of Phaser scene events', () => {
    const values = Object.values(RUN_EVENT);
    for (const v of values) expect(v).toMatch(/^run:[a-zA-Z]+$/);
    expect(new Set(values).size).toBe(values.length);
  });
});
