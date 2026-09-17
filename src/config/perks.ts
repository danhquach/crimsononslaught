import type { PlayerStats, SpellStatsBySpell } from '../core/spellStats';
import type { SpellId } from './spells';

/**
 * Perk trees (spec §5 "Spells" per-spell lists, "Generic perks").
 *
 * Each spell owns 7 nodes in 3 branches — Power, Reach, Utility — plus the 3
 * generic nodes every run shares. A node is one field change on the run's stats,
 * so `core/spellStats.ts` can apply any of them without knowing what the spell
 * does; the spec fixes which field each node touches, the amounts below are the
 * tuning pass.
 *
 * Tiers run 1..n inside a branch and a node names the tier below it as its
 * prereq, which is what gates an offer (CO-041). `validatePerks` checks the
 * shape at boot.
 *
 * Pure data, no Phaser import.
 */

export type PerkBranch = 'power' | 'reach' | 'utility';

/** One field change, per rank: `add` +amount, `mul` xamount, `set` =amount. */
export interface PerkEffect<F extends string = string> {
  field: F;
  op: 'add' | 'mul' | 'set';
  amount: number;
}

interface PerkBase {
  id: string;
  name: string;
  /** One line, shown on the level-up card. */
  description: string;
  /** 1-based position in its branch; tier N requires tier N-1 of the same branch. */
  tier: number;
  maxRank: number;
  /** The tier below in the same branch; absent on tier 1. */
  prereq?: string;
}

/** A node in one spell's tree; its effect names a field of that spell's stats. */
export interface SpellPerk<S extends SpellId = SpellId> extends PerkBase {
  spell: S;
  branch: PerkBranch;
  effect: PerkEffect<keyof SpellStatsBySpell[S] & string>;
}

/** A node every run can take; its effect names a field of `PlayerStats`. */
export interface GenericPerk extends PerkBase {
  spell: 'generic';
  branch: 'generic';
  effect: PerkEffect<keyof PlayerStats & string>;
}

export type PerkNode = { [S in SpellId]: SpellPerk<S> }[SpellId] | GenericPerk;

/** Spec §5: every "-cooldown" node is the same cut per rank. */
const COOLDOWN_CUT = 0.85;

const FIRE_PERKS: readonly SpellPerk<'fire'>[] = [
  {
    id: 'fire_power_damage',
    name: 'Kindling',
    description: '+4 fireball damage',
    spell: 'fire',
    branch: 'power',
    tier: 1,
    maxRank: 3,
    effect: { field: 'damage', op: 'add', amount: 4 },
  },
  {
    id: 'fire_power_burn',
    name: 'Burn',
    description: 'Hits burn for +3 damage/s over 2 s',
    spell: 'fire',
    branch: 'power',
    tier: 2,
    maxRank: 2,
    prereq: 'fire_power_damage',
    effect: { field: 'burn', op: 'add', amount: 3 },
  },
  {
    id: 'fire_power_big_blast',
    name: 'Big Blast',
    description: 'The explosion deals full damage instead of half',
    spell: 'fire',
    branch: 'power',
    tier: 3,
    maxRank: 1,
    prereq: 'fire_power_burn',
    effect: { field: 'aoeDamageFactor', op: 'set', amount: 1 },
  },
  {
    id: 'fire_reach_blast',
    name: 'Wider Blast',
    description: '+12 explosion radius',
    spell: 'fire',
    branch: 'reach',
    tier: 1,
    maxRank: 3,
    effect: { field: 'aoeRadius', op: 'add', amount: 12 },
  },
  {
    id: 'fire_reach_range',
    name: 'Long Throw',
    description: '+150 projectile range',
    spell: 'fire',
    branch: 'reach',
    tier: 2,
    maxRank: 1,
    prereq: 'fire_reach_blast',
    effect: { field: 'range', op: 'add', amount: 150 },
  },
  {
    id: 'fire_utility_projectiles',
    name: 'Split Shot',
    description: '+1 fireball per volley',
    spell: 'fire',
    branch: 'utility',
    tier: 1,
    maxRank: 2,
    effect: { field: 'projectiles', op: 'add', amount: 1 },
  },
  {
    id: 'fire_utility_cooldown',
    name: 'Quick Cast',
    description: '-15% cooldown',
    spell: 'fire',
    branch: 'utility',
    tier: 2,
    maxRank: 2,
    prereq: 'fire_utility_projectiles',
    effect: { field: 'cooldown', op: 'mul', amount: COOLDOWN_CUT },
  },
];

