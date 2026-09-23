/**
 * Seeded pseudo-random number generator. The ONLY randomness source in the
 * game; `Math.random` is banned by ESLint everywhere else so a run can be
 * replayed from its seed.
 *
 * Implementation: mulberry32 — a 32-bit state PRNG that is fast, has a full
 * 2^32 period, and passes the usual statistical smoke tests. Plenty for
 * gameplay. Seeds are reduced to 32 bits, so seeds that differ only above
 * bit 31 share a sequence (e.g. a raw `Date.now()` is fine, just truncated).
 */
export interface Rng {
  /** The seed this generator was created with. */
  readonly seed: number;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both ends inclusive. */
  int(min: number, max: number): number;
  /** Uniform element of `arr`. Throws RangeError on an empty array. */
  pick<T>(arr: readonly T[]): T;
  /** New array with the elements of `arr` in uniformly random order. Input untouched. */
  shuffle<T>(arr: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) throw new RangeError(`int: max ${max} < min ${min}`);
    return min + Math.floor(next() * (max - min + 1));
  };

  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new RangeError('pick: empty array');
    return arr[int(0, arr.length - 1)] as T;
  };

  const shuffle = <T>(arr: readonly T[]): T[] => {
    const out = [...arr];
    // Fisher–Yates
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };

  return { seed, next, int, pick, shuffle };
}

/**
 * The seed of a named stream of its own, derived from the run's (#195). A rule
 * that draws from a derived stream never moves a draw on the run's RNG, so
 * adding one leaves every existing seed's spawns and level-up offers where
 * they were. The label is hashed (FNV-1a) into the seed and the result mixed
 * (murmur3's finaliser), so nearby seeds and labels land far apart.
 */
export function deriveSeed(seed: number, label: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  let x = (seed ^ hash) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Pick the run seed: an integer `?seed=` query param wins, otherwise `fallback`
 * (callers pass `Date.now()`). Pure so it is unit-testable without a DOM.
 */
export function resolveSeed(search: string, fallback: number): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) ? n : fallback;
}
