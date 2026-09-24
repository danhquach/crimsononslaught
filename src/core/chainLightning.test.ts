import { describe, expect, it } from 'vitest';
import { BASE_CHAIN_LIGHTNING_STATS } from '../config/lightningRoster';
import { BASE_SPELL_STATS } from '../config/spells';
import {
  applyStun,
  chainPath,
  hitDamage,
  resolveCast,
  rollStun,
  stunSpeedFactor,
  tickStun,
} from './chainLightning';
import { createRng } from './rng';
import type { ChainLightningStats, LightningStats } from './spellStats';

type Vec = { x: number; y: number };

/** Chain Lightning's block: the one with jumps, which most of these rules are about. */
const base: ChainLightningStats = { ...BASE_CHAIN_LIGHTNING_STATS };
/** Lightning Bolt's block: no chain fields at all (#142). */
const bolt: LightningStats = { ...BASE_SPELL_STATS.lightning };
const origin = { x: 0, y: 0 };
/** A reach past every `row` below, for the rules that are about strike order, not range. */
const wideReach = { targetRange: 1000 };

/** Enemies on a line, each `gap` px further along x from the origin. */
function row(count: number, gap = 100): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => ({ x: gap * (i + 1), y: 0 }));
}

describe('hitDamage and falloff (CO-046)', () => {
  it('the first target takes full damage', () => {
    expect(hitDamage(base, false)).toBe(base.damage);
  });

  it('a chained hit takes 80%', () => {
    expect(hitDamage(base, true)).toBeCloseTo(base.damage * 0.8, 9);
  });

  it('No Falloff brings chained hits to 100%', () => {
    expect(hitDamage({ ...base, chainFalloff: 1 }, true)).toBe(base.damage);
  });

  it('falloff compounds with +damage perks', () => {
    expect(hitDamage({ ...base, damage: 19 }, true)).toBeCloseTo(15.2, 9);
  });

  it('a block with no falloff field (Lightning Bolt) pays full damage', () => {
    expect(hitDamage(bolt, true)).toBe(bolt.damage);
  });
});

describe('chainPath target selection (CO-046)', () => {
  it('jumps to the nearest unhit enemy within chainRange, chains times', () => {
    const [a, b, c, d] = row(4) as [Vec, Vec, Vec, Vec];
    expect(chainPath(a, [a, b, c, d], 2, 120)).toEqual([a, b, c]);
  });

  it('never revisits an enemy: the nearest unhit one wins, not the nearest', () => {
    const a = { x: 100, y: 0 };
    const b = { x: 200, y: 0 };
    const c = { x: 300, y: 0 };
    // From b the nearest enemy is a (already hit); the arc goes on to c.
    expect(chainPath(a, [a, b, c], 3, 120)).toEqual([a, b, c]);
  });

  it('stops early when nothing unhit is in range', () => {
    const [a, b] = row(2) as [Vec, Vec];
    const far = { x: 500, y: 0 };
    expect(chainPath(a, [a, b, far], 3, 120)).toEqual([a, b]);
  });

  it('measures chainRange from the enemy just struck, inclusive', () => {
    const a = { x: 100, y: 0 };
    const edge = { x: 220, y: 0 };
    const beyond = { x: 221, y: 0 };
    expect(chainPath(a, [a, edge], 1, 120)).toEqual([a, edge]);
    expect(chainPath(a, [a, beyond], 1, 120)).toEqual([a]);
  });

  it('measures true distance, not per-axis', () => {
    const a = { x: 0, y: 0 };
    const diagonal = { x: 90, y: 90 }; // ~127 px away
    expect(chainPath(a, [a, diagonal], 1, 120)).toEqual([a]);
    expect(chainPath(a, [a, diagonal], 1, 128)).toEqual([a, diagonal]);
  });

  it('a wider chainRange reaches what the base one cannot', () => {
    const a = { x: 100, y: 0 };
    const b = { x: 250, y: 0 };
    expect(chainPath(a, [a, b], 1, base.chainRange)).toEqual([a]);
    expect(chainPath(a, [a, b], 1, base.chainRange + 40)).toEqual([a, b]);
  });

  it('with zero chains the bolt is the first target alone', () => {
    const [a, b] = row(2) as [Vec, Vec];
    expect(chainPath(a, [a, b], 0, 120)).toEqual([a]);
  });

  it('skips enemies another bolt in the cast already struck', () => {
    const [a, b, c] = row(3) as [Vec, Vec, Vec];
    expect(chainPath(a, [a, b, c], 2, 120, new Set([b]))).toEqual([a]);
    expect(chainPath(a, [a, b, c], 2, 250, new Set([b]))).toEqual([a, c]);
  });

  it('equally distant candidates keep input order', () => {
    const a = { x: 0, y: 0 };
    const up = { x: 0, y: 100 };
    const down = { x: 0, y: -100 };
    expect(chainPath(a, [a, down, up], 1, 120)).toEqual([a, down]);
    expect(chainPath(a, [a, up, down], 1, 120)).toEqual([a, up]);
  });
});

