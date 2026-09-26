import { EMPTY_OFFER_MAX_HP_BONUS } from '../config/progression';

/**
 * Level-up overlay contract (Phase 2 spec §7).
 *
 * `levelUpOffer()` (CO-110) turns the run's loadout into `OfferCard`s — the
 * display slice the overlay needs — and Game decides via `resolveLevelUp`
 * whether to pause and show them or to apply the silent fallback. The pick
 * travels back to Game as a `LEVEL_UP_EVENT.pick` on the Game scene's emitter.
 *
 * A card is either an **active** (a spell for an open slot) or a **passive** (a
 * rank of a global passive); one offer never mixes the two (spec §7.1). A
 * relic's offer (#227, `core/relicOffer.ts`) uses the same overlay with
 * **relic** cards, a rank of a relic buff.
 *
 * Pure TS, no Phaser import.
 */

/**
 * What one card shows. `rank` / `maxRank` are passives and relics only: `rank`
 * is the rank the pick grants, `maxRank` the cap it counts towards — absent on
 * a passive that never caps, and on every active and relic. `color` is actives
 * only: the spell's own colour, for its card's accent and its icon's fallback
 * disc (CO-155).
 */
export interface OfferCard {
  kind: 'active' | 'passive' | 'relic';
  id: string;
  name: string;
  description: string;
  rank?: number;
  maxRank?: number;
  color?: number;
}

/** Spec §7.1: offer 3 cards; fewer if fewer are eligible. */
export const MAX_OFFER_SIZE = 3;

export type LevelUpResolution =
  { kind: 'overlay'; cards: readonly OfferCard[] } | { kind: 'fallback'; maxHpBonus: number };

/**
 * Decide what a level-up does with the eligible offer. Never more than 3 cards:
 * the first `MAX_OFFER_SIZE` are kept, so callers pass an already-randomised
 * offer (`levelUpOffer` draws with the run's seeded RNG).
 */
export function resolveLevelUp(offer: readonly OfferCard[]): LevelUpResolution {
  if (offer.length === 0) return { kind: 'fallback', maxHpBonus: EMPTY_OFFER_MAX_HP_BONUS };
  return { kind: 'overlay', cards: offer.slice(0, MAX_OFFER_SIZE) };
}

/** Keyboard shortcut: `'1'`–`'3'` (KeyboardEvent.key) pick the card in that slot, if it exists. */
export function offerIndexForKey(key: string, cardCount: number): number | undefined {
  if (!/^[1-3]$/.test(key)) return undefined;
  const index = Number(key) - 1;
  return index < cardCount ? index : undefined;
}

/** Emitter event names for the overlay -> Game direction, namespaced like `run:*`. */
export const LEVEL_UP_EVENT = {
  pick: 'levelup:pick',
} as const;

export interface LevelUpPickPayload {
  offerId: string;
}

const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isRgb = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffff;

export function isOfferCard(data: unknown): data is OfferCard {
  if (typeof data !== 'object' || data === null) return false;
  const c = data as Record<string, unknown>;
  if (c.kind !== 'active' && c.kind !== 'passive' && c.kind !== 'relic') return false;
  if (!isNonEmptyString(c.id) || !isNonEmptyString(c.name) || !isNonEmptyString(c.description)) {
    return false;
  }
  // Only an active has a colour of its own, and it is optional.
  if (c.color !== undefined && (c.kind !== 'active' || !isRgb(c.color))) return false;
  // An active carries no rank at all; a passive always ranks, and caps only
  // when its config does; a relic always ranks and never caps.
  if (c.kind === 'active') return c.rank === undefined && c.maxRank === undefined;
  if (!isPositiveInt(c.rank)) return false;
  if (c.kind === 'relic') return c.maxRank === undefined;
  return c.maxRank === undefined || (isPositiveInt(c.maxRank) && c.rank <= c.maxRank);
}
