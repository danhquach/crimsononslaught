import { describe, expect, it } from 'vitest';
import { PASSIVES, type PassiveId } from '../config/passives';
import { RELIC_BUFFS, type RelicBuffId } from '../config/relics';
import {
  CONFIRM_PROMPTS,
  PAUSE_ACTIONS,
  abbreviate,
  isPauseView,
  itemInfo,
  needsConfirm,
  pauseView,
  statsLine,
} from './pauseModel';

const empty = {
  level: 1,
  spells: [],
  passives: new Map(),
  relics: new Map(),
  kills: 0,
  embers: 0,
  elapsedMs: 0,
};

describe('pauseView', () => {
  it('shows an empty build as the level, the spell and the stats alone', () => {
    const view = pauseView({ ...empty, spells: [{ id: 'fire', name: 'Fire Bolt' }] });
    expect(view).toEqual({
      level: 1,
      spells: [{ id: 'fire', name: 'Fire Bolt' }],
      passives: [],
      relics: [],
      stats: { kills: 0, embers: 0, elapsedMs: 0 },
    });
    expect(isPauseView(view)).toBe(true);
  });

  it('keeps passives and relics in pick order with their ranks, stacks and descriptions', () => {
    const view = pauseView({
      ...empty,
      level: 9,
      spells: [
        { id: 'fire', name: 'Fire Bolt' },
        { id: 'ice', name: 'Ice Arrow' },
      ],
      passives: new Map<PassiveId, number>([
        ['passive_vitality', 3],
        ['passive_power', 1],
      ]),
      relics: new Map<RelicBuffId, number>([
        ['relic_hourglass', 2],
        ['relic_ancient_fury', 1],
      ]),
      kills: 312,
      embers: 48,
      elapsedMs: 252_000,
    });
    expect(view.spells.map((s) => s.id)).toEqual(['fire', 'ice']);
    expect(view.passives.map(({ name, abbr, count }) => [name, abbr, count])).toEqual([
      ['Vitality', 'Vi', 3],
      ['Power', 'Po', 1],
    ]);
    expect(view.relics.map(({ name, abbr, count }) => [name, abbr, count])).toEqual([
      ['Hourglass', 'Ho', 2],
      ['Ancient Fury', 'AF', 1],
    ]);
    expect(view.passives[1]?.description).toBe(
      PASSIVES.find((p) => p.id === 'passive_power')?.description,
    );
    expect(view.stats).toEqual({ kills: 312, embers: 48, elapsedMs: 252_000 });
    expect(isPauseView(view)).toBe(true);
  });

  it('falls back to the id, with no description, for a name this build does not know', () => {
    const view = pauseView({
      ...empty,
      passives: new Map([['gone' as PassiveId, 1]]),
      relics: new Map([['lost' as RelicBuffId, 2]]),
    });
    expect(view.passives).toEqual([{ name: 'gone', abbr: 'Go', description: '', count: 1 }]);
    expect(view.relics).toEqual([{ name: 'lost', abbr: 'Lo', description: '', count: 2 }]);
  });

  it('carries only this run: never the shop upgrades', () => {
    const view = pauseView({ ...empty, ...{ upgrades: new Map([['might', 5]]) } });
    expect(Object.keys(view).sort()).toEqual(['level', 'passives', 'relics', 'spells', 'stats']);
  });
});

describe('abbreviate', () => {
  it('takes initials of two words and the first two letters of one', () => {
    expect(abbreviate('Ancient Fury')).toBe('AF');
    expect(abbreviate("Sage's Tome")).toBe('ST');
    expect(abbreviate('Power')).toBe('Po');
    expect(abbreviate('  Hawk   Eye ')).toBe('HE');
    expect(abbreviate('')).toBe('');
  });

  it('gives every passive, and every relic, a face of its own within its strip', () => {
    for (const list of [PASSIVES, RELIC_BUFFS]) {
      const faces = list.map((entry) => abbreviate(entry.name));
      expect(new Set(faces).size).toBe(faces.length);
    }
  });
});

describe('statsLine and itemInfo', () => {
  it('reads the run so far', () => {
    const view = pauseView({ ...empty, kills: 312, embers: 48, elapsedMs: 252_000 });
    expect(statsLine(view)).toBe('Kills 312  ·  Embers 48  ·  4:12');
  });

  it('names a tile with its count and says what it does', () => {
    const tile = { name: 'Power', abbr: 'Po', description: 'More damage.', count: 2 };
    expect(itemInfo(tile)).toBe('Power ×2  —  More damage.');
    expect(itemInfo({ ...tile, description: '' })).toBe('Power ×2');
  });
});

describe('pause actions', () => {
  it('offers Resume first, then the three ways out', () => {
    expect(PAUSE_ACTIONS).toEqual(['resume', 'restart', 'end', 'menu']);
  });

  it('asks before every action but Resume', () => {
    expect(PAUSE_ACTIONS.filter(needsConfirm)).toEqual(['restart', 'end', 'menu']);
    for (const action of ['restart', 'end', 'menu'] as const) {
      expect(CONFIRM_PROMPTS[action].question, action).toMatch(/\?$/);
    }
  });

  it('warns that Restart and Main menu lose the run, and End run keeps it', () => {
    expect(CONFIRM_PROMPTS.restart.detail).toMatch(/lost/);
    expect(CONFIRM_PROMPTS.menu.detail).toMatch(/lost/);
    expect(CONFIRM_PROMPTS.end.detail).toMatch(/bank/);
  });
});

describe('isPauseView', () => {
  it('rejects anything that is not a view', () => {
    const stats = { kills: 0, embers: 0, elapsedMs: 0 };
    expect(isPauseView(null)).toBe(false);
    expect(isPauseView({})).toBe(false);
    expect(isPauseView({ level: -1, spells: [], passives: [], relics: [], stats })).toBe(false);
    expect(
      isPauseView({
        level: 1,
        spells: [],
        passives: [{ name: 'a', abbr: 'A', description: '', count: -1 }],
        relics: [],
        stats,
      }),
    ).toBe(false);
  });
});
