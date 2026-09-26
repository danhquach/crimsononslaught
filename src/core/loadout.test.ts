import { describe, expect, it } from 'vitest';
import { SLOT_UNLOCK_LEVELS, SPELLS_BY_ELEMENT, type RosterSpellId } from '../config/loadout';
import { BASE_PLAYER_PROFILE, PROFILE_CLAMPS, type PassiveId } from '../config/passives';
import type { RelicBuffId } from '../config/relics';
import {
  buildLoadout,
  canEquip,
  canTakePassive,
  equip,
  equippableSpells,
  equipped,
  isFull,
  openSlots,
  passiveRank,
  profileOf,
  takePassive,
  takeRelic,
  unlockedSlots,
  validateLoadoutConfig,
  type Loadout,
} from './loadout';

const [SLOT_2_LEVEL, SLOT_3_LEVEL] = SLOT_UNLOCK_LEVELS;

const DEFAULTS = { fire: 'fire', ice: 'ice', lightning: 'lightning', earth: 'earth' } as const;

/** Equips `spellId` at `level`, failing the test if the loadout refuses it. */
function equipOrThrow(loadout: Loadout, spellId: RosterSpellId, level: number): Loadout {
  const result = equip(loadout, spellId, level);
  if (!result.ok) throw new Error(`unexpected rejection: ${result.reason}`);
  return result.loadout;
}

describe('buildLoadout', () => {
  it('starts with the element default equipped and both slots empty', () => {
    const loadout = buildLoadout('ice');
    expect(loadout.element).toBe('ice');
    expect(loadout.defaultSpell).toBe('ice');
    expect(loadout.slots).toEqual([null, null]);
    expect(equipped(loadout)).toEqual(['ice']);
    expect(isFull(loadout)).toBe(false);
    expect(loadout.passives.size).toBe(0);
    expect(profileOf(loadout)).toEqual(BASE_PLAYER_PROFILE);
  });

  it('offers the element four non-default spells and nothing else', () => {
    expect(equippableSpells(buildLoadout('fire'))).toEqual([
      'fire_meteor',
      'fire_column',
      'fire_companion',
      'fire_dragon',
    ]);
  });
});

describe('slot unlocks', () => {
  it('opens a slot exactly at its threshold, never below it (spec §3.1)', () => {
    const loadout = buildLoadout('fire');
    expect(unlockedSlots(SLOT_2_LEVEL - 1)).toBe(0);
    expect(unlockedSlots(SLOT_2_LEVEL)).toBe(1);
    expect(unlockedSlots(SLOT_3_LEVEL - 1)).toBe(1);
    expect(unlockedSlots(SLOT_3_LEVEL)).toBe(2);
    expect(unlockedSlots(SLOT_3_LEVEL + 5)).toBe(2);

    expect(openSlots(loadout, SLOT_2_LEVEL - 1)).toBe(0);
    expect(openSlots(loadout, SLOT_2_LEVEL)).toBe(1);
    expect(openSlots(loadout, SLOT_3_LEVEL)).toBe(2);
  });

  it('counts a filled slot as no longer open', () => {
    const filled = equipOrThrow(buildLoadout('fire'), 'fire_meteor', SLOT_2_LEVEL);
    expect(openSlots(filled, SLOT_2_LEVEL)).toBe(0);
    expect(openSlots(filled, SLOT_3_LEVEL)).toBe(1);
    expect(isFull(filled)).toBe(false);
  });
});

