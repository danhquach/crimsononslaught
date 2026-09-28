import type { FrameName } from './frames';
import type { PassiveId } from './passives';
import type { RelicBuffId } from './relics';

/**
 * Each passive's and relic buff's icon (CO-179), as the pause screen's tiles
 * draw it: a round button, steel for a passive and violet in a gold ring for a
 * relic, cut from `docs/art/sheets/CO-179` onto its own atlas page 17.
 *
 * Partial on purpose, like `SPELL_ICON_FRAMES`: a passive or relic that lands
 * before its icon has no entry and its tile keeps its two letters, so a new
 * one never shows a blank tile.
 */
export const BUILD_ICON_FRAMES: Readonly<Partial<Record<PassiveId | RelicBuffId, FrameName>>> = {
  passive_power: 'icon.passive_power.0',
  passive_haste: 'icon.passive_haste.0',
  passive_expanse: 'icon.passive_expanse.0',
  passive_velocity: 'icon.passive_velocity.0',
  passive_persistence: 'icon.passive_persistence.0',
  passive_precision: 'icon.passive_precision.0',
  passive_savagery: 'icon.passive_savagery.0',
  passive_ward: 'icon.passive_ward.0',
  passive_swift: 'icon.passive_swift.0',
  passive_vitality: 'icon.passive_vitality.0',
  passive_regeneration: 'icon.passive_regeneration.0',
  passive_magnet: 'icon.passive_magnet.0',
  passive_avarice: 'icon.passive_avarice.0',
  passive_pierce: 'icon.passive_pierce.0',
  relic_ancient_fury: 'icon.relic_ancient_fury.0',
  relic_hourglass: 'icon.relic_hourglass.0',
  relic_colossus: 'icon.relic_colossus.0',
  relic_tailwind: 'icon.relic_tailwind.0',
  relic_everfrost: 'icon.relic_everfrost.0',
  relic_hawk_eye: 'icon.relic_hawk_eye.0',
  relic_executioner: 'icon.relic_executioner.0',
  relic_bulwark: 'icon.relic_bulwark.0',
  relic_windstep: 'icon.relic_windstep.0',
  relic_bloodstone: 'icon.relic_bloodstone.0',
  relic_wellspring: 'icon.relic_wellspring.0',
  relic_lodestone: 'icon.relic_lodestone.0',
  relic_sages_tome: 'icon.relic_sages_tome.0',
};

/** The icon frame for a passive or relic buff id, or `undefined` for one with no icon art. */
export function buildIconFrame(id: string): FrameName | undefined {
  return Object.hasOwn(BUILD_ICON_FRAMES, id)
    ? BUILD_ICON_FRAMES[id as PassiveId | RelicBuffId]
    : undefined;
}
