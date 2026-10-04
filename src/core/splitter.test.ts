import { describe, expect, it } from 'vitest';
import { ENEMY_ARCHETYPES, SPLITTER_SPLIT, type EnemyType } from '../config/enemies';
import { UNSCALED, type Vec2, type WaveScale } from './enemy';
import { flushSplits, splitSpawns, type Split } from './splitter';

const split = (over: Partial<Split> = {}): Split => ({
  type: 'splitling',
  at: { x: 100, y: 100 },
  count: 3,
  spread: 16,
  scale: UNSCALED,
  ...over,
});

describe('splitSpawns', () => {
  it('rings the spot evenly at the spread, the first straight up', () => {
    const at = splitSpawns({ x: 100, y: 100 }, 3, 16);
    expect(at).toHaveLength(3);
    expect(at[0]?.x).toBeCloseTo(100, 10);
    expect(at[0]?.y).toBeCloseTo(84, 10);
    for (const p of at) expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(16, 10);
    // 120° apart: every pair the same distance from each other.
    const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
    const [a, b, c] = at as [Vec2, Vec2, Vec2];
    expect(d(a, b)).toBeCloseTo(d(b, c), 10);
    expect(d(b, c)).toBeCloseTo(d(c, a), 10);
  });

  it('puts a single child on the spot and none for no count', () => {
    expect(splitSpawns({ x: 5, y: 6 }, 1, 16)).toEqual([{ x: 5, y: 6 }]);
    expect(splitSpawns({ x: 5, y: 6 }, 0, 16)).toEqual([]);
  });

  it('is the same every time: no RNG', () => {
    expect(splitSpawns({ x: 1, y: 2 }, 4, 10)).toEqual(splitSpawns({ x: 1, y: 2 }, 4, 10));
  });
});

describe('flushSplits', () => {
  it('spawns every child with the splitter’s scale, and empties the queue', () => {
    const scale: WaveScale = { hpMul: 2, damageMul: 1.5 };
    const queue = [split({ scale }), split({ at: { x: 0, y: 0 }, count: 2 })];
    const seen: { type: EnemyType; at: Readonly<Vec2>; scale: Readonly<WaveScale> }[] = [];
    const result = flushSplits(queue, (type, at, s) => {
      seen.push({ type, at, scale: s });
      return true;
    });
    expect(result).toEqual({ spawned: 5, dropped: 0 });
    expect(queue).toEqual([]);
    expect(seen.slice(0, 3).every((c) => c.scale === scale)).toBe(true);
    expect(seen.slice(3).every((c) => c.scale === UNSCALED)).toBe(true);
    expect(seen.every((c) => c.type === 'splitling')).toBe(true);
  });

  it('drops the children the cap has no room for, and never retries them', () => {
    let live = 298;
    const cap = 300;
    const queue = [split(), split()];
    const result = flushSplits(queue, () => {
      if (live >= cap) return false;
      live++;
      return true;
    });
    expect(result).toEqual({ spawned: 2, dropped: 4 });
    expect(live).toBe(cap);
    expect(queue).toEqual([]);
    // Nothing owed comes back on the next flush.
    expect(flushSplits(queue, () => true)).toEqual({ spawned: 0, dropped: 0 });
  });

  it('tells the spawner which splits came from a summoned splitter (CO-231)', () => {
    const queue = [split({ summoned: true, count: 2 }), split({ count: 1 })];
    const flags: boolean[] = [];
    flushSplits(queue, (_type, _at, _scale, summoned) => {
      flags.push(summoned);
      return true;
    });
    expect(flags).toEqual([true, true, false]);
  });

  it('drops a summoned splitter’s children past the pack cap (CO-231)', () => {
    let pack = 9;
    const result = flushSplits([split({ summoned: true })], (_t, _a, _s, summoned) => {
      if (summoned && pack >= 10) return false;
      pack++;
      return true;
    });
    expect(result).toEqual({ spawned: 1, dropped: 2 });
    expect(pack).toBe(10);
  });
});

describe('the splitter tuning (#126)', () => {
  it('splits into a type that drops nothing and is smaller than its parent', () => {
    const child = ENEMY_ARCHETYPES[SPLITTER_SPLIT.child];
    expect(child.loot).toBe(false);
    expect(child.radius).toBeLessThan(ENEMY_ARCHETYPES.splitter.radius);
    expect(child.hp).toBeLessThan(ENEMY_ARCHETYPES.splitter.hp);
  });

  it('keeps its children inside the parent’s own footprint', () => {
    expect(SPLITTER_SPLIT.spread).toBeLessThanOrEqual(ENEMY_ARCHETYPES.splitter.radius + 4);
    expect(SPLITTER_SPLIT.count).toBeGreaterThan(1);
  });
});
