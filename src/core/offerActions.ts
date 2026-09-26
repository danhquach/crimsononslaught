import {
  SKIP_REROLL_BONUS,
  START_BANS,
  START_REROLLS,
  type ChargeCard,
} from '../config/offerActions';

/**
 * A run's Reroll, Skip and Ban state (#228): what is left of each and which
 * cards are banned. Immutable, like `Loadout`: every step returns a new value,
 * and a step the run cannot afford returns `undefined` so Game can drop it.
 *
 * Game makes a fresh one per run, so bans and unused counts never outlive it.
 *
 * Pure TS, no Phaser import.
 */

export interface OfferActions {
  readonly rerolls: number;
  readonly bans: number;
  /** Card ids never offered again this run. */
  readonly banned: ReadonlySet<string>;
}

/** The counts the overlay's buttons show. */
export interface OfferActionCounts {
  rerolls: number;
  bans: number;
}

export function startingActions(): OfferActions {
  return { rerolls: START_REROLLS, bans: START_BANS, banned: new Set() };
}

export function spendReroll(actions: OfferActions): OfferActions | undefined {
  return actions.rerolls > 0 ? { ...actions, rerolls: actions.rerolls - 1 } : undefined;
}

/** Skip is free and pays a reroll. */
export function skipOffer(actions: OfferActions): OfferActions {
  return { ...actions, rerolls: actions.rerolls + SKIP_REROLL_BONUS };
}

export function spendBan(actions: OfferActions, cardId: string): OfferActions | undefined {
  if (actions.bans <= 0 || actions.banned.has(cardId)) return undefined;
  return { ...actions, bans: actions.bans - 1, banned: new Set([...actions.banned, cardId]) };
}

export function grantCharge(actions: OfferActions, charge: ChargeCard): OfferActions {
  return { ...actions, [charge.resource]: actions[charge.resource] + charge.amount };
}

export function countsOf(actions: OfferActions): OfferActionCounts {
  return { rerolls: actions.rerolls, bans: actions.bans };
}