describe('equip', () => {
  it('fills the slots in order and reports what is equipped', () => {
    let loadout = buildLoadout('fire');
    loadout = equipOrThrow(loadout, 'fire_dragon', SLOT_2_LEVEL);
    expect(loadout.slots).toEqual(['fire_dragon', null]);
    loadout = equipOrThrow(loadout, 'fire_column', SLOT_3_LEVEL);
    expect(loadout.slots).toEqual(['fire_dragon', 'fire_column']);
    expect(equipped(loadout)).toEqual(['fire', 'fire_dragon', 'fire_column']);
    expect(isFull(loadout)).toBe(true);
    expect(equippableSpells(loadout)).toEqual(['fire_meteor', 'fire_companion']);
  });

  it('leaves the loadout it was given untouched', () => {
    const before = buildLoadout('fire');
    const after = equipOrThrow(before, 'fire_meteor', SLOT_2_LEVEL);
    expect(before.slots).toEqual([null, null]);
    expect(after).not.toBe(before);
  });

  it('rejects a spell the run cannot take, with the reason why', () => {
    const fresh = buildLoadout('fire');
    expect(canEquip(fresh, 'fire_meteor', SLOT_2_LEVEL - 1)).toBe('slot-locked');
    expect(canEquip(fresh, 'ice_blizzard', SLOT_2_LEVEL)).toBe('wrong-element');
    expect(canEquip(fresh, 'fire_nope', SLOT_2_LEVEL)).toBe('unknown-spell');
    expect(canEquip(fresh, 'fire', SLOT_2_LEVEL)).toBe('already-equipped');
    expect(canEquip(fresh, 'fire_meteor', SLOT_2_LEVEL)).toBeUndefined();

    const full = equipOrThrow(
      equipOrThrow(fresh, 'fire_meteor', SLOT_2_LEVEL),
      'fire_column',
      SLOT_3_LEVEL,
    );
    expect(canEquip(full, 'fire_dragon', SLOT_3_LEVEL + 10)).toBe('full');
    expect(canEquip(full, 'fire_meteor', SLOT_3_LEVEL)).toBe('already-equipped');
  });

  it('returns the rejection rather than a loadout, so a filled slot cannot change', () => {
    const one = equipOrThrow(buildLoadout('earth'), 'earth_boulder', SLOT_2_LEVEL);
    const refused = equip(one, 'earth_quake', SLOT_2_LEVEL);
    expect(refused).toEqual({ ok: false, reason: 'slot-locked' });
    expect(one.slots).toEqual(['earth_boulder', null]);
  });
});

describe('passives', () => {
  it('stacks ranks and resolves them into the profile', () => {
    let loadout = buildLoadout('ice');
    loadout = takePassive(loadout, 'passive_vitality');
    loadout = takePassive(loadout, 'passive_vitality');
    loadout = takePassive(loadout, 'passive_power');
    expect(passiveRank(loadout, 'passive_vitality')).toBe(2);
    expect(passiveRank(loadout, 'passive_power')).toBe(1);
    expect(passiveRank(loadout, 'passive_magnet')).toBe(0);
    expect(profileOf(loadout).maxHp).toBe(140);
    expect(profileOf(loadout).damageMul).toBeCloseTo(1.1, 10);
  });

  it('is uncapped in count: an active-full loadout still takes passives', () => {
    let loadout = equipOrThrow(
      equipOrThrow(buildLoadout('fire'), 'fire_meteor', SLOT_2_LEVEL),
      'fire_column',
      SLOT_3_LEVEL,
    );
    for (let i = 0; i < 30; i++) loadout = takePassive(loadout, 'passive_power');
    expect(isFull(loadout)).toBe(true);
    expect(passiveRank(loadout, 'passive_power')).toBe(30);
  });

  it('stops a capped passive at its maxRank', () => {
    let loadout = buildLoadout('fire');
    for (let i = 0; i < 3; i++) {
      expect(canTakePassive(loadout, 'passive_magnet')).toBe(true);
      loadout = takePassive(loadout, 'passive_magnet');
    }
    expect(canTakePassive(loadout, 'passive_magnet')).toBe(false);
    expect(() => takePassive(loadout, 'passive_magnet')).toThrow(RangeError);
    expect(canTakePassive(loadout, 'passive_power')).toBe(true);
  });

  it('refuses an unknown passive id', () => {
    const loadout = buildLoadout('fire');
    // Only reachable past the type — a saved run or a stale card id.
    const unknown = 'nope' as PassiveId;
    expect(canTakePassive(loadout, unknown)).toBe(false);
    expect(() => takePassive(loadout, unknown)).toThrow(/unknown passive/);
  });

  it('leaves the loadout it was given untouched', () => {
    const before = buildLoadout('fire');
    const after = takePassive(before, 'passive_power');
    expect(before.passives.size).toBe(0);
    expect(after.passives.size).toBe(1);
  });
});

