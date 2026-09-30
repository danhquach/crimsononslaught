import { AREA_CARDS, AREA_SPELL_IDS } from './areas';
import { COMPANION_CARDS, COMPANION_SPELL_IDS } from './companions';
import { EARTH_ROSTER_CARDS, EARTH_ROSTER_SPELL_IDS } from './earthRoster';
import { FIRE_ROSTER_CARDS, FIRE_ROSTER_SPELL_IDS } from './fireRoster';
import { ICE_ROSTER_CARDS, ICE_ROSTER_SPELL_IDS } from './iceRoster';
import { LIGHTNING_ROSTER_CARDS, LIGHTNING_ROSTER_SPELL_IDS } from './lightningRoster';
import { ROSTER_SPELL_IDS, type RosterSpellId } from './loadout';
import { SHIELD_CARDS, SHIELD_SPELL_IDS } from './shields';
import { SPELL_CARDS, isSpellId } from './spells';
import { STRIKE_CARDS, STRIKE_SPELL_IDS } from './strikes';

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
  return [
    ...ROSTER_SPELL_IDS.filter(isSpellId).map((id) => ({
      id,
      name: SPELL_CARDS[id].name,
      description: SPELL_CARDS[id].description,
      color: SPELL_CARDS[id].color,
    })),
    ...COMPANION_SPELL_IDS.map((id) => ({
      id,
      name: COMPANION_CARDS[id].name,
      description: COMPANION_CARDS[id].description,
      color: COMPANION_CARDS[id].color,
    })),
    ...SHIELD_SPELL_IDS.map((id) => ({
      id,
      name: SHIELD_CARDS[id].name,
      description: SHIELD_CARDS[id].description,
      color: SHIELD_CARDS[id].color,
    })),
    ...AREA_SPELL_IDS.map((id) => ({
      id,
      name: AREA_CARDS[id].name,
      description: AREA_CARDS[id].description,
      color: AREA_CARDS[id].color,
    })),
    ...STRIKE_SPELL_IDS.map((id) => ({
      id,
      name: STRIKE_CARDS[id].name,
      description: STRIKE_CARDS[id].description,
      color: STRIKE_CARDS[id].color,
    })),
    ...FIRE_ROSTER_SPELL_IDS.map((id) => ({
      id,
      name: FIRE_ROSTER_CARDS[id].name,
      description: FIRE_ROSTER_CARDS[id].description,
      color: FIRE_ROSTER_CARDS[id].color,
    })),
    ...ICE_ROSTER_SPELL_IDS.map((id) => ({
      id,
      name: ICE_ROSTER_CARDS[id].name,
      description: ICE_ROSTER_CARDS[id].description,
      color: ICE_ROSTER_CARDS[id].color,
    })),
    ...LIGHTNING_ROSTER_SPELL_IDS.map((id) => ({
      id,
      name: LIGHTNING_ROSTER_CARDS[id].name,
      description: LIGHTNING_ROSTER_CARDS[id].description,
      color: LIGHTNING_ROSTER_CARDS[id].color,
    })),
    ...EARTH_ROSTER_SPELL_IDS.map((id) => ({
      id,
      name: EARTH_ROSTER_CARDS[id].name,
      description: EARTH_ROSTER_CARDS[id].description,
      color: EARTH_ROSTER_CARDS[id].color,
    })),
  ];
}
