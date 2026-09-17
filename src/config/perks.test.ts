import { describe, expect, it } from 'vitest';
import { validatePerks } from '../core/spellStats';
import { GENERIC_PERKS, PERKS, perkById, perksForSpell, type PerkNode } from './perks';
import { SPELL_IDS, type SpellId } from './spells';

const BRANCHES = ['power', 'reach', 'utility'] as const;

function treeOf(spellId: SpellId): PerkNode[] {
  return PERKS.filter((perk) => perk.spell === spellId);
}

describe('perk trees', () => {
  it('gives every spell 7 nodes across the 3 branches (spec §5)', () => {
    for (const spellId of SPELL_IDS) {
      const tree = treeOf(spellId);
      expect(tree.length, spellId).toBe(7);
      for (const branch of BRANCHES) {
        const nodes = tree.filter((perk) => perk.branch === branch);
        expect(nodes.length, `${spellId}/${branch}`).toBeGreaterThan(0);
        // Tier order inside a branch: 1..n, one node each.
        const tiers = nodes.map((perk) => perk.tier).sort((a, b) => a - b);
        expect(tiers, `${spellId}/${branch}`).toEqual(nodes.map((_, index) => index + 1));
      }
    }
  });

  it('has the 3 generic nodes and no others outside a spell tree', () => {
    expect(GENERIC_PERKS.map((perk) => perk.id)).toEqual([
      'generic_move_speed',
      'generic_max_hp',
      'generic_pickup_radius',
    ]);
    expect(PERKS.length).toBe(SPELL_IDS.length * 7 + GENERIC_PERKS.length);
  });

  it('uses unique ids and finds each one by id', () => {
    expect(new Set(PERKS.map((perk) => perk.id)).size).toBe(PERKS.length);
    for (const perk of PERKS) expect(perkById(perk.id), perk.id).toBe(perk);
    expect(perkById('nope')).toBeUndefined();
  });

  it('offers a run its own spell plus the generic nodes, nothing else', () => {
    for (const spellId of SPELL_IDS) {
      const tree = perksForSpell(spellId);
      expect(tree.length, spellId).toBe(7 + GENERIC_PERKS.length);
      for (const perk of tree) {
        expect(perk.spell === spellId || perk.spell === 'generic', perk.id).toBe(true);
      }
    }
  });

  it('names a card for every node', () => {
    for (const perk of PERKS) {
      expect(perk.name.length, perk.id).toBeGreaterThan(0);
      expect(perk.description.length, perk.id).toBeGreaterThan(0);
      expect(perk.description, perk.id).not.toContain('\n');
    }
  });

  it('passes boot validation', () => {
    expect(validatePerks(PERKS)).toEqual([]);
  });
});
