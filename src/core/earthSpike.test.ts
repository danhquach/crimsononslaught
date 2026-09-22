import { describe, expect, it } from 'vitest';
import { BASE_SPELL_STATS } from '../config/spells';
import { spikeCaught, spikeHit, spikeTarget } from './earthSpike';
import type { EarthStats } from './spellStats';

/**
 * #143 Earth Spike: where a cast erupts, who the eruption catches and what one
 * hit leaves behind. The shove itself is `knockbackVector`, covered in
 * `orbitingBoulders.test.ts`.
 */

const base: EarthStats = { ...BASE_SPELL_STATS.earth };
const CASTER = { x: 0, y: 0 } as const;

describe('spikeTarget', () => {
  it('erupts under the nearest enemy in range', () => {
    const near = { x: 100, y: 0 };
    const far = { x: 300, y: 0 };
    expect(spikeTarget(CASTER, [far, near], base.targetRange)).toBe(near);
  });

  it('ignores everything past targetRange, and counts the range itself as in', () => {
    const edge = { x: base.targetRange, y: 0 };
    const beyond = { x: base.targetRange + 1, y: 0 };
    expect(spikeTarget(CASTER, [edge], base.targetRange)).toBe(edge);
    expect(spikeTarget(CASTER, [beyond], base.targetRange)).toBeUndefined();
  });

  it('is spent on nothing with an empty crowd', () => {
    expect(spikeTarget(CASTER, [], base.targetRange)).toBeUndefined();
  });
});

describe('spikeCaught', () => {
  it('catches the target and everything crowded around it', () => {
    const target = { x: 100, y: 0 };
    const beside = { x: 100, y: 30 };
    const away = { x: 100, y: 80 };
    const caught = spikeCaught(target, [away, beside, target], base.radius);
    expect(caught).toEqual([target, beside]);
  });

  it('counts the radius itself as caught, and nothing past it', () => {
    const origin = { x: 0, y: 0 };
    const edge = { x: base.radius, y: 0 };
    const beyond = { x: base.radius + 1, y: 0 };
    expect(spikeCaught(origin, [edge, beyond], base.radius)).toEqual([edge]);
  });

  it('widens with the radius, so an area passive catches more', () => {
    const origin = { x: 0, y: 0 };
    const crowd = [
      { x: 30, y: 0 },
      { x: 50, y: 0 },
      { x: 70, y: 0 },
    ];
    expect(spikeCaught(origin, crowd, 40)).toHaveLength(1);
    expect(spikeCaught(origin, crowd, 80)).toHaveLength(3);
  });
});

describe('spikeHit', () => {
  it('pays the block: damage now, bleed over bleedDuration', () => {
    expect(spikeHit(base)).toEqual({ damage: 16, bleed: 4, bleedDurationS: 3 });
  });

  it('carries a scaled block through, so passives reach the bleed too', () => {
    const scaled: EarthStats = { ...base, damage: 24, bleed: 6, bleedDuration: 4.5 };
    expect(spikeHit(scaled)).toEqual({ damage: 24, bleed: 6, bleedDurationS: 4.5 });
  });

  it('never asks for a negative bleed', () => {
    const broken: EarthStats = { ...base, bleed: -1, bleedDuration: -2 };
    expect(spikeHit(broken)).toEqual({ damage: 16, bleed: 0, bleedDurationS: 0 });
  });
});
