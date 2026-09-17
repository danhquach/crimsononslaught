import { describe, expect, it } from 'vitest';
import { GENERIC_PERKS, PERKS, type PerkNode } from '../config/perks';
import { BASE_SPELL_STATS, SPELL_IDS, type SpellId } from '../config/spells';
import {
  BASE_PLAYER_STATS,
  applyPerk,
  createLoadout,
  validatePerks,
  type LoadoutStats,
} from './spellStats';

/** The spell a perk can be tried on; generic perks work on any, so use Fire. */
function spellFor(perk: PerkNode): SpellId {
  return perk.spell === 'generic' ? 'fire' : perk.spell;
}

function asRecord(block: object): Record<string, number> {
  return block as unknown as Record<string, number>;
}

/** Field names whose value differs between two stat blocks. */
function changedFields(before: object, after: object): string[] {
  const a = asRecord(before);
  const b = asRecord(after);
  return Object.keys(a).filter((field) => a[field] !== b[field]);
}

describe('base stats', () => {
  it('matches the spec §5 base table', () => {
    expect(BASE_SPELL_STATS.fire).toEqual({
      cooldown: 1.2,
      damage: 12,
      aoeRadius: 40,
      aoeDamageFactor: 0.5,
      projectiles: 1,
      speed: 350,
      range: 400,
      burn: 0,
    });
    expect(BASE_SPELL_STATS.ice).toEqual({
      cooldown: 2,
      damage: 8,
      radius: 90,
      slowPct: 0.3,
      slowDuration: 1.5,
      freezeChance: 0,
      shatterBonus: 0,
    });
    expect(BASE_SPELL_STATS.lightning).toEqual({
      cooldown: 1,
      damage: 10,
      chains: 2,
      chainRange: 120,
      strikes: 1,
      stun: 0,
      chainFalloff: 0.8,
    });
    expect(BASE_SPELL_STATS.earth).toEqual({
      count: 2,
      orbitRadius: 80,
      orbitSpeed: 2,
      damage: 10,
      knockback: 60,
      size: 14,
      crushMultiplier: 1,
    });
  });

  it('starts the player at the values the entities already use (spec §5)', () => {
    expect(BASE_PLAYER_STATS).toEqual({ moveSpeed: 180, maxHp: 100, pickupRadius: 40 });
  });

  it('hands each run its own copy of the blocks', () => {
    const loadout = createLoadout('fire');
    loadout.spell.damage = 999;
    loadout.player.maxHp = 1;
    expect(BASE_SPELL_STATS.fire.damage).toBe(12);
    expect(BASE_PLAYER_STATS.maxHp).toBe(100);
    expect(createLoadout('fire').spell.damage).toBe(12);
  });
});

