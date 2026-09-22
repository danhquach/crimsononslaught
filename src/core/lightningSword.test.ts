import { describe, expect, it } from 'vitest';
import { BASE_SWORD_STATS } from '../config/lightningRoster';
import { tickHitCooldown, tryHit } from './fireColumn';
import { bladeRotation, swordCut } from './lightningSword';
import { advanceOrbit, boulderAngles } from './orbitingBoulders';

const base = BASE_SWORD_STATS;

describe('bladeRotation (#142)', () => {
  it('lies along the orbit, a quarter turn on from the radius', () => {
    expect(bladeRotation(0)).toBeCloseTo(Math.PI / 2, 9);
    expect(bladeRotation(Math.PI)).toBeCloseTo((3 * Math.PI) / 2, 9);
  });

  it('wraps into [0, 2π)', () => {
    const wrapped = bladeRotation((3 * Math.PI) / 2 + 0.1);
    expect(wrapped).toBeGreaterThanOrEqual(0);
    expect(wrapped).toBeLessThan(Math.PI * 2);
    expect(wrapped).toBeCloseTo(0.1, 9);
  });

  it('follows the ring as it turns', () => {
    const angle = advanceOrbit(0, base.orbitSpeed, 0.5);
    expect(bladeRotation(angle)).toBeCloseTo(angle + Math.PI / 2, 9);
  });
});

describe('swordCut (#142)', () => {
  it('pays the block damage and its stagger', () => {
    expect(swordCut(base)).toEqual({ damage: base.damage, staggerS: base.staggerDuration });
  });

  it('a block with no stagger leaves none', () => {
    expect(swordCut({ ...base, staggerDuration: 0 }).staggerS).toBe(0);
    expect(swordCut({ ...base, staggerDuration: -1 }).staggerS).toBe(0);
  });
});

describe('the sword on the shared ring (#142)', () => {
  it('base count is one blade', () => {
    expect(boulderAngles(0, base.count)).toEqual([0]);
  });

  it('cuts one enemy at most once per hitCooldown', () => {
    let window = 0;
    const cuts: boolean[] = [];
    // A 0.05 s frame for 1 s of contact: 20 touches.
    for (let i = 0; i < 20; i += 1) {
      window = tickHitCooldown(window, 0.05);
      const result = tryHit(window, base.hitCooldown);
      window = result.remainingS;
      cuts.push(result.hit);
    }
    // 1 s of contact at a 0.35 s window: cuts at 0, 0.35 and 0.70 s.
    expect(cuts.filter(Boolean)).toHaveLength(3);
    expect(cuts[0]).toBe(true);
    expect(cuts[1]).toBe(false);
  });
});