const ICE_PERKS: readonly SpellPerk<'ice'>[] = [
  {
    id: 'ice_power_damage',
    name: 'Deep Chill',
    description: '+3 nova damage',
    spell: 'ice',
    branch: 'power',
    tier: 1,
    maxRank: 3,
    effect: { field: 'damage', op: 'add', amount: 3 },
  },
  {
    id: 'ice_power_freeze',
    name: 'Flash Freeze',
    description: '+10% chance to freeze an enemy solid for 1 s',
    spell: 'ice',
    branch: 'power',
    tier: 2,
    maxRank: 2,
    prereq: 'ice_power_damage',
    effect: { field: 'freezeChance', op: 'add', amount: 0.1 },
  },
  {
    id: 'ice_power_shatter',
    name: 'Shatter',
    description: '+50% damage against slowed enemies',
    spell: 'ice',
    branch: 'power',
    tier: 3,
    maxRank: 1,
    prereq: 'ice_power_freeze',
    effect: { field: 'shatterBonus', op: 'set', amount: 0.5 },
  },
  {
    id: 'ice_reach_radius',
    name: 'Wide Nova',
    description: '+25 pulse radius',
    spell: 'ice',
    branch: 'reach',
    tier: 1,
    maxRank: 3,
    effect: { field: 'radius', op: 'add', amount: 25 },
  },
  {
    id: 'ice_reach_duration',
    name: 'Lingering Frost',
    description: '+0.5 s slow duration',
    spell: 'ice',
    branch: 'reach',
    tier: 2,
    maxRank: 1,
    prereq: 'ice_reach_radius',
    effect: { field: 'slowDuration', op: 'add', amount: 0.5 },
  },
  {
    id: 'ice_utility_slow',
    name: 'Heavy Frost',
    description: '+10% slow strength',
    spell: 'ice',
    branch: 'utility',
    tier: 1,
    maxRank: 2,
    effect: { field: 'slowPct', op: 'add', amount: 0.1 },
  },
  {
    id: 'ice_utility_cooldown',
    name: 'Quick Pulse',
    description: '-15% cooldown',
    spell: 'ice',
    branch: 'utility',
    tier: 2,
    maxRank: 2,
    prereq: 'ice_utility_slow',
    effect: { field: 'cooldown', op: 'mul', amount: COOLDOWN_CUT },
  },
];

const LIGHTNING_PERKS: readonly SpellPerk<'lightning'>[] = [
  {
    id: 'lightning_power_damage',
    name: 'Overcharge',
    description: '+3 bolt damage',
    spell: 'lightning',
    branch: 'power',
    tier: 1,
    maxRank: 3,
    effect: { field: 'damage', op: 'add', amount: 3 },
  },
  {
    id: 'lightning_power_stun',
    name: 'Concussive Bolt',
    description: '+0.15 s stun on hit',
    spell: 'lightning',
    branch: 'power',
    tier: 2,
    maxRank: 2,
    prereq: 'lightning_power_damage',
    effect: { field: 'stun', op: 'add', amount: 0.15 },
  },
  {
    id: 'lightning_power_no_falloff',
    name: 'Superconductor',
    description: 'Chains deal full damage instead of 80%',
    spell: 'lightning',
    branch: 'power',
    tier: 3,
    maxRank: 1,
    prereq: 'lightning_power_stun',
    effect: { field: 'chainFalloff', op: 'set', amount: 1 },
  },
  {
    id: 'lightning_reach_chains',
    name: 'Arc',
    description: '+1 chain jump',
    spell: 'lightning',
    branch: 'reach',
    tier: 1,
    maxRank: 3,
    effect: { field: 'chains', op: 'add', amount: 1 },
  },
  {
    id: 'lightning_reach_range',
    name: 'Conductive',
    description: '+40 chain range',
    spell: 'lightning',
    branch: 'reach',
    tier: 2,
    maxRank: 1,
    prereq: 'lightning_reach_chains',
    effect: { field: 'chainRange', op: 'add', amount: 40 },
  },
  {
    id: 'lightning_utility_strikes',
    name: 'Forked',
    description: '+1 bolt per cast',
    spell: 'lightning',
    branch: 'utility',
    tier: 1,
    maxRank: 2,
    effect: { field: 'strikes', op: 'add', amount: 1 },
  },
  {
    id: 'lightning_utility_cooldown',
    name: 'Static Build',
    description: '-15% cooldown',
    spell: 'lightning',
    branch: 'utility',
    tier: 2,
    maxRank: 2,
    prereq: 'lightning_utility_strikes',
    effect: { field: 'cooldown', op: 'mul', amount: COOLDOWN_CUT },
  },
];

