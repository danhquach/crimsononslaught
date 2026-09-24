import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES } from '../config/enemies';
import {
  CONSUMABLE_CHANCE,
  CONSUMABLE_WEIGHTS,
  EMBER_DROPS,
  MAX_LIVE_PICKUPS,
  RELIC_COUNT,
  RELIC_PLACEMENT,
  type ConsumableKind,
} from '../config/pickups';
import {
  bombTargets,
  canDrop,
  consumableFor,
  PICKUP_EVENT,
  placeRelics,
  planDrop,
  rollDrops,
  tickMagnet,
} from './pickups';
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
      // A rare drop needs many rolls to read its rate: ~600 consumables here.
      const rolls = ROLLS * 10;
      for (let i = 0; i < rolls; i++) if (rollDrops(rng, type).consumable !== null) dropped++;
      expect(dropped / rolls, type).toBeGreaterThan(CONSUMABLE_CHANCE * 0.8);
      expect(dropped / rolls, type).toBeLessThan(CONSUMABLE_CHANCE * 1.2);
    }
  });

  it('takes exactly two draws per roll, whatever drops, elite or not', () => {
    for (const type of ENEMY_TYPES) {
      for (const elite of [false, true]) {
        const { rng, draws } = counting(3);
        for (let i = 0; i < 100; i++) rollDrops(rng, type, elite);
        expect(draws(), `${type} elite=${elite}`).toBe(200);
      }
    }
  });

  it('drops each regular kind at its share of the consumable roll, and never a chest', () => {
    const rng = createRng(deriveSeed(4, 'pickups'));
    const counts: Record<ConsumableKind, number> = { health: 0, magnet: 0, bomb: 0, chest: 0 };
    let dropped = 0;
    for (let i = 0; i < ROLLS * 50; i++) {
      const { consumable } = rollDrops(rng, 'swarm');
      if (consumable === null) continue;
      counts[consumable]++;
      dropped++;
    }
    expect(counts.chest).toBe(0);
    for (const [kind, weight] of Object.entries(CONSUMABLE_WEIGHTS)) {
      expect(counts[kind as ConsumableKind] / dropped, kind).toBeCloseTo(weight, 1);
    }
  });

  it('drops a chest for an elite, and no regular consumable', () => {
    const rng = createRng(12);
    for (let i = 0; i < 1000; i++) expect(rollDrops(rng, 'tank', true).consumable).toBe('chest');
  });

  it('keeps the Embers a seed dropped before consumables had kinds', () => {
    // The kind is read off the consumable draw, not a third draw, so the Ember
    // draws land where #195's did.
    const embers = (elite: boolean) => {
      const rng = createRng(21);
      return Array.from({ length: 200 }, () => rollDrops(rng, 'swarm', elite).embers);
    };
    const plain = createRng(21);
    const expected = Array.from({ length: 200 }, () => {
      const ember = plain.next();
      plain.next();
      return ember < EMBER_DROPS.swarm.chance ? EMBER_DROPS.swarm.value : 0;
    });
    expect(embers(false)).toEqual(expected);
    expect(embers(true)).toEqual(expected);
  });

  it('replays the same drops from the same seed', () => {
    const roll = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 50 }, () => rollDrops(rng, 'swarm'));
    };
    expect(roll(11)).toEqual(roll(11));
  });
});

describe('consumableFor', () => {
  it('drops nothing at or above the consumable chance', () => {
    expect(consumableFor(CONSUMABLE_CHANCE)).toBeNull();
    expect(consumableFor(0.5)).toBeNull();
    expect(consumableFor(0.999999)).toBeNull();
  });

  it('walks the weights in order inside the chance', () => {
    const { health, magnet } = CONSUMABLE_WEIGHTS;
    const at = (share: number) => consumableFor(share * CONSUMABLE_CHANCE);
    expect(at(0)).toBe('health');
    expect(at(health - 1e-6)).toBe('health');
    expect(at(health + 1e-6)).toBe('magnet');
    expect(at(health + magnet - 1e-6)).toBe('magnet');
    expect(at(health + magnet + 1e-6)).toBe('bomb');
    expect(at(1 - 1e-9)).toBe('bomb');
  });

  it('gives an elite a chest on every draw under its chance', () => {
    expect(consumableFor(0, true)).toBe('chest');
    expect(consumableFor(0.5, true)).toBe('chest');
    expect(consumableFor(0.999999, true)).toBe('chest');
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
  const both = { embers: 3, consumable: 'bomb' as const };

  it('places the whole drop while the floor has room', () => {
    expect(planDrop(both, 0)).toEqual({ ember: 3, credit: 0, consumable: 'bomb' });
    expect(planDrop({ embers: 0, consumable: null }, 0)).toEqual({
      ember: 0,
      credit: 0,
      consumable: null,
    });
  });

  it('credits an Ember the full floor cannot hold, and loses the consumable', () => {
    expect(planDrop(both, MAX_LIVE_PICKUPS)).toEqual({ ember: 0, credit: 3, consumable: null });
    expect(planDrop(both, MAX_LIVE_PICKUPS + 10)).toEqual({
      ember: 0,
      credit: 3,
      consumable: null,
    });
  });

  it('gives the last free slot to the Ember', () => {
    expect(planDrop(both, MAX_LIVE_PICKUPS - 1)).toEqual({
      ember: 3,
      credit: 0,
      consumable: null,
    });
    expect(planDrop({ embers: 0, consumable: 'health' }, MAX_LIVE_PICKUPS - 1)).toEqual({
      ember: 0,
      credit: 0,
      consumable: 'health',
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

describe('tickMagnet', () => {
  it('counts down by the step and stops at 0', () => {
    expect(tickMagnet(1000, 16)).toBe(984);
    expect(tickMagnet(10, 16)).toBe(0);
    expect(tickMagnet(0, 16)).toBe(0);
  });

  it('holds while the step is empty, as a paused or frozen run’s is', () => {
    expect(tickMagnet(500, 0)).toBe(500);
  });
});

describe('bombTargets', () => {
  const view = { x: 100, y: 200, width: 960, height: 540 };
  const at = (x: number, y: number, boss = false) => ({ x, y, boss });

  it('hits everything inside the view, edges included, and nothing outside it', () => {
    const inside = [at(100, 200), at(1060, 740), at(500, 500)];
    const outside = [at(99, 500), at(1061, 500), at(500, 199), at(500, 741)];
    expect(bombTargets([...inside, ...outside], view)).toEqual(inside);
  });

  it('spares what the predicate names — the boss', () => {
    const boss = at(500, 500, true);
    const swarm = at(600, 500);
    expect(bombTargets([boss, swarm], view, (t) => t.boss)).toEqual([swarm]);
  });

  it('returns a fresh array and hits nothing in an empty arena', () => {
    const live = [at(500, 500)];
    expect(bombTargets(live, view)).not.toBe(live);
    expect(bombTargets([], view)).toEqual([]);
  });
});

describe('PICKUP_EVENT', () => {
  it('names its channels in a pickup: namespace, clear of the run: channels', () => {
    for (const name of Object.values(PICKUP_EVENT)) expect(name).toMatch(/^pickup:/);
  });
});
