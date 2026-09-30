import { describe, expect, it } from 'vitest';
import { ROSTER_SPELL_IDS } from '../config/loadout';
import { ROSTER_SPELL_CARDS } from '../config/rosterCards';
import { PASSIVES, type PassiveId } from '../config/passives';
import { RELIC_BUFFS, type RelicBuffId } from '../config/relics';
import {
  RESULT_HEADLINES,
  RESULT_LAYOUT,
  SPELL_PITCH,
  TILE_REACH,
  TILE_ROWS,
  isConfirmKey,
  mostPlayedSpell,
  profileRows,
  resultRows,
  resultView,
  spellSlots,
  tileGrid,
  tilesPerRow,
  type Box,
} from './resultModel';
import { ringOutset } from './focusStyle';
import { itemInfo } from './pauseModel';
import { emptySave } from './save';
import { MAX_BUILD_COUNT, type ResultPayload, type RunStats } from './scenePayloads';

const stats: RunStats = {
  timeSurvivedMs: 272_400,
  level: 8,
  kills: 1234,
  spellId: 'fire',
  embers: 312,
  consumables: 4,
  relics: 3,
};

describe('RESULT_HEADLINES', () => {
  it('names both outcomes with distinct colours', () => {
    expect(RESULT_HEADLINES.win.text).toBe('Victory');
    expect(RESULT_HEADLINES.lose.text).toBe('Defeat');
    expect(RESULT_HEADLINES.win.color).not.toBe(RESULT_HEADLINES.lose.color);
  });

  it('names an ended run (#252) apart from a win or a loss', () => {
    expect(RESULT_HEADLINES.ended.text).toBe('Run ended');
    expect(RESULT_HEADLINES.ended.color).not.toBe(RESULT_HEADLINES.win.color);
    expect(RESULT_HEADLINES.ended.color).not.toBe(RESULT_HEADLINES.lose.color);
  });
});

describe('isConfirmKey', () => {
  it('accepts Enter only', () => {
    expect(isConfirmKey('Enter')).toBe(true);
    expect(isConfirmKey(' ')).toBe(false);
    expect(isConfirmKey('Escape')).toBe(false);
    expect(isConfirmKey('1')).toBe(false);
    expect(isConfirmKey('enter')).toBe(false);
  });
});

const payload: ResultPayload = {
  outcome: 'win',
  stats,
  build: {
    spells: [
      { id: 'fire', name: 'Fire Bolt', color: 0xff5500, level: 3 },
      { id: 'fire_meteor', name: 'Meteor', color: 0xff8800, level: 1 },
    ],
    passives: [
      ['passive_power', 2],
      ['passive_haste', 1],
    ],
    relics: [['relic_hourglass', 3]],
  },
  earned: 1234,
  balance: 56789,
};

/** Every passive at its top rank, every relic, and the three spell slots filled. */
const maxed: ResultPayload = {
  ...payload,
  build: {
    spells: [
      { id: 'lightning', name: 'Lightning Bolt', color: 0xffee55, level: 3 },
      { id: 'lightning_companion', name: 'Lightning Companion', color: 0x88ccff, level: 3 },
      { id: 'lightning_tornado', name: 'Tornado', color: 0x88ccff, level: 3 },
    ],
    passives: PASSIVES.map((p) => [p.id as PassiveId, p.maxRank ?? MAX_BUILD_COUNT] as const),
    relics: RELIC_BUFFS.map((buff) => [buff.id as RelicBuffId, MAX_BUILD_COUNT] as const),
  },
};

describe('resultRows', () => {
  it('formats the stats card in order: time, kills, what was banked and the balance', () => {
    expect(resultRows(payload)).toEqual([
      ['Time survived', '4:32'],
      ['Kills', '1,234'],
      ['Embers collected', '1,234'],
      ['Embers total', '56,789'],
    ]);
  });

  it('renders a fresh run as 0:00 with nothing killed or banked', () => {
    const fresh = {
      ...payload,
      stats: { ...stats, timeSurvivedMs: 0, kills: 0 },
      earned: 0,
      balance: 0,
    };
    expect(resultRows(fresh)).toEqual([
      ['Time survived', '0:00'],
      ['Kills', '0'],
      ['Embers collected', '0'],
      ['Embers total', '0'],
    ]);
  });

  it('floors fractional counts and clamps negatives and NaN to 0', () => {
    const odd = { ...payload, stats: { ...stats, kills: -4 }, earned: 3.9, balance: NaN };
    expect(resultRows(odd).map(([, value]) => value)).toEqual(['4:32', '0', '3', '0']);
  });
});

