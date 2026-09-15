import { describe, expect, it } from 'vitest';

// Proves Vitest is wired into `npm test`. Real core tests start with CO-004 (rng).
describe('vitest wiring', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
