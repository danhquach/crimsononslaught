import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES } from '../config/enemies';
import {
  CONSUMABLE_CHANCE,
  EMBER_DROPS,
  MAX_LIVE_PICKUPS,
  RELIC_COUNT,
  RELIC_PLACEMENT,
} from '../config/pickups';
import { canDrop, PICKUP_EVENT, placeRelics, planDrop, rollDrops } from './pickups';
import { createRng, deriveSeed, type Rng } from './rng';

const WORLD = { width: 3000, height: 3000 };
const START = { x: 1500, y: 1500 };
const ROLLS = 20_000;

/** An Rng that counts its draws, so a test can pin how many a rule takes. */
function counting(seed: number): { rng: Rng; draws: () => number } {
  const inner = createRng(seed);
  let draws = 0;
  const rng: Rng = {
    ...inner,
    next: () => {
      draws++;
      return inner.next();
    },
  };
  return { rng, draws: () => draws };
}

describe('rollDrops', () => {
  it('drops Embers at each type’s rate and worth', () => {
    const rng = createRng(deriveSeed(1, 'pickups'));
    for (const type of ENEMY_TYPES) {
      const { chance, value } = EMBER_DROPS[type];
      let dropped = 0;
      for (let i = 0; i < ROLLS; i++) {
        const { embers } = rollDrops(rng, type);
        expect([0, value]).toContain(embers);
        if (embers > 0) dropped++;
      }
      expect(dropped / ROLLS, type).toBeCloseTo(chance, 1);
    }
  });

  it('always drops a tank’s 3 Embers', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) expect(rollDrops(rng, 'tank').embers).toBe(3);
  });

  it('drops a consumable at the configured rate for every type', () => {
    const rng = createRng(deriveSeed(2, 'pickups'));
    for (const type of ENEMY_TYPES) {
      let dropped = 0;
      for (let i = 0; i < ROLLS; i++) if (rollDrops(rng, type).consumable) dropped++;
      expect(dropped / ROLLS, type).toBeGreaterThan(CONSUMABLE_CHANCE * 0.7);
      expect(dropped / ROLLS, type).toBeLessThan(CONSUMABLE_CHANCE * 1.3);
    }
  });

  it('takes exactly two draws per roll, whatever drops', () => {
    for (const type of ENEMY_TYPES) {
      const { rng, draws } = counting(3);
      for (let i = 0; i < 100; i++) rollDrops(rng, type);
      expect(draws(), type).toBe(200);
    }
  });

  it('replays the same drops from the same seed', () => {
    const roll = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 50 }, () => rollDrops(rng, 'swarm'));
    };
    expect(roll(11)).toEqual(roll(11));
  });
});

describe('canDrop', () => {
  it('allows drops until the cap is full', () => {
    expect(canDrop(0)).toBe(true);
    expect(canDrop(MAX_LIVE_PICKUPS - 1)).toBe(true);
    expect(canDrop(MAX_LIVE_PICKUPS)).toBe(false);
    expect(canDrop(MAX_LIVE_PICKUPS + 5)).toBe(false);
  });
});

describe('planDrop', () => {
  const both = { embers: 3, consumable: true };

  it('places the whole drop while the floor has room', () => {
    expect(planDrop(both, 0)).toEqual({ ember: 3, credit: 0, consumable: true });
    expect(planDrop({ embers: 0, consumable: false }, 0)).toEqual({
      ember: 0,
      credit: 0,
      consumable: false,
    });
  });

  it('credits an Ember the full floor cannot hold, and loses the consumable', () => {
    expect(planDrop(both, MAX_LIVE_PICKUPS)).toEqual({ ember: 0, credit: 3, consumable: false });
    expect(planDrop(both, MAX_LIVE_PICKUPS + 10)).toEqual({
      ember: 0,
      credit: 3,
      consumable: false,
    });
  });

  it('gives the last free slot to the Ember', () => {
    expect(planDrop(both, MAX_LIVE_PICKUPS - 1)).toEqual({
      ember: 3,
      credit: 0,
      consumable: false,
    });
    expect(planDrop({ embers: 0, consumable: true }, MAX_LIVE_PICKUPS - 1)).toEqual({
      ember: 0,
      credit: 0,
      consumable: true,
    });
  });

  it('never loses an Ember, full floor or not', () => {
    for (const live of [0, 1, MAX_LIVE_PICKUPS - 1, MAX_LIVE_PICKUPS, MAX_LIVE_PICKUPS * 2]) {
      const plan = planDrop(both, live);
      expect(plan.ember + plan.credit, `live ${live}`).toBe(both.embers);
    }
  });
});

describe('placeRelics', () => {
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  it('places every relic in the arena for many seeds, keeping the spacing', () => {
    const { minFromStart, minApart, edgeMargin } = RELIC_PLACEMENT;
    for (let seed = 0; seed < 200; seed++) {
      const spots = placeRelics(createRng(deriveSeed(seed, 'pickups')), WORLD, START, RELIC_COUNT);
      expect(spots, `seed ${seed}`).toHaveLength(RELIC_COUNT);
      spots.forEach((spot, i) => {
        expect(distance(spot, START)).toBeGreaterThanOrEqual(minFromStart);
        expect(spot.x).toBeGreaterThanOrEqual(edgeMargin);
        expect(spot.y).toBeGreaterThanOrEqual(edgeMargin);
        expect(spot.x).toBeLessThanOrEqual(WORLD.width - edgeMargin);
        expect(spot.y).toBeLessThanOrEqual(WORLD.height - edgeMargin);
        for (const other of spots.slice(i + 1)) {
          expect(distance(spot, other)).toBeGreaterThanOrEqual(minApart);
        }
      });
    }
  });

  it('replays the same spots from the same seed', () => {
    const place = () => placeRelics(createRng(99), WORLD, START, RELIC_COUNT);
    expect(place()).toEqual(place());
  });

  it('settles for fewer relics when the arena cannot hold them', () => {
    // 1200 px wide with a 100 px margin: a 1000 px square holds at most four
    // spots 500 apart at its corners, and the centre is ruled out by the start.
    const small = { width: 1200, height: 1200 };
    const { rng, draws } = counting(5);
    const spots = placeRelics(rng, small, { x: 600, y: 600 }, RELIC_COUNT);
    expect(spots.length).toBeLessThan(RELIC_COUNT);
    // Two draws a candidate, and it stopped at the attempt cap.
    expect(draws()).toBe(RELIC_PLACEMENT.maxAttempts * 2);
  });

  it('places nothing in an arena narrower than its margins', () => {
    expect(placeRelics(createRng(1), { width: 150, height: 3000 }, START, RELIC_COUNT)).toEqual([]);
  });

  it('stops drawing once every relic is placed', () => {
    const { rng, draws } = counting(8);
    placeRelics(rng, WORLD, START, RELIC_COUNT);
    expect(draws()).toBeLessThan(RELIC_PLACEMENT.maxAttempts * 2);
  });
});

describe('PICKUP_EVENT', () => {
  it('names its channels in a pickup: namespace, clear of the run: channels', () => {
    for (const name of Object.values(PICKUP_EVENT)) expect(name).toMatch(/^pickup:/);
  });
});
