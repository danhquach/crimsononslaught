import { AREA_CARDS, AREA_SPELL_IDS } from './areas';
import { COMPANION_CARDS, COMPANION_SPELL_IDS } from './companions';
import { EARTH_ROSTER_CARDS, EARTH_ROSTER_SPELL_IDS } from './earthRoster';
import { FIRE_ROSTER_CARDS, FIRE_ROSTER_SPELL_IDS } from './fireRoster';
import { ICE_ROSTER_CARDS, ICE_ROSTER_SPELL_IDS } from './iceRoster';
import { LIGHTNING_ROSTER_CARDS, LIGHTNING_ROSTER_SPELL_IDS } from './lightningRoster';
import { ROSTER_SPELL_IDS, type RosterSpellId } from './loadout';
import { SHIELD_CARDS, SHIELD_SPELL_IDS } from './shields';
import { SPELL_CARDS, isSpellId, type SpellCard } from './spells';
import { STRIKE_CARDS, STRIKE_SPELL_IDS } from './strikes';

/**
 * Every roster spell's card by id (CO-198), so a screen holding only a spell's
 * id (the result screen's build) can read its description. Pure data; the
 * compiler checks that no roster spell is missing.
 */
export const ROSTER_SPELL_CARDS = {
  ...SPELL_CARDS,
  ...COMPANION_CARDS,
  ...SHIELD_CARDS,
  ...AREA_CARDS,
  ...STRIKE_CARDS,
  ...FIRE_ROSTER_CARDS,
  ...ICE_ROSTER_CARDS,
  ...LIGHTNING_ROSTER_CARDS,
  ...EARTH_ROSTER_CARDS,
} as const satisfies Readonly<Record<RosterSpellId, SpellCard>>;

/** One roster spell's card: its name and line for a level-up or the Help screen, its colour for the HUD and its level-up card. */
export interface RosterCard {
  id: RosterSpellId;
  name: string;
  description: string;
  color: number;
}

/**
 * Every roster spell's card, in the order the level-up catalog has always
 * listed them (grouped by kind, not by element): offers draw from it, so the
 * order is part of a seed's replay. Lifted out of `GameScene` (#327) so the Help
 * screen reads the same names and lines.
 *
 * Pure data, no Phaser import.
 */
export function rosterCards(): RosterCard[] {
  const order: RosterSpellId[] = [
    ...ROSTER_SPELL_IDS.filter(isSpellId),
    ...COMPANION_SPELL_IDS,
    ...SHIELD_SPELL_IDS,
    ...AREA_SPELL_IDS,
    ...STRIKE_SPELL_IDS,
    ...FIRE_ROSTER_SPELL_IDS,
    ...ICE_ROSTER_SPELL_IDS,
    ...LIGHTNING_ROSTER_SPELL_IDS,
    ...EARTH_ROSTER_SPELL_IDS,
  ];
  return order.map((id) => {
    const { name, description, color } = ROSTER_SPELL_CARDS[id];
    return { id, name, description, color };
  });
}