describe('resolveCast (CO-046)', () => {
  it('one bolt at base: nearest enemy, then two chains', () => {
    const [a, b, c, d] = row(4) as [Vec, Vec, Vec, Vec];
    const bolts = resolveCast(origin, [d, c, b, a], base);
    expect(bolts).toEqual([
      [
        { target: a, damage: base.damage },
        { target: b, damage: base.damage * base.chainFalloff },
        { target: c, damage: base.damage * base.chainFalloff },
      ],
    ]);
  });

  it('base +1 chain arcs across three more enemies than the first', () => {
    const enemies = row(5);
    const [bolt] = resolveCast(origin, enemies, { ...base, chains: 3 });
    expect(bolt?.map((hit) => hit.target)).toEqual(enemies.slice(0, 4));
  });

  it('the first target must be within targetRange, inclusive (spec §9.4)', () => {
    const edge = { x: base.targetRange, y: 0 };
    const beyond = { x: base.targetRange + 1, y: 0 };
    expect(resolveCast(origin, [edge], base)).toEqual([[{ target: edge, damage: base.damage }]]);
    expect(resolveCast(origin, [beyond], base)).toEqual([]);
  });

  it('a chain may reach past targetRange once the first target is in range', () => {
    const near = { x: base.targetRange, y: 0 };
    const beyond = { x: base.targetRange + 100, y: 0 };
    const [arc] = resolveCast(origin, [near, beyond], base);
    expect(arc?.map((hit) => hit.target)).toEqual([near, beyond]);
  });

  it('Lightning Bolt (no chain fields) is a single hit per strike', () => {
    const enemies = row(3);
    expect(resolveCast(origin, enemies, bolt)).toEqual([
      [{ target: enemies[0], damage: bolt.damage }],
    ]);
    const two = resolveCast(origin, enemies, { ...bolt, ...wideReach, strikes: 2 });
    expect(two.map((arc) => arc.map((hit) => hit.target))).toEqual([[enemies[0]], [enemies[1]]]);
  });

  it('No Falloff pays full damage down the whole arc', () => {
    const bolts = resolveCast(origin, row(3), { ...base, chainFalloff: 1 });
    expect(bolts[0]?.map((hit) => hit.damage)).toEqual([base.damage, base.damage, base.damage]);
  });

  it('with no enemy there are no bolts', () => {
    expect(resolveCast(origin, [], base)).toEqual([]);
  });

  it('a second strike starts at the nearest enemy the first did not touch', () => {
    const enemies = row(6);
    const bolts = resolveCast(origin, enemies, { ...base, ...wideReach, strikes: 2 });
    expect(bolts.map((bolt) => bolt.map((hit) => hit.target))).toEqual([
      enemies.slice(0, 3),
      enemies.slice(3, 6),
    ]);
  });

  it('strikes never hit the same enemy twice while another is unhit', () => {
    const enemies = row(4);
    const bolts = resolveCast(origin, enemies, { ...base, ...wideReach, strikes: 3 });
    const struck = bolts.flat().map((hit) => hit.target);
    expect(struck.slice(0, 4)).toEqual(enemies);
    expect(new Set(struck.slice(0, 4)).size).toBe(4);
  });

  it('once everything is hit a further bolt lands on the nearest enemy again, with no chain', () => {
    const [lone] = row(1) as [Vec];
    const bolts = resolveCast(origin, [lone], { ...base, strikes: 2 });
    expect(bolts).toEqual([
      [{ target: lone, damage: base.damage }],
      [{ target: lone, damage: base.damage }],
    ]);
  });

  it('does not touch the input list', () => {
    const enemies = row(3);
    const snapshot = enemies.map((enemy) => ({ ...enemy }));
    resolveCast(origin, enemies, { ...base, strikes: 2 });
    expect(enemies).toEqual(snapshot);
  });
});

