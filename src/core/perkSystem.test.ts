import { describe, expect, it } from 'vitest';
import { perksForSpell } from '../config/perks';
import { BASE_SPELL_STATS } from '../config/spells';
import { MAX_OFFER_SIZE, type PerkCard } from './levelUp';
import { PerkSystem } from './perkSystem';
import { createRng } from './rng';
import { BASE_PLAYER_STATS } from './spellStats';

const system = (seed = 1): PerkSystem<'fire'> => new PerkSystem('fire', createRng(seed));

const ids = (cards: readonly PerkCard[]): string[] => cards.map((card) => card.id);

/** Take every rank of every node in the fire run's tree — the exhausted-tree state. */
const exhaust = (perks: PerkSystem<'fire'>): void => {
  // Tier order, so each prereq is owned before the node above it is taken.
  for (const perk of [...perksForSpell('fire')].sort((a, b) => a.tier - b.tier)) {
    for (let rank = 0; rank < perk.maxRank; rank++) perks.pick(perk.id);
  }
};

describe('PerkSystem', () => {
  it('starts at base stats with nothing owned', () => {
    const perks = system();
    expect(perks.spellStats).toEqual(BASE_SPELL_STATS.fire);
    expect(perks.playerStats).toEqual(BASE_PLAYER_STATS);
    expect(perks.owned.size).toBe(0);
    expect(perks.rankOf('fire_power_damage')).toBe(0);
  });

  it('offers only tier-1 nodes of the run tree, at rank 1', () => {
    const cards = system().offer(99);
    expect(ids(cards).sort()).toEqual([
      'fire_power_damage',
      'fire_reach_blast',
      'fire_utility_projectiles',
      'generic_max_hp',
      'generic_move_speed',
      'generic_pickup_radius',
    ]);
    expect(cards.every((card) => card.rank === 1)).toBe(true);
  });

  it('never offers another spell tree', () => {
    const ice = new PerkSystem('ice', createRng(1));
    expect(ids(ice.offer(99)).some((id) => id.startsWith('fire_'))).toBe(false);
  });

  it('offers 3 distinct cards by default and replays them for a seed', () => {
    const cards = system(7).offer();
    expect(cards).toHaveLength(MAX_OFFER_SIZE);
    expect(new Set(ids(cards)).size).toBe(MAX_OFFER_SIZE);
    expect(ids(system(7).offer())).toEqual(ids(cards));
  });

  it('shows the display slice the overlay renders', () => {
    const perks = system();
    perks.pick('fire_power_damage');
    const card = perks.offer(99).find((c) => c.id === 'fire_power_damage');
    expect(card).toEqual({
      id: 'fire_power_damage',
      name: 'Kindling',
      branch: 'Power',
      rank: 2,
      maxRank: 3,
      description: '+3 fireball damage',
    });
  });

  // AC: picking a spell perk changes the stats the next cast reads.
  it('applies a spell perk to the spell block', () => {
    const perks = system();
    expect(perks.pick('fire_power_damage')?.rank).toBe(1);
    expect(perks.spellStats.damage).toBe(BASE_SPELL_STATS.fire.damage + 3);
    expect(perks.rankOf('fire_power_damage')).toBe(1);
  });

  // AC: Move Speed x3 yields 180 * 1.1^3.
  it('compounds the three ranks of Move Speed on the player block', () => {
    const perks = system();
    for (let rank = 1; rank <= 3; rank++) expect(perks.pick('generic_move_speed')?.rank).toBe(rank);
    expect(perks.playerStats.moveSpeed).toBeCloseTo(180 * 1.1 ** 3, 10);
    expect(perks.spellStats).toEqual(BASE_SPELL_STATS.fire);
  });

  it('applies the other two generic perks', () => {
    const perks = system();
    perks.pick('generic_max_hp');
    perks.pick('generic_max_hp');
    perks.pick('generic_pickup_radius');
    expect(perks.playerStats.maxHp).toBe(BASE_PLAYER_STATS.maxHp + 40);
    expect(perks.playerStats.pickupRadius).toBeCloseTo(BASE_PLAYER_STATS.pickupRadius * 1.25, 10);
  });

  it('leaves the stats it handed out alone when the next pick lands', () => {
    const perks = system();
    perks.pick('fire_power_damage');
    const before = perks.spellStats;
    perks.pick('fire_power_damage');
    expect(before.damage).toBe(BASE_SPELL_STATS.fire.damage + 3);
    expect(perks.spellStats.damage).toBe(BASE_SPELL_STATS.fire.damage + 6);
  });

  it('unlocks the tier above a pick and stops offering a maxed node', () => {
    const perks = system();
    expect(ids(perks.offer(99))).not.toContain('fire_power_burn');
    perks.pick('fire_power_damage');
    expect(ids(perks.offer(99))).toContain('fire_power_burn');
    perks.pick('fire_power_damage');
    perks.pick('fire_power_damage');
    expect(ids(perks.offer(99))).not.toContain('fire_power_damage');
  });

  it('ignores a pick it did not offer, leaving the run untouched', () => {
    const perks = system();
    expect(perks.pick('nope')).toBeUndefined();
    // Another spell's tree, and a node whose prereq is not owned yet.
    expect(perks.pick('ice_power_damage')).toBeUndefined();
    expect(perks.pick('fire_power_burn')).toBeUndefined();
    expect(perks.owned.size).toBe(0);
    expect(perks.spellStats).toEqual(BASE_SPELL_STATS.fire);
  });

  it('ignores a pick past maxRank', () => {
    const perks = system();
    perks.pick('generic_pickup_radius');
    perks.pick('generic_pickup_radius');
    expect(perks.pick('generic_pickup_radius')).toBeUndefined();
    expect(perks.rankOf('generic_pickup_radius')).toBe(2);
  });

  // Spec §5: an empty offer is what drives the silent +10 max HP fallback.
  it('offers nothing once the tree is exhausted', () => {
    const perks = system();
    exhaust(perks);
    expect(perks.offer()).toEqual([]);
    expect(perks.spellStats.damage).toBe(BASE_SPELL_STATS.fire.damage + 9);
  });
});
