import type { FrameName } from './frames';
import type { RosterSpellId } from './loadout';

/**
 * Each roster spell's HUD icon (CO-154): a round button in its element's
 * colour with the spell's silhouette on it, cut from `docs/art/sheets/CO-154`
 * onto its own atlas page.
 *
 * Partial on purpose, like `STATIC_FRAMES`: a spell that lands before its icon
 * has no entry and its slot keeps the colour-and-letters glyph, so a new spell
 * never shows a blank slot.
 */
export const SPELL_ICON_FRAMES: Readonly<Partial<Record<RosterSpellId, FrameName>>> = {
  fire: 'icon.fire.0',
  fire_meteor: 'icon.fire_meteor.0',
  fire_column: 'icon.fire_column.0',
  fire_companion: 'icon.fire_companion.0',
  fire_dragon: 'icon.fire_dragon.0',
  ice: 'icon.ice.0',
  ice_nova_bomb: 'icon.ice_nova_bomb.0',
  ice_shield: 'icon.ice_shield.0',
  ice_companion: 'icon.ice_companion.0',
  ice_blizzard: 'icon.ice_blizzard.0',
  lightning: 'icon.lightning.0',
  lightning_chain: 'icon.lightning_chain.0',
  lightning_tornado: 'icon.lightning_tornado.0',
  lightning_companion: 'icon.lightning_companion.0',
  lightning_sword: 'icon.lightning_sword.0',
  earth: 'icon.earth.0',
  earth_boulder: 'icon.earth_boulder.0',
  earth_shield: 'icon.earth_shield.0',
  earth_quake: 'icon.earth_quake.0',
  earth_companion: 'icon.earth_companion.0',
};

/** The icon frame for a spell id, or `undefined` for one with no icon art. */
export function spellIconFrame(id: string): FrameName | undefined {
  return Object.hasOwn(SPELL_ICON_FRAMES, id) ? SPELL_ICON_FRAMES[id as RosterSpellId] : undefined;
}
