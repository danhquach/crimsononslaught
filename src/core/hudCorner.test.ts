import { describe, expect, it } from 'vitest';
import { CURRENCY_NAME } from '../config/meta';
import { PASSIVES } from '../config/passives';
import {
  PASSIVE_TILE_PITCH_X,
  PASSIVE_TILE_PITCH_Y,
  cornerCounts,
  passiveTileLayout,
  risenPassives,
  samePassives,
} from './hudCorner';
import type { LoadoutPassiveView } from './runEvents';

const POWER: LoadoutPassiveView = { id: 'passive_power', name: 'Power', rank: 3 };
const HASTE: LoadoutPassiveView = { id: 'passive_haste', name: 'Haste', rank: 1 };
const WARD: LoadoutPassiveView = { id: 'passive_ward', name: 'Ward', rank: 2 };

describe('passiveTileLayout', () => {
  it('has no tiles for no passives', () => {
    expect(passiveTileLayout([], 806, 72)).toEqual([]);
  });

  it('keeps the order taken, with the abbreviation and the rank', () => {
    expect(passiveTileLayout([POWER, HASTE], 806, 72)).toEqual([
      { id: 'passive_power', abbr: 'Po', count: 3, x: 806, y: 72 },
      { id: 'passive_haste', abbr: 'Ha', count: 1, x: 806 + PASSIVE_TILE_PITCH_X, y: 72 },
    ]);
  });

  it('wraps after four across, the fifth starting the next row', () => {
    const five = [POWER, HASTE, WARD, POWER, HASTE].map((p, i) => ({ ...p, id: `p${i}` }));
    const tiles = passiveTileLayout(five, 806, 72);
    expect(tiles.slice(0, 4).map((t) => t.y)).toEqual([72, 72, 72, 72]);
    expect(tiles[4]).toMatchObject({ x: 806, y: 72 + PASSIVE_TILE_PITCH_Y });
  });

  it('lays the whole roster in four rows inside the corner', () => {
    const all = PASSIVES.map(({ id, name }) => ({ id, name, rank: 1 }));
    const tiles = passiveTileLayout(all, 806, 72);
    expect(tiles).toHaveLength(14);
    expect(new Set(tiles.map((t) => t.y)).size).toBe(4);
    expect(Math.min(...tiles.map((t) => t.x))).toBe(806);
    expect(Math.max(...tiles.map((t) => t.x))).toBe(926);
    expect(Math.max(...tiles.map((t) => t.y))).toBe(204);
  });
});

describe('samePassives', () => {
  it('is true for equal contents in fresh arrays', () => {
    expect(samePassives([{ ...POWER }, { ...HASTE }], [{ ...POWER }, { ...HASTE }])).toBe(true);
    expect(samePassives([], [])).toBe(true);
  });

  it('is false when a rank, the order or the length changes', () => {
    expect(samePassives([POWER], [{ ...POWER, rank: 4 }])).toBe(false);
    expect(samePassives([POWER, HASTE], [HASTE, POWER])).toBe(false);
    expect(samePassives([POWER], [POWER, HASTE])).toBe(false);
    expect(samePassives([POWER, HASTE], [POWER])).toBe(false);
  });
});

describe('risenPassives', () => {
  it('lists the passives that are new or ranked up', () => {
    const next = [{ ...POWER, rank: 4 }, HASTE, WARD];
    expect(risenPassives([POWER, HASTE], next)).toEqual(['passive_power', 'passive_ward']);
  });

  it('leaves out the unchanged and the removed', () => {
    expect(risenPassives([POWER, HASTE], [POWER])).toEqual([]);
    expect(risenPassives([], [])).toEqual([]);
  });
});

describe('cornerCounts', () => {
  it('is the bare numbers beside the icons', () => {
    expect(cornerCounts({ kills: 123, embers: 45 }, true)).toEqual({ kills: '123', embers: '45' });
  });

  it('keeps the words without the atlas', () => {
    expect(cornerCounts({ kills: 123, embers: 45 }, false)).toEqual({
      kills: 'Kills 123',
      embers: `${CURRENCY_NAME} 45`,
    });
  });
});
