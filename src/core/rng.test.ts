import { describe, expect, it } from 'vitest';
import { createRng, resolveSeed } from './rng';

const draw = (seed: number, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('createRng', () => {
  it('same seed -> identical 100-value sequence', () => {
    expect(draw(12345, 100)).toEqual(draw(12345, 100));
  });

  it('different seeds -> different sequences', () => {
    expect(draw(1, 100)).not.toEqual(draw(2, 100));
  });

  it('next() stays in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) is inclusive on both ends and covers the range', () => {
    const rng = createRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = rng.int(3, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('int(n, n) always returns n', () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) expect(rng.int(5, 5)).toBe(5);
  });

  it('int throws when max < min', () => {
    expect(() => createRng(1).int(6, 3)).toThrow(RangeError);
  });

  it('pick is deterministic under seed and only returns members', () => {
    const items = ['a', 'b', 'c', 'd'] as const;
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 100; i++) {
      const v = a.pick(items);
      expect(v).toBe(b.pick(items));
      expect(items).toContain(v);
    }
  });

  it('pick throws on an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });

  it('shuffle is deterministic under seed and a permutation of the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = createRng(2024).shuffle(input);
    const b = createRng(2024).shuffle(input);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
    expect(a).not.toEqual(input); // vanishingly unlikely to be identity for this seed
  });

  it('shuffle does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    createRng(3).shuffle(input);
    expect(input).toEqual(copy);
  });

  it('exposes the seed it was created with', () => {
    expect(createRng(555).seed).toBe(555);
  });
});

describe('resolveSeed', () => {
  it('reads an integer ?seed= param', () => {
    expect(resolveSeed('?seed=123', 999)).toBe(123);
    expect(resolveSeed('?foo=1&seed=42', 999)).toBe(42);
  });

  it('falls back when the param is missing or not an integer', () => {
    expect(resolveSeed('', 999)).toBe(999);
    expect(resolveSeed('?seed=', 999)).toBe(999);
    expect(resolveSeed('?seed=abc', 999)).toBe(999);
    expect(resolveSeed('?seed=1.5', 999)).toBe(999);
  });
});
