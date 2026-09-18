import { PICKUP_RADIUS } from './gems';
import { PLAYER_MAX_HP, PLAYER_SPEED } from './player';

/**
 * The player profile a run accumulates and the thirteen passives that change
 * it (Phase 2 spec §4, §5).
 *
 * A passive is one `{field, op, amount}` change, applied once per rank. It
 * never grants a behaviour a spell does not already have — how a profile
 * multiplier reaches a spell's stat block is the category map in
 * `config/spellFields.ts`, and the resolution rules live in
 * `core/playerProfile.ts`.
 *
 * Numbers here are the spec's starting point; #147 owns the measured pass.
 *
 * Pure data, no Phaser import.
 */

/**
 * Spec §4.1. Replaces Phase 1's `PlayerStats`: the only thing a passive can
 * change, and the only input `resolveSpellStats` reads.
 */
export interface PlayerProfile {
  /** px/s, before diagonal normalisation. */
  moveSpeed: number;
  maxHp: number;
  /** HP per second, healed continuously. */
  hpRegen: number;
  /** Gem pickup radius in px. */
  pickupRadius: number;
  /** Multiplier on XP collected. */
  xpGain: number;
  /** Multiplier on every damage field a spell deals. */
  damageMul: number;
  /** Multiplier on every cooldown field; below 1 is faster. */
  cooldownMul: number;
  /** Multiplier on radii, reach and body sizes. */
  areaMul: number;
  /** Multiplier on travel and orbit speeds. */
  projectileSpeedMul: number;
  /** Multiplier on effect and status durations. */
  durationMul: number;
  /** Chance per damage instance to crit, 0-1. */
  critChance: number;
  /** Damage multiplier on a crit. */
  critMultiplier: number;
  /** Fraction of incoming player damage removed, 0-1. */
  damageReduction: number;
}

export type ProfileField = keyof PlayerProfile;

/**
 * Spec §4.1 base column. The three fields an entity also reads are taken from
 * the system that owns them, so a passive and the thing it buffs can never
 * drift apart.
 */
export const BASE_PLAYER_PROFILE: Readonly<PlayerProfile> = {
  moveSpeed: PLAYER_SPEED,
  maxHp: PLAYER_MAX_HP,
  hpRegen: 0,
  pickupRadius: PICKUP_RADIUS,
  xpGain: 1,
  damageMul: 1,
  cooldownMul: 1,
  areaMul: 1,
  projectileSpeedMul: 1,
  durationMul: 1,
  critChance: 0,
  critMultiplier: 1.5,
  damageReduction: 0,
};

/**
 * Spec §4.3. Applied after the adds and muls, so no stack of passives can take
 * a field past the point where it breaks the game. Every field also has an
 * implicit floor of 0 (`PROFILE_FLOOR`) — a negative stat is a config bug.
 */
export const PROFILE_FLOOR = 0;

export const PROFILE_CLAMPS: Readonly<
  Partial<Record<ProfileField, Readonly<{ min?: number; max?: number }>>>
> = {
  /** A cast loop below a third of its base outruns the FX and the live-projectile cap. */
  cooldownMul: { min: 0.35 },
  /** Leaves a visible non-crit case; crits are feedback as much as damage. */
  critChance: { max: 0.75 },
  /** The player must still be killable at any stack. */
  damageReduction: { max: 0.6 },
  /** Above this the player outruns the camera's follow lerp. */
  moveSpeed: { max: 320 },
};

/**
 * One rank of a passive: `add` sums with the other adds on its field, `mul`
 * multiplies with the other muls (spec §4.2). `maxRank` absent means the
 * passive stacks without limit.
 */
export interface Passive {
  id: string;
  name: string;
  /** One line, for the level-up card. */
  description: string;
  field: ProfileField;
  op: 'add' | 'mul';
  amount: number;
  maxRank?: number;
}

/**
 * Spec §5. Four passives never cap — Power, Haste, Expanse and Persistence —
 * because they scale a build the player already has rather than open a new
 * behaviour. Everything that changes how survivable or how lucky the player is
 * caps.
 */
const PASSIVE_LIST = [
  {
    id: 'passive_power',
    name: 'Power',
    description: 'Every spell deals 10% more damage.',
    field: 'damageMul',
    op: 'mul',
    amount: 1.1,
  },
  {
    id: 'passive_haste',
    name: 'Haste',
    description: 'Every spell cools down 8% faster.',
    field: 'cooldownMul',
    op: 'mul',
    amount: 0.92,
  },
  {
    id: 'passive_expanse',
    name: 'Expanse',
    description: 'Radii, reach and bodies grow 12%.',
    field: 'areaMul',
    op: 'mul',
    amount: 1.12,
  },
  {
    id: 'passive_velocity',
    name: 'Velocity',
    description: 'Projectiles and orbits move 10% faster.',
    field: 'projectileSpeedMul',
    op: 'mul',
    amount: 1.1,
    maxRank: 5,
  },
  {
    id: 'passive_persistence',
    name: 'Persistence',
    description: 'Effects and statuses last 15% longer.',
    field: 'durationMul',
    op: 'mul',
    amount: 1.15,
  },
  {
    id: 'passive_precision',
    name: 'Precision',
    description: '+5% chance to crit.',
    field: 'critChance',
    op: 'add',
    amount: 0.05,
    maxRank: 10,
  },
  {
    id: 'passive_savagery',
    name: 'Savagery',
    description: 'Crits hit for another 25% of the damage.',
    field: 'critMultiplier',
    op: 'add',
    amount: 0.25,
    maxRank: 6,
  },
  {
    id: 'passive_ward',
    name: 'Ward',
    description: 'Take 4% less damage.',
    field: 'damageReduction',
    op: 'add',
    amount: 0.04,
    maxRank: 8,
  },
  {
    id: 'passive_swift',
    name: 'Swift',
    description: 'Move 8% faster.',
    field: 'moveSpeed',
    op: 'mul',
    amount: 1.08,
    maxRank: 5,
  },
  {
    id: 'passive_vitality',
    name: 'Vitality',
    description: '+20 max HP, and heals for the same.',
    field: 'maxHp',
    op: 'add',
    amount: 20,
    maxRank: 8,
  },
  {
    id: 'passive_regeneration',
    name: 'Regeneration',
    description: 'Recover 0.5 HP per second.',
    field: 'hpRegen',
    op: 'add',
    amount: 0.5,
    maxRank: 6,
  },
  {
    id: 'passive_magnet',
    name: 'Magnet',
    description: 'Gems are drawn in from 25% further.',
    field: 'pickupRadius',
    op: 'mul',
    amount: 1.25,
    maxRank: 3,
  },
  {
    id: 'passive_avarice',
    name: 'Avarice',
    description: 'Gain 12% more XP.',
    field: 'xpGain',
    op: 'mul',
    amount: 1.12,
    maxRank: 5,
  },
] as const satisfies readonly Passive[];

/** The id of every passive in the list above. */
export type PassiveId = (typeof PASSIVE_LIST)[number]['id'];

export const PASSIVES: readonly Passive[] = PASSIVE_LIST;

export function passiveById(id: string): Passive | undefined {
  return PASSIVES.find((passive) => passive.id === id);
}

/** Narrows a card id or an event payload to a passive this build knows. */
export function isPassiveId(value: unknown): value is PassiveId {
  return typeof value === 'string' && PASSIVES.some((passive) => passive.id === value);
}