const EARTH_PERKS: readonly SpellPerk<'earth'>[] = [
  {
    id: 'earth_power_damage',
    name: 'Heavy Stone',
    description: '+3 boulder damage',
    spell: 'earth',
    branch: 'power',
    tier: 1,
    maxRank: 3,
    effect: { field: 'damage', op: 'add', amount: 3 },
  },
  {
    id: 'earth_power_knockback',
    name: 'Impact',
    description: '+25 knockback',
    spell: 'earth',
    branch: 'power',
    tier: 2,
    maxRank: 2,
    prereq: 'earth_power_damage',
    effect: { field: 'knockback', op: 'add', amount: 25 },
  },
  {
    id: 'earth_power_crush',
    name: 'Crush',
    description: 'Double damage against Tanks',
    spell: 'earth',
    branch: 'power',
    tier: 3,
    maxRank: 1,
    prereq: 'earth_power_knockback',
    effect: { field: 'crushMultiplier', op: 'set', amount: 2 },
  },
  {
    id: 'earth_reach_orbit',
    name: 'Wide Orbit',
    description: '+20 orbit radius',
    spell: 'earth',
    branch: 'reach',
    tier: 1,
    maxRank: 3,
    effect: { field: 'orbitRadius', op: 'add', amount: 20 },
  },
  {
    id: 'earth_reach_size',
    name: 'Boulder Growth',
    description: '+6 boulder size',
    spell: 'earth',
    branch: 'reach',
    tier: 2,
    maxRank: 1,
    prereq: 'earth_reach_orbit',
    effect: { field: 'size', op: 'add', amount: 6 },
  },
  {
    id: 'earth_utility_count',
    name: 'Extra Boulder',
    description: '+1 orbiting boulder',
    spell: 'earth',
    branch: 'utility',
    tier: 1,
    maxRank: 2,
    effect: { field: 'count', op: 'add', amount: 1 },
  },
  {
    id: 'earth_utility_speed',
    name: 'Fast Orbit',
    description: '+0.4 rad/s orbit speed',
    spell: 'earth',
    branch: 'utility',
    tier: 2,
    maxRank: 2,
    prereq: 'earth_utility_count',
    effect: { field: 'orbitSpeed', op: 'add', amount: 0.4 },
  },
];

/** Spec §5 "Generic perks": offered in every run, whatever the spell. */
export const GENERIC_PERKS: readonly GenericPerk[] = [
  {
    id: 'generic_move_speed',
    name: 'Swift',
    description: '+10% move speed',
    spell: 'generic',
    branch: 'generic',
    tier: 1,
    maxRank: 3,
    effect: { field: 'moveSpeed', op: 'mul', amount: 1.1 },
  },
  {
    id: 'generic_max_hp',
    name: 'Vitality',
    description: '+20 max HP',
    spell: 'generic',
    branch: 'generic',
    tier: 1,
    maxRank: 3,
    effect: { field: 'maxHp', op: 'add', amount: 20 },
  },
  {
    id: 'generic_pickup_radius',
    name: 'Magnet',
    description: '+25% pickup radius',
    spell: 'generic',
    branch: 'generic',
    tier: 1,
    maxRank: 2,
    effect: { field: 'pickupRadius', op: 'mul', amount: 1.25 },
  },
];

/** Every node in the game, spell trees first. */
export const PERKS: readonly PerkNode[] = [
  ...FIRE_PERKS,
  ...ICE_PERKS,
  ...LIGHTNING_PERKS,
  ...EARTH_PERKS,
  ...GENERIC_PERKS,
];

const PERKS_BY_ID: ReadonlyMap<string, PerkNode> = new Map(PERKS.map((perk) => [perk.id, perk]));

export function perkById(id: string): PerkNode | undefined {
  return PERKS_BY_ID.get(id);
}

/** The tree a run draws from: the chosen spell's nodes plus the generic ones. */
export function perksForSpell(spellId: SpellId): readonly PerkNode[] {
  return PERKS.filter((perk) => perk.spell === spellId || perk.spell === 'generic');
}
