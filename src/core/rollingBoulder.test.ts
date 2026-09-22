import { describe, expect, it } from 'vitest';
import { BASE_BOULDER_STATS } from '../config/earthRoster';
import { MAX_LIVE_BOULDERS, rollSpent, rollTarget } from './rollingBoulder';

/**
 * #143 Boulder: where a throw is aimed, and how many enemies one boulder rolls
 * through before it is spent. The shove is `knockbackVector`, covered in
 * `orbitingBoulders.test.ts`.
 */

const base = BASE_BOULDER_STATS;
const CASTER = { x: 0, y: 0 } as const;

describe('rollTarget', () => {
  it('throws at the nearest enemy in range', () => {
    const near = { x: 200, y: 0 };
    const far = { x: 400, y: 0 };
    expect(rollTarget(CASTER, [far, near], base.range)).toBe(near);
  });

  it('ignores everything past range, and counts the range itself as in', () => {
    const edge = { x: base.range, y: 0 };
    const beyond = { x: base.range + 1, y: 0 };
    expect(rollTarget(CASTER, [edge], base.range)).toBe(edge);
    expect(rollTarget(CASTER, [beyond], base.range)).toBeUndefined();
  });

  it('is spent on nothing with an empty crowd', () => {
    expect(rollTarget(CASTER, [], base.range)).toBeUndefined();
  });
});

describe('rollSpent', () => {
  it('keeps rolling until it has struck pierce enemies', () => {
    expect(rollSpent(1, base.pierce)).toBe(false);
    expect(rollSpent(base.pierce - 1, base.pierce)).toBe(false);
    expect(rollSpent(base.pierce, base.pierce)).toBe(true);
  });

  it('never rolls past its pierce, however many it overlapped in one frame', () => {
    expect(rollSpent(base.pierce + 2, base.pierce)).toBe(true);
  });

  it('a fractional pierce is floored, never rounded up', () => {
    expect(rollSpent(2, 2.9)).toBe(true);
  });

  it('a block with no pierce left to give is spent on its first hit', () => {
    for (const pierce of [1, 0, -3, Number.NaN]) {
      expect(rollSpent(1, pierce), `pierce ${pierce}`).toBe(true);
    }
  });
});

describe('the pool cap', () => {
  it('leaves room for more boulders than a hasted build keeps in the air', () => {
    // Flight is `range / speed`; the profile floors `cooldownMul` at 0.35.
    const inAir = base.range / base.speed / (base.cooldown * 0.35);
    expect(inAir).toBeLessThan(MAX_LIVE_BOULDERS);
  });
});
