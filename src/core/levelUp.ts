import { isRosterSpellId, type RosterSpellId } from '../config/loadout';
import { EMPTY_OFFER_MAX_HP_BONUS } from '../config/progression';
import { MAX_SPELL_LEVEL } from '../config/spellLevels';

/**
 * Level-up overlay contract (Phase 2 spec §7).
 *
 * `levelUpOffer()` (CO-110) turns the run's loadout into `OfferCard`s — the
 * display slice the overlay needs — and Game decides via `resolveLevelUp`
 * whether to pause and show them or to apply the silent fallback. The pick
 * travels back to Game as a `LEVEL_UP_EVENT.pick` on the Game scene's emitter.
 *
 * A card is an **active** (a spell for an open slot), a **passive** (a rank of a
 * global passive) or, since #326, an **upgrade** (the next level of a spell the
 * run casts). An offer for an open slot is all actives; every other offer draws
 * passives and upgrades from one pool (spec §7.1). A relic's offer (#227,
 * `core/relicOffer.ts`) uses the same overlay with **relic** cards, a rank of a
 * relic buff. A **charge** card (#228) adds to the run's rerolls or bans; it can
 * turn up in the passive pool.
 *
 * Pure TS, no Phaser import.
 */

/**
 * What one card shows. `rank` / `maxRank` are passives, relics and upgrades:
 * `rank` is the rank (an upgrade's: the spell level) the pick grants, `maxRank`
 * the cap it counts towards — absent on a passive that never caps, and on every
 * active, relic and charge; an upgrade always carries `MAX_SPELL_LEVEL`. `color`
 * is actives and upgrades only: the spell's own colour, for its icon's fallback
 * disc (CO-155). The card's border and kind label wear its kind's colour
 * (`core/offerColors.ts`).
 */
export interface OfferCard {
  kind: 'active' | 'passive' | 'relic' | 'charge' | 'upgrade';
  id: string;
  name: string;
  description: string;
  rank?: number;
  maxRank?: number;
  color?: number;
}

/**
 * An upgrade card's id is this prefix and the spell's roster id (#326). It is
 * the same for every level, so banning it bans the spell's whole ladder.
 */
export const SPELL_LEVEL_CARD_PREFIX = 'spell_level_';

export function spellLevelCardId(id: RosterSpellId): string {
  return `${SPELL_LEVEL_CARD_PREFIX}${id}`;
}

/** The spell an upgrade card's id names; `undefined` for any other id. */
export function spellIdOfLevelCard(cardId: string): RosterSpellId | undefined {
  if (!cardId.startsWith(SPELL_LEVEL_CARD_PREFIX)) return undefined;
  const id = cardId.slice(SPELL_LEVEL_CARD_PREFIX.length);
  return isRosterSpellId(id) ? id : undefined;
}

/** The spell a card is about: an active's own id, an upgrade's parsed id, else none. */
export function cardSpellId(card: Pick<OfferCard, 'kind' | 'id'>): RosterSpellId | undefined {
  if (card.kind === 'active') return isRosterSpellId(card.id) ? card.id : undefined;
  return card.kind === 'upgrade' ? spellIdOfLevelCard(card.id) : undefined;
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

/**
 * Emitter event names for the overlay -> Game direction, namespaced like
 * `run:*`. The overlay only asks (#228): Game checks each against the offer
 * and the run's counts, then redraws and relaunches the overlay (`reroll`,
 * `ban`) or lets it close (`pick`, `skip`).
 */
export const LEVEL_UP_EVENT = {
  pick: 'levelup:pick',
  reroll: 'levelup:reroll',
  skip: 'levelup:skip',
  ban: 'levelup:ban',
} as const;

/** `pick` and `ban`: the card acted on. */
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
  if (
    c.kind !== 'active' &&
    c.kind !== 'passive' &&
    c.kind !== 'relic' &&
    c.kind !== 'charge' &&
    c.kind !== 'upgrade'
  ) {
    return false;
  }
  if (!isNonEmptyString(c.id) || !isNonEmptyString(c.name) || !isNonEmptyString(c.description)) {
    return false;
  }
  // Only a spell's cards have a colour of their own, and it is optional.
  if (c.color !== undefined && ((c.kind !== 'active' && c.kind !== 'upgrade') || !isRgb(c.color))) {
    return false;
  }
  // An active or a charge carries no rank at all; a passive always ranks, and
  // caps only when its config does; a relic always ranks and never caps.
  if (c.kind === 'active' || c.kind === 'charge') {
    return c.rank === undefined && c.maxRank === undefined;
  }
  if (!isPositiveInt(c.rank)) return false;
  // An upgrade names a roster spell, grants level 2 or 3 and always caps at 3.
  if (c.kind === 'upgrade') {
    return (
      spellIdOfLevelCard(c.id as string) !== undefined &&
      c.rank >= 2 &&
      c.rank <= MAX_SPELL_LEVEL &&
      c.maxRank === MAX_SPELL_LEVEL
    );
  }
  if (c.kind === 'relic') return c.maxRank === undefined;
  return c.maxRank === undefined || (isPositiveInt(c.maxRank) && c.rank <= c.maxRank);
}
