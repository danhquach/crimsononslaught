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
    const inside = (v: number, size: number) => v >= edgeMargin && v <= size - edgeMargin;
    for (let seed = 0; seed < 100; seed++) {
      const { props, keepClear } = dress(seed);
      // A 3000 px arena holds the whole count at this spacing with room over.
      expect(props, `seed ${seed}`).toHaveLength(ARENA_PROP_COUNT);
      // Broken rules are collected and asserted once per seed: an expect per
      // pair is half a million calls, which times out on a CI runner.
      const broken: string[] = [];
      props.forEach((prop, i) => {
        const at = `seed ${seed} prop ${i}`;
        if (!(ARENA_PROP_FRAMES as readonly string[]).includes(prop.frame))
          broken.push(`${at} frame`);
        if (!inside(prop.x, WORLD.width) || !inside(prop.y, WORLD.height))
          broken.push(`${at} edge`);
        if (keepClear.some((point) => distance(prop, point) < clearRadius))
          broken.push(`${at} clear`);
        if (props.slice(i + 1).some((other) => distance(prop, other) < spacing)) {
          broken.push(`${at} spacing`);
        }
      });
      expect(broken).toEqual([]);
    }
  });

  it('never puts a prop on the hero at the arena centre', () => {
    for (let seed = 0; seed < 100; seed++) {
      const nearest = Math.min(...dress(seed).props.map((prop) => distance(prop, START)));
      expect(nearest, `seed ${seed}`).toBeGreaterThanOrEqual(ARENA_PROP_PLACEMENT.clearRadius);
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
