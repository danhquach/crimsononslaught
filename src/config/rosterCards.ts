import { AREA_CARDS } from './areas';
import { COMPANION_CARDS } from './companions';
import { EARTH_ROSTER_CARDS } from './earthRoster';
import { FIRE_ROSTER_CARDS } from './fireRoster';
import { ICE_ROSTER_CARDS } from './iceRoster';
import { LIGHTNING_ROSTER_CARDS } from './lightningRoster';
import type { RosterSpellId } from './loadout';
import { SHIELD_CARDS } from './shields';
import { SPELL_CARDS, type SpellCard } from './spells';
import { STRIKE_CARDS } from './strikes';

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