describe('resultView', () => {
  it('keeps each outcome on its own headline, and greys the hero only on a loss', () => {
    for (const outcome of ['win', 'lose', 'ended'] as const) {
      const view = resultView({ ...payload, outcome });
      expect(view.headline).toBe(RESULT_HEADLINES[outcome]);
      expect(view.fallen).toBe(outcome === 'lose');
    }
  });

  it('shows the level on the badge, floored', () => {
    expect(resultView(payload).level).toBe('8');
    expect(resultView({ ...payload, stats: { ...stats, level: 3.9 } }).level).toBe('3');
  });

  it("turns the build into the pause screen's tiles, in the order taken", () => {
    const view = resultView(payload);
    expect(view.spells.map((spell) => spell.name)).toEqual(['Fire Bolt', 'Meteor']);
    expect(view.passives.map(({ name, abbr, count }) => [name, abbr, count])).toEqual([
      ['Power', 'Po', 2],
      ['Haste', 'Ha', 1],
    ]);
    expect(view.relics.map(({ name, count }) => [name, count])).toEqual([['Hourglass', 3]]);
  });

  it("carries each spell's level to the view, and the top one as maxed (#326)", () => {
    const view = resultView(payload);
    expect(view.spells.map(({ level, maxLevel, maxed }) => [level, maxLevel, maxed])).toEqual([
      [3, 3, true],
      [1, 3, false],
    ]);
  });

  it('gives a maxed build every passive and relic', () => {
    const view = resultView(maxed);
    expect(view.passives).toHaveLength(PASSIVES.length);
    expect(view.relics).toHaveLength(RELIC_BUFFS.length);
  });

  it('marks every capped passive of a maxed build as maxed, and no uncapped one (CO-197)', () => {
    const view = resultView(maxed);
    for (const tile of view.passives) {
      const cap = PASSIVES.find((p) => p.id === tile.id)?.maxRank;
      expect(tile.maxed, tile.id).toBe(cap !== undefined);
    }
    expect(view.relics.every((tile) => !tile.maxed)).toBe(true);
  });
});

/** Everything above the button: the card and the three strips. */
const AREAS: readonly Box[] = [
  RESULT_LAYOUT.card,
  RESULT_LAYOUT.spells,
  RESULT_LAYOUT.passives,
  RESULT_LAYOUT.relics,
];
const inside = (x: number, y: number, box: Box, reach: number): boolean =>
  x - reach >= box.x &&
  x + reach <= box.x + box.width &&
  y - reach >= box.y &&
  y + reach <= box.y + box.height;

describe('RESULT_LAYOUT', () => {
  it('ends every area above the button, and keeps the button and hint on the 960×540 screen', () => {
    const { button, hintY } = RESULT_LAYOUT;
    for (const area of AREAS) expect(area.y + area.height).toBeLessThanOrEqual(button.y - 8);
    expect(button.x).toBeGreaterThanOrEqual(8);
    expect(button.x + button.width).toBeLessThanOrEqual(960 - 8);
    expect(hintY).toBeGreaterThan(button.y + button.height);
    // A 14 px hint centred on hintY, with CI's taller fonts, still clears the bottom by 8 px.
    expect(hintY + 12).toBeLessThanOrEqual(540 - 8);
  });

  it('puts the save-failed line under the hint and inside the screen (#316)', () => {
    const { hintY, saveNoticeY } = RESULT_LAYOUT;
    // Both are 14 px lines centred on their y; CI fonts run up to 12 px either side.
    expect(saveNoticeY).toBeGreaterThanOrEqual(hintY + 24);
    expect(saveNoticeY + 8).toBeLessThanOrEqual(540 - 8);
  });

  it('puts the info line under the strips and the card, and clear of the button and its ring (CO-198)', () => {
    const { info, button, card, relics } = RESULT_LAYOUT;
    expect(info.y).toBeGreaterThanOrEqual(relics.y + relics.height + 4);
    expect(info.y).toBeGreaterThanOrEqual(card.y + card.height + 4);
    expect(info.y + info.height + 8).toBeLessThanOrEqual(button.y);
    // The focus ring round the button starts `ringOutset()` above it; it must not reach the line.
    expect(info.y + info.height).toBeLessThan(button.y - ringOutset());
    expect(info.x).toBeGreaterThanOrEqual(8);
    expect(info.x + info.width).toBeLessThanOrEqual(960 - 8);
  });

  it('fits the hero, its badge and the stat rows inside the card', () => {
    const { card, pedestalY, rows } = RESULT_LAYOUT;
    // The hero's sprite tops out about 101 px over the pedestal.
    expect(pedestalY - 101).toBeGreaterThanOrEqual(card.y);
    expect(rows.y + 3 * rows.pitch + 12).toBeLessThanOrEqual(card.y + card.height);
  });

  it('keeps the strips clear of each other and of the card', () => {
    const sorted = [...AREAS.slice(1)].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i += 1) {
      const above = sorted[i - 1];
      expect(above && above.y + above.height).toBeLessThan(sorted[i]?.y ?? 0);
    }
    const { card } = RESULT_LAYOUT;
    for (const strip of sorted) expect(card.x + card.width).toBeLessThan(strip.x);
  });
});