describe('applyPerk', () => {
  it('applies every rank of every perk and touches only its own field', () => {
    for (const perk of PERKS) {
      const spellId = spellFor(perk);
      let loadout: LoadoutStats = createLoadout(spellId);
      for (let rank = 1; rank <= perk.maxRank; rank += 1) {
        const before = loadout;
        loadout = applyPerk(loadout, perk.id, rank);

        const spellChanges = changedFields(before.spell, loadout.spell);
        const playerChanges = changedFields(before.player, loadout.player);
        const changes = perk.spell === 'generic' ? playerChanges : spellChanges;
        const untouched = perk.spell === 'generic' ? spellChanges : playerChanges;

        const where = `${perk.id} rank ${rank}`;
        expect(untouched, where).toEqual([]);
        // `set` perks are already at their value after rank 1, so a later rank
        // of one may legitimately change nothing.
        expect(changes.length <= 1, `${where}: ${changes.join(', ')}`).toBe(true);
        if (changes.length === 1) expect(changes[0], where).toBe(perk.effect.field);
        if (perk.effect.op !== 'set' || rank === 1) expect(changes, where).toHaveLength(1);

        const value = asRecord(perk.spell === 'generic' ? loadout.player : loadout.spell)[
          perk.effect.field
        ];
        expect(Number.isFinite(value), where).toBe(true);
      }
    }
  });

  it('leaves the loadout it was given alone', () => {
    const before = createLoadout('ice');
    const after = applyPerk(before, 'ice_power_damage', 1);
    expect(before.spell.damage).toBe(8);
    expect(after.spell.damage).toBe(11);
    expect(after.spellId).toBe('ice');
    expect(after.player).not.toBe(before.player);
  });

  it('adds, multiplies and sets per the effect', () => {
    let fire: LoadoutStats<'fire'> = createLoadout('fire');
    // add: 3 ranks of +4 damage on a base of 12.
    for (let rank = 1; rank <= 3; rank += 1) fire = applyPerk(fire, 'fire_power_damage', rank);
    expect(fire.spell.damage).toBe(24);
    // mul: two -15% ranks compound on a 1.2 s cooldown.
    for (let rank = 1; rank <= 2; rank += 1) fire = applyPerk(fire, 'fire_utility_cooldown', rank);
    expect(fire.spell.cooldown).toBeCloseTo(1.2 * 0.85 * 0.85, 10);
    // set: Big Blast takes the explosion to full damage.
    fire = applyPerk(fire, 'fire_power_big_blast', 1);
    expect(fire.spell.aoeDamageFactor).toBe(1);
  });

  it('applies the generic perks to the player block only', () => {
    let loadout: LoadoutStats<'earth'> = createLoadout('earth');
    for (let rank = 1; rank <= 3; rank += 1) loadout = applyPerk(loadout, 'generic_max_hp', rank);
    loadout = applyPerk(loadout, 'generic_move_speed', 1);
    loadout = applyPerk(loadout, 'generic_pickup_radius', 1);
    expect(loadout.player.maxHp).toBe(160);
    expect(loadout.player.moveSpeed).toBeCloseTo(198, 10);
    expect(loadout.player.pickupRadius).toBe(50);
    expect(loadout.spell).toEqual(BASE_SPELL_STATS.earth);
  });

  it("refuses an unknown perk, another spell's perk and a rank out of range", () => {
    const fire = createLoadout('fire');
    expect(() => applyPerk(fire, 'no_such_perk', 1)).toThrow(/unknown perk/);
    expect(() => applyPerk(fire, 'ice_power_damage', 1)).toThrow(/belongs to ice/);
    expect(() => applyPerk(fire, 'fire_power_damage', 0)).toThrow(RangeError);
    expect(() => applyPerk(fire, 'fire_power_damage', 4)).toThrow(RangeError);
    expect(() => applyPerk(fire, 'fire_power_damage', 1.5)).toThrow(RangeError);
  });

  it('keeps a fully-perked tree at sane values', () => {
    for (const spellId of SPELL_IDS) {
      let loadout: LoadoutStats = createLoadout(spellId);
      for (const perk of PERKS.filter((p) => p.spell === spellId || p.spell === 'generic')) {
        for (let rank = 1; rank <= perk.maxRank; rank += 1) {
          loadout = applyPerk(loadout, perk.id, rank);
        }
      }
      for (const [field, value] of Object.entries(asRecord(loadout.spell))) {
        expect(Number.isFinite(value), `${spellId}.${field}`).toBe(true);
        expect(value, `${spellId}.${field}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('validatePerks', () => {
  const sound: PerkNode = {
    id: 'fire_test_base',
    name: 'Test',
    description: 'test',
    spell: 'fire',
    branch: 'power',
    tier: 1,
    maxRank: 2,
    effect: { field: 'damage', op: 'add', amount: 1 },
  };

  it('passes the shipped trees', () => {
    expect(validatePerks()).toEqual([]);
  });

  it('catches a prereq that does not exist', () => {
    const problems = validatePerks([
      sound,
      { ...sound, id: 'fire_test_tier2', tier: 2, prereq: 'fire_test_missing' },
    ]);
    expect(problems).toEqual(['perk "fire_test_tier2": prereq "fire_test_missing" does not exist']);
  });

  it('catches a prereq in the wrong branch or at the wrong tier', () => {
    expect(
      validatePerks([
        sound,
        { ...sound, id: 'fire_test_reach', branch: 'reach', tier: 2, prereq: 'fire_test_base' },
      ]),
    ).toEqual(['perk "fire_test_reach": prereq "fire_test_base" is in another branch']);

    expect(
      validatePerks([
        sound,
        { ...sound, id: 'fire_test_tier3', tier: 3, prereq: 'fire_test_base' },
      ]),
    ).toEqual(['perk "fire_test_tier3": prereq "fire_test_base" is tier 1, expected 2']);
  });

  it('catches a missing or surplus prereq', () => {
    expect(validatePerks([{ ...sound, tier: 2 }])).toEqual([
      'perk "fire_test_base": tier 2 needs a prereq',
    ]);
    expect(
      validatePerks([
        sound,
        { ...sound, id: 'fire_test_two', branch: 'reach', prereq: 'fire_test_base' },
      ]),
    ).toEqual(['perk "fire_test_two": tier 1 must not have a prereq']);
  });

  it('catches a bad rank, tier, duplicate id, unknown field or unusable amount', () => {
    expect(validatePerks([{ ...sound, maxRank: 0 }])).toContain(
      'perk "fire_test_base": maxRank must be an integer >= 1, got 0',
    );
    expect(validatePerks([{ ...sound, tier: 0 }])).toContain(
      'perk "fire_test_base": tier must be an integer >= 1, got 0',
    );
    expect(validatePerks([sound, sound])).toContain('duplicate perk id "fire_test_base"');
    expect(
      validatePerks([{ ...sound, effect: { field: 'nope' as 'damage', op: 'add', amount: 1 } }]),
    ).toContain('perk "fire_test_base": no stat "nope" on fire');
    expect(
      validatePerks([{ ...sound, effect: { field: 'damage', op: 'mul', amount: 0 } }]),
    ).toContain('perk "fire_test_base": a mul amount must be > 0, got 0');
    expect(
      validatePerks([{ ...sound, effect: { field: 'damage', op: 'add', amount: Number.NaN } }]),
    ).toContain('perk "fire_test_base": amount must be finite, got NaN');
  });

  it('catches two nodes claiming the same tier of a branch', () => {
    expect(validatePerks([sound, { ...sound, id: 'fire_test_twin' }])).toEqual([
      'perk "fire_test_twin": fire/power/1 is already taken by "fire_test_base"',
    ]);
  });

  it('reports an unknown spell instead of throwing on it', () => {
    // A hand-edited config can name a spell that does not exist; boot must log
    // it and carry on (spec §7), not take the Boot scene down with a TypeError.
    const problems = validatePerks([{ ...sound, spell: 'fyre' as 'fire' }]);
    expect(problems).toEqual(['perk "fire_test_base": unknown spell "fyre"']);
  });

  it('lets the generic nodes share tier 1 without a prereq', () => {
    expect(validatePerks(GENERIC_PERKS)).toEqual([]);
  });
});
