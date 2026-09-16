import { describe, expect, it } from 'vitest';
import {
  FLICKER_ALPHA,
  FLICKER_PERIOD_MS,
  INVULN_MS,
  PLAYER_MAX_HP,
  createHealth,
  flickerAlpha,
  grantMaxHp,
  takeDamage,
  tickHealth,
} from './health';

describe('createHealth', () => {
  it('starts at full HP, vulnerable and alive', () => {
    expect(createHealth()).toEqual({ hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, invulnMs: 0 });
  });

  it('accepts a custom max', () => {
    expect(createHealth(40)).toEqual({ hp: 40, maxHp: 40, invulnMs: 0 });
  });
});

describe('takeDamage', () => {
  it('subtracts the amount and opens the invulnerability window', () => {
    const { state, damaged, died } = takeDamage(createHealth(), 5);
    expect(state).toEqual({ hp: 95, maxHp: 100, invulnMs: INVULN_MS });
    expect(damaged).toBe(true);
    expect(died).toBe(false);
  });

  // AC: two hits inside 0.5 s deal damage once.
  it('ignores a second hit inside the invulnerability window', () => {
    const first = takeDamage(createHealth(), 5);
    const mid = tickHealth(first.state, INVULN_MS - 1);
    const second = takeDamage(mid, 5);
    expect(second.damaged).toBe(false);
    expect(second.state.hp).toBe(95);
    // A blocked hit must not extend the window either.
    expect(second.state.invulnMs).toBe(1);
  });

  it('lands the next hit once the window has run out', () => {
    const first = takeDamage(createHealth(), 5);
    const after = tickHealth(first.state, INVULN_MS);
    expect(after.invulnMs).toBe(0);
    const second = takeDamage(after, 5);
    expect(second.damaged).toBe(true);
    expect(second.state.hp).toBe(90);
  });

  it('clamps HP at 0 and reports the death', () => {
    const { state, damaged, died } = takeDamage(createHealth(20), 50);
    expect(state.hp).toBe(0);
    expect(damaged).toBe(true);
    expect(died).toBe(true);
  });

  // AC: HP 0 reports `died` exactly once.
  it('reports death only on the killing blow', () => {
    const killed = takeDamage(createHealth(10), 10);
    expect(killed.died).toBe(true);
    const after = tickHealth(killed.state, INVULN_MS);
    const again = takeDamage(after, 10);
    expect(again.died).toBe(false);
    expect(again.damaged).toBe(false);
    expect(again.state.hp).toBe(0);
  });

  it('ignores non-positive damage', () => {
    const start = createHealth();
    for (const amount of [0, -5, Number.NaN]) {
      const result = takeDamage(start, amount);
      expect(result.damaged).toBe(false);
      expect(result.state).toEqual(start);
    }
  });

  it('does not mutate the input state', () => {
    const start = createHealth();
    takeDamage(start, 10);
    expect(start).toEqual({ hp: 100, maxHp: 100, invulnMs: 0 });
  });
});

describe('tickHealth', () => {
  it('drains the window and never goes negative', () => {
    const hit = takeDamage(createHealth(), 5).state;
    expect(tickHealth(hit, 200).invulnMs).toBe(INVULN_MS - 200);
    expect(tickHealth(hit, INVULN_MS + 1000).invulnMs).toBe(0);
  });

  it('returns the same object when there is nothing to drain', () => {
    const idle = createHealth();
    expect(tickHealth(idle, 16)).toBe(idle);
  });
});

describe('flickerAlpha', () => {
  it('is opaque while vulnerable', () => {
    expect(flickerAlpha(createHealth())).toBe(1);
  });

  it('alternates each flicker period during invulnerability', () => {
    let state = takeDamage(createHealth(), 5).state;
    expect(flickerAlpha(state)).toBe(FLICKER_ALPHA);
    state = tickHealth(state, FLICKER_PERIOD_MS);
    expect(flickerAlpha(state)).toBe(1);
    state = tickHealth(state, FLICKER_PERIOD_MS);
    expect(flickerAlpha(state)).toBe(FLICKER_ALPHA);
  });

  it('ends opaque once the window closes', () => {
    const state = tickHealth(takeDamage(createHealth(), 5).state, INVULN_MS);
    expect(flickerAlpha(state)).toBe(1);
  });
});

describe('grantMaxHp', () => {
  it('raises the maximum without healing', () => {
    const hurt = takeDamage(createHealth(), 30).state;
    expect(grantMaxHp(hurt, 10)).toEqual({ hp: 70, maxHp: 110, invulnMs: INVULN_MS });
  });
});
