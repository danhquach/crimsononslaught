import { EMPTY_OFFER_MAX_HP_BONUS } from '../config/progression';

/**
 * Level-up overlay contract (spec §4 step 3, §5 "XP and level-up").
 *
 * `PerkSystem` (CO-042) turns `perkOffer.offer()` (CO-041) into `PerkCard`s —
 * the display slice the overlay needs — and Game decides via `resolveLevelUp`
 * whether to pause and show them or to apply the silent fallback. The pick
 * travels back to Game as a `LEVEL_UP_EVENT.pick` on the Game scene's emitter.
 *
 * Pure TS, no Phaser import.
 */

/** What one card shows. `rank` is the rank the pick grants, out of `maxRank`. */
export interface PerkCard {
  id: string;
  name: string;
  branch: string;
  rank: number;
  maxRank: number;
  description: string;
}

/** Spec §5: offer 3 random eligible perks; fewer if fewer exist. */
export const MAX_OFFER_SIZE = 3;

export type LevelUpResolution =
  { kind: 'overlay'; cards: readonly PerkCard[] } | { kind: 'fallback'; maxHpBonus: number };

/**
 * Decide what a level-up does with the eligible offer. Never more than 3 cards:
 * the first `MAX_OFFER_SIZE` are kept, so callers pass an already-randomised
 * offer (CO-041's `offer(rng, eligible, 3)`; the stub in GameScene shuffles).
 */
export function resolveLevelUp(offer: readonly PerkCard[]): LevelUpResolution {
  if (offer.length === 0) return { kind: 'fallback', maxHpBonus: EMPTY_OFFER_MAX_HP_BONUS };
  return { kind: 'overlay', cards: offer.slice(0, MAX_OFFER_SIZE) };
}

/** Keyboard shortcut: `'1'`–`'3'` (KeyboardEvent.key) pick the card in that slot, if it exists. */
export function perkIndexForKey(key: string, cardCount: number): number | undefined {
  if (!/^[1-3]$/.test(key)) return undefined;
  const index = Number(key) - 1;
  return index < cardCount ? index : undefined;
}

/** Emitter event names for the overlay -> Game direction, namespaced like `run:*`. */
export const LEVEL_UP_EVENT = {
  pick: 'levelup:pick',
} as const;

export interface LevelUpPickPayload {
  perkId: string;
}

const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function isPerkCard(data: unknown): data is PerkCard {
  if (typeof data !== 'object' || data === null) return false;
  const c = data as Record<string, unknown>;
  return (
    isNonEmptyString(c.id) &&
    isNonEmptyString(c.name) &&
    typeof c.branch === 'string' &&
    isNonEmptyString(c.description) &&
    isPositiveInt(c.rank) &&
    isPositiveInt(c.maxRank) &&
    c.rank <= c.maxRank
  );
}
