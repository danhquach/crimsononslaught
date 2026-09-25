import { describe, expect, it } from 'vitest';
import { tickHitCooldown, tryHit } from './hitWindow';

describe('tryHit', () => {
  it('hits when the window is open and re-arms it', () => {
    expect(tryHit(0, 0.5)).toEqual({ remainingS: 0.5, hit: true });
  });

  it('misses while the window is still closed', () => {
    expect(tryHit(0.2, 0.5)).toEqual({ remainingS: 0.2, hit: false });
  });
});

describe('tickHitCooldown', () => {
  it('drains by the frame, never below zero', () => {
    expect(tickHitCooldown(0.3, 0.1)).toBeCloseTo(0.2, 9);
    expect(tickHitCooldown(0.05, 0.1)).toBe(0);
  });

  it('a zero or negative frame changes nothing', () => {
    expect(tickHitCooldown(0.3, 0)).toBe(0.3);
    expect(tickHitCooldown(0.3, -1)).toBe(0.3);
  });
});
