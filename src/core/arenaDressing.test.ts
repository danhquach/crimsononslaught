import { describe, expect, it } from 'vitest';
import { ARENA_PROP_COUNT, ARENA_PROP_FRAMES, ARENA_PROP_PLACEMENT } from '../config/arena';
import { RELIC_COUNT } from '../config/pickups';
import { planProps } from './arenaDressing';
import { placeRelics } from './pickups';
import { createRng, deriveSeed } from './rng';

const WORLD = { width: 3000, height: 3000 };
const START = { x: 1500, y: 1500 };

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** A run's dressing as `GameScene` plans it: clear of the start and of that seed's relics. */
function dress(seed: number) {
  const relics = placeRelics(createRng(deriveSeed(seed, 'pickups')), WORLD, START, RELIC_COUNT);
  const keepClear = [START, ...relics];
  const props = planProps(
    createRng(deriveSeed(seed, 'arena')),
    WORLD,
    ARENA_PROP_COUNT,
    ARENA_PROP_FRAMES,
    keepClear,
    ARENA_PROP_PLACEMENT,
  );
  return { props, keepClear };
}

describe('planProps', () => {
  it('keeps every rule for many seeds, and fills the arena', () => {
    const { clearRadius, spacing, edgeMargin } = ARENA_PROP_PLACEMENT;
    for (let seed = 0; seed < 100; seed++) {
      const { props, keepClear } = dress(seed);
      // A 3000 px arena holds the whole count at this spacing with room over.
      expect(props, `seed ${seed}`).toHaveLength(ARENA_PROP_COUNT);
      props.forEach((prop, i) => {
        expect(ARENA_PROP_FRAMES).toContain(prop.frame);
        expect(prop.x).toBeGreaterThanOrEqual(edgeMargin);
        expect(prop.y).toBeGreaterThanOrEqual(edgeMargin);
        expect(prop.x).toBeLessThanOrEqual(WORLD.width - edgeMargin);
        expect(prop.y).toBeLessThanOrEqual(WORLD.height - edgeMargin);
        for (const point of keepClear) {
          expect(distance(prop, point)).toBeGreaterThanOrEqual(clearRadius);
        }
        for (const other of props.slice(i + 1)) {
          expect(distance(prop, other)).toBeGreaterThanOrEqual(spacing);
        }
      });
    }
  });

  it('never puts a prop on the hero at the arena centre', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const prop of dress(seed).props) {
        expect(distance(prop, START)).toBeGreaterThanOrEqual(ARENA_PROP_PLACEMENT.clearRadius);
      }
    }
  });

  it('dresses the arena identically from the same seed, and differently from another', () => {
    expect(dress(1).props).toEqual(dress(1).props);
    expect(dress(1).props).not.toEqual(dress(2).props);
  });

  it('uses every prop frame over a run', () => {
    const used = new Set(dress(1).props.map((p) => p.frame));
    expect([...used].sort()).toEqual([...ARENA_PROP_FRAMES].sort());
  });

  it('settles for fewer props, within its attempts, when the arena cannot hold them', () => {
    const rules = { clearRadius: 0, spacing: 400, edgeMargin: 100, maxAttempts: 500 };
    let draws = 0;
    const inner = createRng(7);
    const rng = { ...inner, next: () => (draws++, inner.next()) };
    // An 800 px square inside the margin holds at most 9 spots 400 apart.
    const props = planProps(rng, { width: 1000, height: 1000 }, 50, ['a'], [], rules);
    expect(props.length).toBeGreaterThan(0);
    expect(props.length).toBeLessThanOrEqual(9);
    // Every attempt spent, two position draws each, and then it stops. (The
    // frame pick draws inside `inner`, which this wrapper does not count.)
    expect(draws).toBe(rules.maxAttempts * 2);
  });

  it('places nothing in an arena narrower than its margins, or with no frames', () => {
    const rules = { ...ARENA_PROP_PLACEMENT };
    expect(planProps(createRng(1), { width: 100, height: 3000 }, 10, ['a'], [], rules)).toEqual([]);
    expect(planProps(createRng(1), WORLD, 10, [], [], rules)).toEqual([]);
  });
});
