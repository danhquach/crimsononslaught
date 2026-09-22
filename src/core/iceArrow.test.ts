import { describe, expect, it } from 'vitest';
import { BASE_SPELL_STATS } from '../config/spells';
import { NO_FROST, applyFrost, frostSpeedFactor } from './frostNova';
import { MAX_LIVE_ARROWS, arrowFrost } from './iceArrow';
import type { IceStats } from './spellStats';

const base: IceStats = { ...BASE_SPELL_STATS.ice };

describe('arrowFrost (#141)', () => {
  it('carries the arrow slow and never a freeze', () => {
    expect(arrowFrost(base)).toEqual({
      slowPct: base.slowPct,
      slowDuration: base.slowDuration,
      freeze: false,
    });
  });

  it('reads the live block, so a scaled slow duration reaches the hit', () => {
    expect(arrowFrost({ ...base, slowDuration: 2.5 }).slowDuration).toBe(2.5);
  });

  it('slows an enemy by the arrow pct for the arrow duration', () => {
    const state = applyFrost(NO_FROST, arrowFrost(base));
    expect(frostSpeedFactor(state)).toBeCloseTo(1 - base.slowPct, 9);
    expect(state.slowRemainingS).toBe(base.slowDuration);
    expect(state.frozenS).toBe(0);
  });
});

describe('MAX_LIVE_ARROWS', () => {
  it('holds every arrow a maxed ice build can have in flight', () => {
    // Three arrows a volley, a cooldown halved by Haste, a range widened by
    // half: volleys in flight at once, rounded up, times arrows per volley.
    const cooldown = base.cooldown * 0.5;
    const flight = (base.range * 1.5) / base.speed;
    const inFlight = Math.ceil(flight / cooldown) * 3;
    expect(MAX_LIVE_ARROWS).toBeGreaterThanOrEqual(inFlight);
  });
});