describe('resultView info lines (CO-198)', () => {
  it('gives every spell its roster description, so the info line can read it', () => {
    const everySpell: ResultPayload = {
      ...maxed,
      build: {
        ...maxed.build,
        spells: ROSTER_SPELL_IDS.map((id) => ({
          id,
          name: ROSTER_SPELL_CARDS[id].name,
          color: ROSTER_SPELL_CARDS[id].color,
          level: 3,
        })),
      },
    };
    const { spells } = resultView(everySpell);
    expect(spells).toHaveLength(ROSTER_SPELL_IDS.length);
    for (const spell of spells) {
      expect(spell.description, spell.id).toBe(
        ROSTER_SPELL_CARDS[spell.id as (typeof ROSTER_SPELL_IDS)[number]].description,
      );
      expect(spell.description.length, spell.id).toBeGreaterThan(0);
    }
  });

  it('keeps every info line short enough for the two lines it has', () => {
    const view = resultView({
      ...maxed,
      build: {
        ...maxed.build,
        spells: ROSTER_SPELL_IDS.map((id) => ({
          id,
          name: ROSTER_SPELL_CARDS[id].name,
          color: ROSTER_SPELL_CARDS[id].color,
          level: 3,
        })),
      },
    });
    for (const tile of [...view.spells, ...view.passives, ...view.relics]) {
      expect(itemInfo(tile).length, tile.id).toBeLessThanOrEqual(170);
    }
  });
});

describe('tileGrid', () => {
  it('places every tile of a maxed build inside its strip', () => {
    for (const [count, strip] of [
      [PASSIVES.length, RESULT_LAYOUT.passives],
      [RELIC_BUFFS.length, RESULT_LAYOUT.relics],
    ] as const) {
      const grid = tileGrid(count, strip);
      expect(grid.overflow).toBe(0);
      expect(grid.slots).toHaveLength(count);
      for (const { x, y } of grid.slots) expect(inside(x, y, strip, TILE_REACH)).toBe(true);
    }
  });

  it('wraps into rows without ever growing the strip, however many tiles come', () => {
    for (const strip of [RESULT_LAYOUT.passives, RESULT_LAYOUT.relics]) {
      const room = tilesPerRow(strip) * TILE_ROWS;
      for (let count = 0; count <= 3 * room; count += 1) {
        const { slots, overflow } = tileGrid(count, strip);
        expect(slots.length).toBeLessThanOrEqual(room);
        // Every tile gets a spot: a slot of its own, or a count on the "+N" marker.
        expect(overflow > 0 ? slots.length - 1 + overflow : slots.length).toBe(count);
        for (const { x, y } of slots) expect(inside(x, y, strip, TILE_REACH)).toBe(true);
        expect(new Set(slots.map(({ x, y }) => `${x},${y}`)).size).toBe(slots.length);
      }
    }
  });

  it('turns junk counts into an empty strip', () => {
    for (const count of [-3, NaN, 0])
      expect(tileGrid(count, RESULT_LAYOUT.passives).slots).toEqual([]);
  });
});

describe('spellSlots', () => {
  it('names up to the three a run can hold, a full pitch apart', () => {
    for (const count of [1, 2, 3]) {
      const { xs, named } = spellSlots(count);
      expect(named).toBe(true);
      expect(xs).toHaveLength(count);
      if (count > 1) expect((xs[1] ?? 0) - (xs[0] ?? 0)).toBe(SPELL_PITCH);
    }
  });

  it('squeezes a crowded strip into its width and drops the names', () => {
    const strip = RESULT_LAYOUT.spells;
    const { xs, y, named } = spellSlots(ROSTER_SPELL_IDS.length);
    expect(named).toBe(false);
    for (const x of xs) expect(inside(x, y, strip, 19)).toBe(true);
  });
});

describe('mostPlayedSpell', () => {
  it('is null before any run', () => {
    expect(mostPlayedSpell({})).toBeNull();
  });

  it('picks the highest count, a tie going to the spell listed first', () => {
    expect(mostPlayedSpell({ fire: 1, earth: 3 })).toBe('earth');
    expect(mostPlayedSpell({ lightning: 2, ice: 2 })).toBe('ice');
  });

  it('skips ids this build has no card for', () => {
    expect(mostPlayedSpell({ retired: 9, ice: 1 })).toBe('ice');
    expect(mostPlayedSpell({ retired: 9 })).toBeNull();
  });
});

describe('profileRows', () => {
  it('is empty before the first run', () => {
    expect(profileRows(emptySave().profile)).toEqual([]);
  });

  it('formats the lifetime totals like the result screen formats a run', () => {
    const profile = {
      name: 'Test_Player',
      runs: 12,
      wins: 2,
      bestTimeMs: 272_400,
      bestLevel: 14,
      totalKills: 12_345,
      spellCounts: { fire: 4, lightning: 8 },
    };
    expect(profileRows(profile)).toEqual([
      ['Runs played', '12'],
      ['Best time survived', '4:32'],
      ['Best level', '14'],
      ['Total kills', '12,345'],
      ['Most played spell', 'Lightning Bolt'],
    ]);
  });
});
