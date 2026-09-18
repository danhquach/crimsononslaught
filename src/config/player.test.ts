import { describe, expect, it } from 'vitest';
import { INVULN_MS, PLAYER_MAX_HP, PLAYER_SPEED } from './player';

describe('player tunables', () => {
  it('matches the spec §5 player table', () => {
    expect(PLAYER_MAX_HP).toBe(100);
    expect(INVULN_MS).toBe(500);
    expect(PLAYER_SPEED).toBe(180);
  });

  it('keeps every tunable positive', () => {
    for (const [label, value] of [
      ['PLAYER_MAX_HP', PLAYER_MAX_HP],
      ['INVULN_MS', INVULN_MS],
      ['PLAYER_SPEED', PLAYER_SPEED],
    ] as const) {
      expect(value, label).toBeGreaterThan(0);
    }
  });
});
