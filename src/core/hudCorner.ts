import { CURRENCY_NAME } from '../config/meta';
import type { HudModel } from './hudModel';
import { abbreviate } from './pauseModel';
import type { LoadoutPassiveView } from './runEvents';

/**
 * CO-193: the layout and the diffing behind the HUD's top-right corner — Kills,
 * Embers and the passives held, drawn as icons. Pure TS and unit-tested;
 * `HudScene` only draws what these return. Its own module rather than part of
 * `hudModel`, because the tile face's letters come from `pauseModel`, which
 * itself reads `hudModel`.
 */

/**
 * A passive tile is 32 px with its rim and a badge straddling the corner, so a
 * pitch of 40 across leaves a gap even for a two-digit badge, and 44 down keeps
 * the badge off the row below. Four across fit the corner's plate width.
 */
export const PASSIVE_TILE_PITCH_X = 40;
export const PASSIVE_TILE_PITCH_Y = 44;
export const PASSIVE_TILES_PER_ROW = 4;

/** One passive tile: where its centre goes and what its face and badge say. */
export interface HudPassiveTile {
  id: string;
  /** The letters on the tile when its icon art is missing. */
  abbr: string;
  /** The rank, on the badge. */
  count: number;
  x: number;
  y: number;
}

/**
 * The tiles for `passives`, in the order taken, four across and wrapping down;
 * the first tile's centre is (`left`, `top`).
 */
export function passiveTileLayout(
  passives: readonly LoadoutPassiveView[],
  left: number,
  top: number,
): HudPassiveTile[] {
  return passives.map(({ id, name, rank }, index) => ({
    id,
    abbr: abbreviate(name),
    count: rank,
    x: left + (index % PASSIVE_TILES_PER_ROW) * PASSIVE_TILE_PITCH_X,
    y: top + Math.floor(index / PASSIVE_TILES_PER_ROW) * PASSIVE_TILE_PITCH_Y,
  }));
}

/**
 * Whether `a` and `b` hold the same passives at the same ranks in the same
 * order. The Game scene publishes a fresh array every frame, so the HUD
 * compares contents to rebuild its tiles only when the build changes.
 */
export function samePassives(
  a: readonly LoadoutPassiveView[],
  b: readonly LoadoutPassiveView[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id || a[i]?.rank !== b[i]?.rank) return false;
  }
  return true;
}

/** The ids in `next` that are new since `prev` or whose rank went up: the tiles to flash. */
export function risenPassives(
  prev: readonly LoadoutPassiveView[],
  next: readonly LoadoutPassiveView[],
): string[] {
  const before = new Map(prev.map(({ id, rank }) => [id, rank]));
  return next.filter(({ id, rank }) => rank > (before.get(id) ?? 0)).map(({ id }) => id);
}

/**
 * The corner's two counts. Beside their icons only the numbers are needed;
 * without the atlas there are no icons, so the words stay.
 */
export function cornerCounts(
  model: Readonly<Pick<HudModel, 'kills' | 'embers'>>,
  iconed: boolean,
): { kills: string; embers: string } {
  if (iconed) return { kills: `${model.kills}`, embers: `${model.embers}` };
  return { kills: `Kills ${model.kills}`, embers: `${CURRENCY_NAME} ${model.embers}` };
}
