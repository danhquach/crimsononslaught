import type { Passive } from './passives';

/**
 * Relic buffs (#227): what touching a relic offers. The player picks one of
 * three, and it lasts the rest of the run.
 *
 * A buff is exactly a passive's shape, so `resolveProfile` stacks its ranks
 * with the passives' and the permanent upgrades' under the same rules and the
 * same clamps. No buff caps its own rank: a buff drops out of the offer only
 * once its field is at its `PROFILE_CLAMPS` bound (`core/relicOffer.ts`).
 *
 * Each buff is about 1.5x one passive rank. `weight` is the card's share of the
 * draw; it lives on the card, not in the draw, so a later card (#228's rerolls
 * and bans) can be drawn at a different rate. #210 owns the measured tuning.
 *
 * Pure data, no Phaser import.
 */

export interface RelicBuff extends Passive {
  /** Relative chance to be drawn; 1 is a buff's. */
  weight: number;
}

const RELIC_BUFF_LIST = [
  {
    id: 'relic_ancient_fury',
    name: 'Ancient Fury',
    description: 'Every spell deals 15% more damage.',
    field: 'damageMul',
    op: 'mul',
    amount: 1.15,
    weight: 1,
  },
  {
    id: 'relic_hourglass',
    name: 'Hourglass',
    description: 'Every spell cools down 10% faster.',
    field: 'cooldownMul',
    op: 'mul',
    amount: 0.9,
    weight: 1,
  },
  {
    id: 'relic_colossus',
    name: 'Colossus',
    description: 'Radii, reach and bodies grow 15%.',
    field: 'areaMul',
    op: 'mul',
    amount: 1.15,
    weight: 1,
  },
  {
    id: 'relic_tailwind',
    name: 'Tailwind',
    description: 'Projectiles and orbits move 15% faster.',
    field: 'projectileSpeedMul',
    op: 'mul',
    amount: 1.15,
    weight: 1,
  },
  {
    id: 'relic_everfrost',
    name: 'Everfrost',
    description: 'Effects and statuses last 20% longer.',
    field: 'durationMul',
    op: 'mul',
    amount: 1.2,
    weight: 1,
  },
  {
    id: 'relic_hawk_eye',
    name: 'Hawk Eye',
    description: '+7% chance to crit.',
    field: 'critChance',
    op: 'add',
    amount: 0.07,
    weight: 1,
  },
  {
    id: 'relic_executioner',
    name: 'Executioner',
    description: 'Crits hit for another 35% of the damage.',
    field: 'critMultiplier',
    op: 'add',
    amount: 0.35,
    weight: 1,
  },
  {
    id: 'relic_bulwark',
    name: 'Bulwark',
    description: 'Take 6% less damage.',
    field: 'damageReduction',
    op: 'add',
    amount: 0.06,
    weight: 1,
  },
  {
    id: 'relic_windstep',
    name: 'Windstep',
    description: 'Move 10% faster.',
    field: 'moveSpeed',
    op: 'mul',
    amount: 1.1,
    weight: 1,
  },
  {
    id: 'relic_bloodstone',
    name: 'Bloodstone',
    description: '+30 max HP, and heals for the same.',
    field: 'maxHp',
    op: 'add',
    amount: 30,
    weight: 1,
  },
  {
    id: 'relic_wellspring',
    name: 'Wellspring',
    description: 'Recover 0.75 HP per second.',
    field: 'hpRegen',
    op: 'add',
    amount: 0.75,
    weight: 1,
  },
  {
    id: 'relic_lodestone',
    name: 'Lodestone',
    description: 'Gems are drawn in from 35% further.',
    field: 'pickupRadius',
    op: 'mul',
    amount: 1.35,
    weight: 1,
  },
  {
    id: 'relic_sages_tome',
    name: "Sage's Tome",
    description: 'Gain 15% more XP.',
    field: 'xpGain',
    op: 'mul',
    amount: 1.15,
    weight: 1,
  },
] as const satisfies readonly RelicBuff[];

/** The id of every relic buff in the list above. */
export type RelicBuffId = (typeof RELIC_BUFF_LIST)[number]['id'];

export const RELIC_BUFFS: readonly RelicBuff[] = RELIC_BUFF_LIST;

export function relicBuffById(id: string): RelicBuff | undefined {
  return RELIC_BUFFS.find((buff) => buff.id === id);
}

/** Narrows a card id or an event payload to a relic buff this build knows. */
export function isRelicBuffId(value: unknown): value is RelicBuffId {
  return typeof value === 'string' && RELIC_BUFFS.some((buff) => buff.id === value);
}
