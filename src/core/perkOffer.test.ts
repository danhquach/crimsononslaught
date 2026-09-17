import { describe, expect, it } from 'vitest';
import { PERKS, perksForSpell, type PerkNode } from '../config/perks';
import { eligible, offer, ownedRank, type OwnedPerks } from './perkOffer';
import { createRng } from './rng';

const FIRE_TREE = perksForSpell('fire');

const own = (...entries: [string, number][]): OwnedPerks => new Map(entries);

const ids = (perks: readonly PerkNode[]): string[] => perks.map((perk) => perk.id);

/** Take every rank of every node in `tree` — the exhausted-tree state. */
const ownAll = (tree: readonly PerkNode[]): OwnedPerks =>
  new Map(tree.map((perk) => [perk.id, perk.maxRank]));

describe('ownedRank', () => {
  it('reads a taken rank and treats an absent perk as zero', () => {
    const owned = own(['fire_power_damage', 2]);
    expect(ownedRank(owned, 'fire_power_damage')).toBe(2);
    expect(ownedRank(owned, 'fire_power_burn')).toBe(0);
  });
});

describe('eligible', () => {
  it('offers only tier-1 nodes on a fresh run (spec §5)', () => {
    expect(ids(eligible(FIRE_TREE, own())).sort()).toEqual([
      'fire_power_damage',
      'fire_reach_blast',
      'fire_utility_projectiles',
      'generic_max_hp',
      'generic_move_speed',
      'generic_pickup_radius',
    ]);
  });

  it('unlocks a tier-2 node once its prereq is owned at rank 1', () => {
    const owned = own(['fire_power_damage', 1]);
    expect(ids(eligible(FIRE_TREE, owned))).toContain('fire_power_burn');
  });

  it('keeps a tier-3 node gated while only its tier-1 sibling is owned', () => {
    const owned = own(['fire_power_damage', 3]);
    const unlocked = ids(eligible(FIRE_TREE, owned));
    expect(unlocked).toContain('fire_power_burn');
    expect(unlocked).not.toContain('fire_power_big_blast');
  });

  it('gates a prereq chain one tier at a time', () => {
    const owned = own(['fire_power_damage', 1], ['fire_power_burn', 1]);
    expect(ids(eligible(FIRE_TREE, owned))).toContain('fire_power_big_blast');
  });

  it('drops a node once it is at maxRank, leaving the rest of its branch', () => {
    // fire_power_damage is maxRank 3.
    expect(ids(eligible(FIRE_TREE, own(['fire_power_damage', 2])))).toContain('fire_power_damage');
    const maxed = ids(eligible(FIRE_TREE, own(['fire_power_damage', 3])));
    expect(maxed).not.toContain('fire_power_damage');
    expect(maxed).toContain('fire_power_burn');
  });

  it('returns nothing when every node in the tree is maxed', () => {
    expect(eligible(FIRE_TREE, ownAll(FIRE_TREE))).toEqual([]);
  });

  it('never offers a perk past its maxRank, for any tree', () => {
    for (const perk of PERKS) {
      const owned = own([perk.id, perk.maxRank]);
      expect(ids(eligible(PERKS, owned)), perk.id).not.toContain(perk.id);
    }
  });

  it('does not mutate the tree or the owned map', () => {
    const owned = own(['fire_power_damage', 1]);
    eligible(FIRE_TREE, owned);
    expect(FIRE_TREE).toHaveLength(10);
    expect([...owned]).toEqual([['fire_power_damage', 1]]);
  });
});

describe('offer', () => {
  it('draws 3 distinct perks from a full pool', () => {
    const drawn = offer(createRng(1), FIRE_TREE, 3);
    expect(drawn).toHaveLength(3);
    expect(new Set(ids(drawn)).size).toBe(3);
    for (const perk of drawn) expect(FIRE_TREE).toContain(perk);
  });

  it('offers what exists when the pool is smaller than the ask (spec §5)', () => {
    const pool = eligible(FIRE_TREE, own(['fire_utility_projectiles', 2]));
    expect(offer(createRng(7), pool.slice(0, 2), 3)).toHaveLength(2);
    expect(offer(createRng(7), pool.slice(0, 1), 3)).toHaveLength(1);
  });

  it('offers nothing from an exhausted tree', () => {
    expect(offer(createRng(7), eligible(FIRE_TREE, ownAll(FIRE_TREE)), 3)).toEqual([]);
  });

  it('offers nothing when asked for zero or fewer cards', () => {
    expect(offer(createRng(7), FIRE_TREE, 0)).toEqual([]);
    expect(offer(createRng(7), FIRE_TREE, -1)).toEqual([]);
  });

  it('is deterministic under a seed and varies across seeds', () => {
    expect(ids(offer(createRng(42), FIRE_TREE, 3))).toEqual(
      ids(offer(createRng(42), FIRE_TREE, 3)),
    );
    const seeds = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ids(offer(createRng(seed), FIRE_TREE, 3)).join()),
    );
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('never repeats a perk across many draws', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const drawn = ids(offer(createRng(seed), FIRE_TREE, 3));
      expect(new Set(drawn).size, `seed ${seed}`).toBe(drawn.length);
    }
  });

  it('can draw every pool member given enough seeds', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      for (const id of ids(offer(createRng(seed), FIRE_TREE, 3))) seen.add(id);
    }
    expect(seen.size).toBe(FIRE_TREE.length);
  });

  it('leaves the pool untouched', () => {
    const pool = [...FIRE_TREE];
    offer(createRng(3), pool, 3);
    expect(ids(pool)).toEqual(ids(FIRE_TREE));
  });
});

describe('a run drawing until the tree runs dry', () => {
  it('reaches zero offers after taking every rank', () => {
    const rng = createRng(2026);
    const owned = new Map<string, number>();
    let draws = 0;

    for (;;) {
      const pool = eligible(FIRE_TREE, owned);
      const cards = offer(rng, pool, 3);
      if (cards.length === 0) break;
      const pick = cards[0] as PerkNode;
      owned.set(pick.id, ownedRank(owned, pick.id) + 1);
      draws += 1;
      expect(draws).toBeLessThan(100); // guards against a non-terminating loop
    }

    // 10 nodes: 14 ranks across the fire branches + 8 generic ranks.
    expect(draws).toBe(22);
    expect(draws).toBe(FIRE_TREE.reduce((sum, perk) => sum + perk.maxRank, 0));
    expect(eligible(FIRE_TREE, owned)).toEqual([]);
  });
});
