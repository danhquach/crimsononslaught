import { elementOf } from '../config/loadout';
import { SPELL_CARDS } from '../config/spells';
import type { OfferCard } from './levelUp';

/**
 * CO-164 (#253): each kind of pick wears one border colour, so a card reads
 * before its text does — a spell its element's colour, every passive pale
 * mint, every relic violet, every reroll or ban charge (#228) green. The level-up overlay and the pause screen's build
 * list both take them from here, so the same kind always looks the same.
 *
 * Mint and violet were picked to sit far from the four element colours and the
 * menu crimson, including under red-green colour blindness; the kind label
 * stays on the card, so colour is never the only signal.
 *
 * Pure TS, no Phaser import.
 */

export const PASSIVE_COLOR = 0xe5ffee;
export const RELIC_COLOR = 0x9966ff;
export const CHARGE_COLOR = 0x33cc66;
/** The menu crimson, for a spell id outside the roster. No real card wears it. */
export const FALLBACK_COLOR = 0xdc143c;

/** The level-up card's fill at rest and under hover; the kind colours must read on both. */
export const CARD_FILL = 0x1a1a1a;
export const CARD_FILL_HOVER = 0x2a2a2a;

/**
 * A pick's border colour. A spell takes its element's colour, not its own:
 * Fire Wave and Fire Dragon's own reds sit too close to the old crimson border.
 */
export function offerColor(kind: OfferCard['kind'], id: string): number {
  if (kind === 'passive') return PASSIVE_COLOR;
  if (kind === 'relic') return RELIC_COLOR;
  if (kind === 'charge') return CHARGE_COLOR;
  const element = elementOf(id);
  return element === undefined ? FALLBACK_COLOR : SPELL_CARDS[element].color;
}

/** `0xe5ffee` as Phaser text's `'#e5ffee'`. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