describe('relics (#227)', () => {
  it('stacks ranks, multiplying percentages and adding flat amounts', () => {
    let loadout = buildLoadout('fire');
    for (let i = 0; i < 3; i++) loadout = takeRelic(loadout, 'relic_ancient_fury');
    loadout = takeRelic(loadout, 'relic_bloodstone');
    loadout = takeRelic(loadout, 'relic_bloodstone');
    expect(loadout.relics.get('relic_ancient_fury')).toBe(3);
    const profile = profileOf(loadout);
    expect(profile.damageMul).toBeCloseTo(1.15 ** 3, 10);
    expect(profile.maxHp).toBe(BASE_PLAYER_PROFILE.maxHp + 60);
  });

  it('stacks with passives and permanent upgrades on the same field', () => {
    let loadout = buildLoadout('fire', new Map([['upgrade_might', 2]]));
    loadout = takePassive(loadout, 'passive_power');
    loadout = takeRelic(loadout, 'relic_ancient_fury');
    expect(profileOf(loadout).damageMul).toBeCloseTo(1.05 ** 2 * 1.1 * 1.15, 10);
  });

  it('holds the clamps on the total', () => {
    let loadout = buildLoadout('fire');
    for (let i = 0; i < 8; i++) {
      loadout = takePassive(loadout, 'passive_ward');
      loadout = takeRelic(loadout, 'relic_bulwark');
      loadout = takeRelic(loadout, 'relic_hawk_eye');
      loadout = takeRelic(loadout, 'relic_windstep');
    }
    for (let i = 0; i < 15; i++) loadout = takeRelic(loadout, 'relic_hourglass');
    const profile = profileOf(loadout);
    expect(profile.damageReduction).toBe(PROFILE_CLAMPS.damageReduction?.max);
    expect(profile.moveSpeed).toBe(PROFILE_CLAMPS.moveSpeed?.max);
    expect(profile.cooldownMul).toBe(PROFILE_CLAMPS.cooldownMul?.min);
    // 8 x 7 % is 56 %, still under the 75 % cap.
    expect(profile.critChance).toBeCloseTo(0.56, 10);
  });

  it('leaves the passives, and the loadout it was given, untouched', () => {
    const before = buildLoadout('fire');
    const after = takeRelic(before, 'relic_windstep');
    expect(before.relics.size).toBe(0);
    expect(after.relics.size).toBe(1);
    expect(after.passives.size).toBe(0);
  });

  it('refuses an unknown relic buff id', () => {
    expect(() => takeRelic(buildLoadout('fire'), 'nope' as RelicBuffId)).toThrow(/unknown relic/);
  });
});

describe('validateLoadoutConfig', () => {
  it('passes on the shipped config', () => {
    expect(validateLoadoutConfig()).toEqual([]);
  });

  it('reports a roster the default spell does not lead', () => {
    expect(validateLoadoutConfig({ defaults: { ...DEFAULTS, fire: 'fire_meteor' } })).toEqual([
      'element "fire": default spell "fire_meteor" must lead its roster, got "fire"',
    ]);
  });

  it('reports a spell two elements both claim', () => {
    expect(
      validateLoadoutConfig({
        rosters: { ...SPELLS_BY_ELEMENT, ice: ['ice', 'fire_meteor'] },
      }),
    ).toEqual(['spell "fire_meteor" is in both "fire" and "ice"']);
  });

  it('reports slot unlock levels that do not ascend', () => {
    expect(validateLoadoutConfig({ unlockLevels: [7, 3] })).toEqual([
      'slot 2 unlocks at 3, not above 7',
    ]);
    expect(validateLoadoutConfig({ unlockLevels: [0, 7] })).toEqual([
      'slot 1 unlock level must be an integer >= 1, got 0',
    ]);
  });
});