describe('rollStun (#142)', () => {
  it('draws nothing for a spell with no stun chance, so the sequence is untouched', () => {
    const rng = createRng(7);
    const before = rng.next();
    const again = createRng(7);
    expect(rollStun(again, 0)).toBe(false);
    expect(rollStun(again, -1)).toBe(false);
    expect(again.next()).toBe(before);
  });

  it('stuns at about the stated rate, reproducibly from a seed', () => {
    const roll = (seed: number): number => {
      const rng = createRng(seed);
      let stuns = 0;
      for (let i = 0; i < 10_000; i += 1) if (rollStun(rng, bolt.stunChance)) stuns += 1;
      return stuns;
    };
    const rate = roll(1) / 10_000;
    expect(rate).toBeGreaterThan(bolt.stunChance - 0.02);
    expect(rate).toBeLessThan(bolt.stunChance + 0.02);
    expect(roll(1)).toBe(roll(1));
  });

  it('a certain chance always stuns', () => {
    const rng = createRng(3);
    for (let i = 0; i < 20; i += 1) expect(rollStun(rng, 1)).toBe(true);
  });
});

describe('stun (CO-046)', () => {
  it('unstunned is full speed', () => {
    expect(stunSpeedFactor(0)).toBe(1);
  });

  it('a hit stops the enemy for the stun duration', () => {
    expect(applyStun(0, 0.3)).toBe(0.3);
    expect(stunSpeedFactor(0.3)).toBe(0);
  });

  it('the unperked spell (stun 0) applies nothing', () => {
    expect(applyStun(0, 0)).toBe(0);
    expect(applyStun(0.2, 0)).toBe(0.2);
  });

  it('refreshes rather than stacks, and never shortens', () => {
    expect(applyStun(0.1, 0.3)).toBe(0.3);
    expect(applyStun(0.3, 0.3)).toBe(0.3);
    expect(applyStun(0.5, 0.3)).toBe(0.5);
  });

  it('runs out exactly over its duration', () => {
    let remaining = applyStun(0, 0.3);
    for (let i = 0; i < 19; i += 1) remaining = tickStun(remaining, 1 / 60).remainingS;
    expect(remaining).toBe(0);
  });

  it('reports the frame the stun ended on, once', () => {
    const first = tickStun(0.3, 0.2);
    expect(first).toEqual({ remainingS: expect.closeTo(0.1, 9) as number, ended: false });
    const second = tickStun(first.remainingS, 0.2);
    expect(second).toEqual({ remainingS: 0, ended: true });
    expect(tickStun(0, 1)).toEqual({ remainingS: 0, ended: false });
  });

  it('a zero or negative frame changes nothing', () => {
    expect(tickStun(0.3, 0)).toEqual({ remainingS: 0.3, ended: false });
    expect(tickStun(0.3, -1)).toEqual({ remainingS: 0.3, ended: false });
  });
});
