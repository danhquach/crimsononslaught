/**
 * Reroll, Skip and Ban on the level-up offer (#228), and the charge cards that
 * grant more of them.
 *
 * A run starts with `START_REROLLS` rerolls and `START_BANS` bans; Skip is
 * free and pays `SKIP_REROLL_BONUS` rerolls. Nothing carries over between runs.
 *
 * A charge card is taken again and again and never caps. The level-up pair
 * joins the passive pool once any passive is at its `maxRank`
 * (`core/levelUpOffer.ts`); the relic pair is always in the relic pool, drawn
 * at `weight` against a buff's 1 (`core/relicOffer.ts`).
 *
 * Pure data, no Phaser import.
 */

export const START_REROLLS = 3;
export const START_BANS = 1;
export const SKIP_REROLL_BONUS = 1;

/** What a charge card adds to: the run's rerolls or its bans. */
export type ChargeResource = 'rerolls' | 'bans';

export interface ChargeCard {
  id: string;
  name: string;
  description: string;
  resource: ChargeResource;
  amount: number;
  /** Relative chance to be drawn in a relic offer; 1 is a buff's. Level-up cards draw like passives. */
  weight: number;
}

/** In the passive pool once a passive caps. */
export const LEVEL_UP_CHARGES: readonly ChargeCard[] = [
  {
    id: 'charge_levelup_reroll',
    name: '+1 Reroll',
    description: 'One more reroll of a level-up offer this run.',
    resource: 'rerolls',
    amount: 1,
    weight: 1,
  },
  {
    id: 'charge_levelup_ban',
    name: '+1 Ban',
    description: 'One more ban of a level-up card this run.',
    resource: 'bans',
    amount: 1,
    weight: 1,
  },
];

/** Always in the relic pool, rarer than a buff. */
export const RELIC_CHARGES: readonly ChargeCard[] = [
  {
    id: 'charge_relic_rerolls',
    name: '+2 Rerolls',
    description: 'Two more rerolls of a level-up offer this run.',
    resource: 'rerolls',
    amount: 2,
    weight: 0.4,
  },
  {
    id: 'charge_relic_ban',
    name: '+1 Ban',
    description: 'One more ban of a level-up card this run.',
    resource: 'bans',
    amount: 1,
    weight: 0.4,
  },
];

export function chargeById(id: string): ChargeCard | undefined {
  return [...LEVEL_UP_CHARGES, ...RELIC_CHARGES].find((charge) => charge.id === id);
}
