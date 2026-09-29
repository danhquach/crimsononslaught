import type { OfferCard } from './levelUp';

/**
 * CO-197: how a passive at its rank cap is marked, the same on the HUD, the
 * pause and result screens and the level-up card. Pure TS and unit-tested; the
 * scenes only draw what these return.
 */

export const MAX_LABEL = 'MAX';
/** The gold every maxed marker wears, the same gold as the Help tab and the Victory title. */
export const MAX_RANK_CSS = '#ffd700';
/** Text on a gold badge. */
export const MAX_BADGE_TEXT_CSS = '#1a1200';

/** Whether `rank` is the cap. A passive with no `maxRank` never is. */
export function isMaxed(rank: number, maxRank: number | undefined): boolean {
  return maxRank !== undefined && rank >= maxRank;
}

/** A tile's badge: the count, or `MAX` at the cap. */
export function badgeText(count: number, maxed: boolean): string {
  return maxed ? MAX_LABEL : `${count}`;
}

/** `×3` with no cap, `3/5` below it, `5/5 (max)` at it. */
export function rankFraction(count: number, maxRank: number | undefined): string {
  if (maxRank === undefined) return `×${count}`;
  return isMaxed(count, maxRank) ? `${count}/${maxRank} (max)` : `${count}/${maxRank}`;
}

/** Whether the card's pick takes its passive to the final rank. */
export function grantsMaxRank(card: Pick<OfferCard, 'rank' | 'maxRank'>): boolean {
  return card.rank !== undefined && isMaxed(card.rank, card.maxRank);
}

/**
 * `Rank 2/5`, `Rank 5/5 · MAX` on the last rank, `Rank 2` for a passive or
 * relic that never caps, nothing for a spell.
 */
export function rankLabel(card: Pick<OfferCard, 'rank' | 'maxRank'>): string {
  if (card.rank === undefined) return '';
  if (card.maxRank === undefined) return `Rank ${card.rank}`;
  const label = `Rank ${card.rank}/${card.maxRank}`;
  return grantsMaxRank(card) ? `${label} · ${MAX_LABEL}` : label;
}
