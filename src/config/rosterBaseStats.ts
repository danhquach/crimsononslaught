import type { RosterSpellId } from './loadout';
import { BASE_AREA_STATS, isAreaSpellId } from './areas';
import { BASE_COMPANION_STATS, isCompanionSpellId } from './companions';
import { BASE_EARTH_ROSTER_STATS, isEarthRosterSpellId } from './earthRoster';
import { BASE_FIRE_ROSTER_STATS, isFireRosterSpellId } from './fireRoster';
import { BASE_ICE_ROSTER_STATS, isIceRosterSpellId } from './iceRoster';
import { BASE_LIGHTNING_ROSTER_STATS, isLightningRosterSpellId } from './lightningRoster';
import { BASE_SHIELD_STATS, isShieldSpellId } from './shields';
import type { SpellStatBlock } from './spellFields';
import { BASE_SPELL_STATS, isSpellId } from './spells';
import { BASE_STRIKE_STATS, isStrikeSpellId } from './strikes';

/**
 * The block a spell's stats are resolved from, before the loadout's passives
 * scale it (spec §6.2). Every roster spell has a block since #143; `undefined`
 * is left for an id added to the roster without one. Lifted out of `GameScene`
 * (#327) so the boot check can read the same lookup the run does.
 *
 * Pure data, no Phaser import.
 */
export function rosterBaseStats(spellId: RosterSpellId): SpellStatBlock | undefined {
  if (isSpellId(spellId)) return BASE_SPELL_STATS[spellId];
  if (isCompanionSpellId(spellId)) return BASE_COMPANION_STATS[spellId];
  if (isShieldSpellId(spellId)) return BASE_SHIELD_STATS[spellId];
  if (isAreaSpellId(spellId)) return BASE_AREA_STATS[spellId];
  if (isStrikeSpellId(spellId)) return BASE_STRIKE_STATS[spellId];
  if (isFireRosterSpellId(spellId)) return BASE_FIRE_ROSTER_STATS[spellId];
  if (isIceRosterSpellId(spellId)) return BASE_ICE_ROSTER_STATS[spellId];
  if (isLightningRosterSpellId(spellId)) return BASE_LIGHTNING_ROSTER_STATS[spellId];
  if (isEarthRosterSpellId(spellId)) return BASE_EARTH_ROSTER_STATS[spellId];
  return undefined;
}
