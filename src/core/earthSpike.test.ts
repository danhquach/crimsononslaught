import { describe, expect, it } from 'vitest';
import { BASE_SPELL_STATS } from '../config/spells';
import { MAX_LIVE_SPIKES, rollBleed, spikeHit, spikeTarget } from './earthSpike';
import { createRng } from './rng';
import { rollSpent } from './rollingBoulder';
import type { EarthStats } from './spellStats';

/**
 * #143 / #205 Earth Spike: where a spike is flung, how many the pool holds,
 * the bleed roll and what one strike leaves behind. The shove itself is
 * `knockbackVector`, covered in `orbitingBoulders.test.ts`; when a spike is
 * used up is `rollSpent`, covered in `rollingBoulder.test.ts`.
 */

const base: EarthStats = { ...BASE_SPELL_STATS.earth };
const CASTER = { x: 0, y: 0 } as const;

describe('spikeTarget', () => {
  it('aims at the nearest enemy in range', () => {
    const near = { x: 100, y: 0 };
    const far = { x: 300, y: 0 };
    expect(spikeTarget(CASTER, [far, near], base.range)).toBe(near);
  });

  it('ignores everything past range, and counts the range itself as in', () => {
    const edge = { x: base.range, y: 0 };
    const beyond = { x: base.range + 1, y: 0 };
    expect(spikeTarget(CASTER, [edge], base.range)).toBe(edge);
    expect(spikeTarget(CASTER, [beyond], base.range)).toBeUndefined();
  });

  it('is spent on nothing with an empty crowd', () => {
    expect(spikeTarget(CASTER, [], base.range)).toBeUndefined();
  });
});

describe('the flight (#205)', () => {
  it('is the slowest shot of the four defaults', () => {
    expect(base.speed).toBe(260);
    expect(base.speed).toBeLessThan(BASE_SPELL_STATS.fire.speed);
    expect(base.speed).toBeLessThan(BASE_SPELL_STATS.ice.speed);
  });

  it('stops at its first hit at the base pierce', () => {
    expect(rollSpent(1, base.pierce)).toBe(true);
    expect(rollSpent(1, base.pierce + 1)).toBe(false);
  });

  it('caps the pool well above what one caster can keep in the air', () => {
    // Flight time against the Haste floor's cooldown (0.35 × 1.1 s).
    const inAir = Math.ceil(base.range / base.speed / (base.cooldown * 0.35));
    expect(inAir).toBeLessThanOrEqual(2);
    expect(MAX_LIVE_SPIKES).toBeGreaterThanOrEqual(inAir * 4);
  });
});

describe('rollBleed', () => {
  it('draws nothing for a spell with no bleed chance, so the sequence is untouched', () => {
    const before = createRng(7).next();
    const again = createRng(7);
    expect(rollBleed(again, 0)).toBe(false);
    expect(rollBleed(again, -1)).toBe(false);
    expect(again.next()).toBe(before);
  });

  it('bleeds at about the stated rate, reproducibly from a seed', () => {
    const roll = (seed: number): number => {
      const rng = createRng(seed);
      let bleeds = 0;
      for (let i = 0; i < 10_000; i += 1) if (rollBleed(rng, base.bleedChance)) bleeds += 1;
      return bleeds;
    };
    const rate = roll(1) / 10_000;
    expect(rate).toBeGreaterThan(base.bleedChance - 0.01);
    expect(rate).toBeLessThan(base.bleedChance + 0.01);
    expect(roll(1)).toBe(roll(1));
  });

  it('a certain chance always bleeds', () => {
    const rng = createRng(3);
    for (let i = 0; i < 20; i += 1) expect(rollBleed(rng, 1)).toBe(true);
  });
});

describe('spikeHit', () => {
  it('pays the block on a landed roll: damage now, bleed over bleedDuration', () => {
    expect(spikeHit(base, true)).toEqual({ damage: 16, bleed: 4, bleedDurationS: 3 });
  });

  it('is damage alone on a missed roll', () => {
    expect(spikeHit(base, false)).toEqual({ damage: 16, bleed: 0, bleedDurationS: 0 });
  });

  it('carries a scaled block through, so passives reach the bleed too', () => {
    const scaled: EarthStats = { ...base, damage: 24, bleed: 6, bleedDuration: 4.5 };
    expect(spikeHit(scaled, true)).toEqual({ damage: 24, bleed: 6, bleedDurationS: 4.5 });
  });

  it('never asks for a negative bleed', () => {
    const broken: EarthStats = { ...base, bleed: -1, bleedDuration: -2 };
    expect(spikeHit(broken, true)).toEqual({ damage: 16, bleed: 0, bleedDurationS: 0 });
  });
});
