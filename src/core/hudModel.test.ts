import { describe, expect, it } from 'vitest';
import {
  INITIAL_HUD,
  applyRunEvent,
  bossBarVisible,
  formatTimer,
  fraction,
  type HudModel,
} from './hudModel';

describe('formatTimer', () => {
  it('formats elapsed ms as m:ss, flooring to whole seconds', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(999)).toBe('0:00');
    expect(formatTimer(1000)).toBe('0:01');
    expect(formatTimer(59_999)).toBe('0:59');
    expect(formatTimer(60_000)).toBe('1:00');
    expect(formatTimer(300_000)).toBe('5:00');
    expect(formatTimer(605_000)).toBe('10:05');
  });

  it('clamps negative and non-finite input to 0:00', () => {
    expect(formatTimer(-5000)).toBe('0:00');
    expect(formatTimer(NaN)).toBe('0:00');
    expect(formatTimer(Infinity)).toBe('0:00');
  });
});

describe('fraction', () => {
  it('returns value / max clamped to [0, 1]', () => {
    expect(fraction(50, 100)).toBe(0.5);
    expect(fraction(100, 100)).toBe(1);
    expect(fraction(150, 100)).toBe(1);
    expect(fraction(-5, 100)).toBe(0);
    expect(fraction(0, 100)).toBe(0);
  });

  it('returns 0 when max is zero, negative or not a number', () => {
    expect(fraction(5, 0)).toBe(0);
    expect(fraction(5, -1)).toBe(0);
    expect(fraction(5, NaN)).toBe(0);
    expect(fraction(NaN, 100)).toBe(0);
  });
});

describe('applyRunEvent', () => {
  it('starts at run-start values (spec §5: HP 100, level 1, no kills, waves phase)', () => {
    expect(INITIAL_HUD).toEqual({
      elapsedMs: 0,
      hp: 100,
      maxHp: 100,
      xp: 0,
      xpToNext: 0,
      level: 1,
      kills: 0,
      phase: 'waves',
      bossHp: 0,
      bossMaxHp: 0,
    });
  });

  it('timer sets elapsedMs', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'timer', payload: { elapsedMs: 61_500 } });
    expect(m.elapsedMs).toBe(61_500);
  });

  it('hp sets hp and maxHp', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'hp', payload: { hp: 37, maxHp: 120 } });
    expect(m.hp).toBe(37);
    expect(m.maxHp).toBe(120);
  });

  it('xp sets xp, xpToNext and level together', () => {
    const m = applyRunEvent(INITIAL_HUD, {
      name: 'xp',
      payload: { xp: 4, xpToNext: 20, level: 3 },
    });
    expect(m.xp).toBe(4);
    expect(m.xpToNext).toBe(20);
    expect(m.level).toBe(3);
  });

  it('kill sets the running kill count', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'kill', payload: { kills: 12 } });
    expect(m.kills).toBe(12);
  });

  it('phase sets the run phase', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'phase', payload: { phase: 'boss' } });
    expect(m.phase).toBe('boss');
  });

  it('bossHp sets bossHp and bossMaxHp', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'bossHp', payload: { hp: 250, maxHp: 400 } });
    expect(m.bossHp).toBe(250);
    expect(m.bossMaxHp).toBe(400);
  });

  it('leaves unrelated fields untouched and never mutates its input', () => {
    const before: HudModel = { ...INITIAL_HUD, kills: 7, level: 2 };
    const frozen = Object.freeze({ ...before });
    const after = applyRunEvent(frozen, { name: 'timer', payload: { elapsedMs: 1000 } });
    expect(after).toEqual({ ...before, elapsedMs: 1000 });
    expect(frozen).toEqual(before);
    expect(after).not.toBe(frozen);
  });
});

describe('bossBarVisible', () => {
  it('is hidden in waves, shown in boss, hidden again once the run is over', () => {
    expect(bossBarVisible(INITIAL_HUD)).toBe(false);
    const boss = applyRunEvent(INITIAL_HUD, { name: 'phase', payload: { phase: 'boss' } });
    expect(bossBarVisible(boss)).toBe(true);
    const over = applyRunEvent(boss, { name: 'phase', payload: { phase: 'over' } });
    expect(bossBarVisible(over)).toBe(false);
  });
});
