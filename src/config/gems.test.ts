import { describe, expect, it } from 'vitest';
import { MAX_LIVE_ENEMIES } from './enemies';
import { GEM_DRIFT_SPEED, GEM_XP_VALUE, MAX_LIVE_GEMS, PICKUP_RADIUS } from './gems';
import { PLAYER_SPEED } from './player';

describe('gem tunables', () => {
  it('matches the spec §5 XP table', () => {
    expect(PICKUP_RADIUS).toBe(40);
    expect(GEM_XP_VALUE).toBe(1);
  });

  it('drifts faster than the player can run away', () => {
    expect(GEM_DRIFT_SPEED).toBeGreaterThan(PLAYER_SPEED);
  });

  it('pools a gem for every enemy the arena can hold at once', () => {
    expect(MAX_LIVE_GEMS).toBeGreaterThan(MAX_LIVE_ENEMIES);
  });
});
