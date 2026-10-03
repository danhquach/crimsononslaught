import { describe, expect, it } from 'vitest';
import { PASSIVES, type PassiveId } from '../config/passives';
import { RELIC_BUFFS, type RelicBuffId } from '../config/relics';
import {
  CONFIRM_PROMPTS,
  PAUSE_ACTIONS,
  PAUSE_LABELS,
  abbreviate,
  isPauseView,
  itemInfo,
  needsConfirm,
  pauseView,
  statsLine,
  type PauseView,
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
    const view = pauseView({
      ...empty,
      spells: [
        { id: 'fire', name: 'Fire Bolt', color: 0xff4400, description: 'A bolt.', level: 1 },
      ],
    });
    expect(view).toEqual({
      level: 1,
      spells: [
        {
          id: 'fire',
          name: 'Fire Bolt',
          color: 0xff4400,
          description: 'A bolt.',
          level: 1,
          maxLevel: 3,
          maxed: false,
        },
      ],
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
        { id: 'fire', name: 'Fire Bolt', color: 0xff4400, description: 'A bolt.', level: 1 },
        { id: 'ice', name: 'Ice Arrow', color: 0x66ccff, description: 'An arrow.', level: 1 },
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
    expect(view.passives.map(({ id, name, abbr, count }) => [id, name, abbr, count])).toEqual([
      ['passive_vitality', 'Vitality', 'Vi', 3],
      ['passive_power', 'Power', 'Po', 1],
    ]);
    expect(view.relics.map(({ id, name, abbr, count }) => [id, name, abbr, count])).toEqual([
      ['relic_hourglass', 'Hourglass', 'Ho', 2],
      ['relic_ancient_fury', 'Ancient Fury', 'AF', 1],
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
    expect(view.passives).toEqual([
      { id: 'gone', name: 'gone', abbr: 'Go', description: '', count: 1, maxed: false },
    ]);
    expect(view.relics).toEqual([
      { id: 'lost', name: 'lost', abbr: 'Lo', description: '', count: 2, maxed: false },
    ]);
  });

  it("carries a passive's cap and whether it is maxed, never on a relic (CO-197)", () => {
    const view = pauseView({
      ...empty,
      passives: new Map<PassiveId, number>([
        ['passive_swift', 5],
        ['passive_avarice', 3],
        ['passive_power', 2],
      ]),
      relics: new Map<RelicBuffId, number>([['relic_hourglass', 9]]),
    });
    expect(view.passives.map(({ id, maxRank, maxed }) => ({ id, maxRank, maxed }))).toEqual([
      { id: 'passive_swift', maxRank: 5, maxed: true },
      { id: 'passive_avarice', maxRank: 5, maxed: false },
      { id: 'passive_power', maxRank: 8, maxed: false },
    ]);
    expect(view.relics[0]).toMatchObject({ maxed: false });
    expect('maxRank' in (view.relics[0] ?? {})).toBe(false);
    expect(isPauseView(view)).toBe(true);
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
    const tile = { id: 'p', name: 'Power', abbr: 'Po', description: 'More damage.', count: 2 };
    expect(itemInfo(tile)).toBe('Power ×2  —  More damage.');
    expect(itemInfo({ ...tile, description: '' })).toBe('Power ×2');
  });

  it("shows a capped passive's cap, and says max at the cap (CO-197)", () => {
    const tile = { name: 'Swift', description: 'Faster.', count: 5, maxRank: 5 };
    expect(itemInfo(tile)).toBe('Swift  5/5 (max)  —  Faster.');
    expect(itemInfo({ ...tile, name: 'Avarice', count: 3 })).toBe('Avarice  3/5  —  Faster.');
    expect(itemInfo({ ...tile, name: 'Precision', count: 10, maxRank: 10 })).toBe(
      'Precision  10/10 (max)  —  Faster.',
    );
    expect(itemInfo({ ...tile, description: '' })).toBe('Swift  5/5 (max)');
  });

  it('reads a spell with its level, `Lv 2/3`, and `(max)` at the top (#326)', () => {
    const spell = {
      id: 'lightning_sword',
      name: 'Lightning Sword',
      color: 0,
      description: 'Blades circle you.',
      level: 1,
      maxLevel: 3,
      maxed: false,
    };
    expect(itemInfo(spell)).toBe('Lightning Sword  Lv 1/3  —  Blades circle you.');
    expect(itemInfo({ ...spell, level: 2 })).toBe('Lightning Sword  Lv 2/3  —  Blades circle you.');
    expect(itemInfo({ ...spell, level: 3, maxed: true })).toBe(
      'Lightning Sword  Lv 3/3 (max)  —  Blades circle you.',
    );
    expect(itemInfo({ ...spell, description: '' })).toBe('Lightning Sword  Lv 1/3');
  });
});

describe('isPauseView on the rank cap (CO-197)', () => {
  const stats = { kills: 0, embers: 0, elapsedMs: 0 };
  const swift = {
    id: 'passive_swift',
    name: 'Swift',
    abbr: 'Sw',
    description: 'Faster.',
    count: 5,
    maxRank: 5,
    maxed: true,
  };
  const viewOf = (passive: unknown): unknown => ({
    level: 1,
    spells: [],
    passives: [passive],
    relics: [],
    stats,
  });

  it('accepts a maxed item, a capped one below its cap and an uncapped one', () => {
    expect(isPauseView(viewOf(swift))).toBe(true);
    expect(isPauseView(viewOf({ ...swift, count: 3, maxed: false }))).toBe(true);
    expect(isPauseView(viewOf({ ...swift, maxRank: undefined, maxed: false }))).toBe(true);
  });

  it('rejects a maxed flag that is missing, not a boolean or inconsistent with the cap', () => {
    expect(isPauseView(viewOf({ ...swift, maxed: undefined }))).toBe(false);
    expect(isPauseView(viewOf({ ...swift, maxed: 'yes' }))).toBe(false);
    expect(isPauseView(viewOf({ ...swift, maxRank: undefined, maxed: true }))).toBe(false);
    expect(isPauseView(viewOf({ ...swift, maxed: false }))).toBe(false);
    expect(isPauseView(viewOf({ ...swift, count: 3, maxed: true }))).toBe(false);
  });

  it('rejects a cap that is not a whole number of one or more, or that the count passed', () => {
    expect(isPauseView(viewOf({ ...swift, maxRank: 0, count: 0, maxed: true }))).toBe(false);
    expect(isPauseView(viewOf({ ...swift, maxRank: 2.5, maxed: false }))).toBe(false);
    expect(isPauseView(viewOf({ ...swift, maxRank: '5' }))).toBe(false);
    expect(isPauseView(viewOf({ ...swift, count: 6 }))).toBe(false);
  });
});

describe('pause actions', () => {
  it('offers Resume first, then Settings, then the three ways out', () => {
    expect(PAUSE_ACTIONS).toEqual(['resume', 'settings', 'restart', 'end', 'menu']);
    expect(PAUSE_LABELS.settings).toBe('Settings');
  });

  it('asks before every action that ends or abandons the run, not Resume or Settings', () => {
    expect(needsConfirm('resume')).toBe(false);
    expect(needsConfirm('settings')).toBe(false);
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
    const spell = { id: 'fire', name: 'Fire Bolt' };
    expect(isPauseView({ level: 1, spells: [spell], passives: [], relics: [], stats })).toBe(false);
    const noText = { id: 'fire', name: 'Fire Bolt', color: 0 };
    expect(isPauseView({ level: 1, spells: [noText], passives: [], relics: [], stats })).toBe(
      false,
    );
    const noId = { name: 'a', abbr: 'A', description: '', count: 1, maxed: false };
    expect(isPauseView({ level: 1, spells: [], passives: [noId], relics: [], stats })).toBe(false);
    const numericText = { ...noText, description: 5 };
    expect(isPauseView({ level: 1, spells: [numericText], passives: [], relics: [], stats })).toBe(
      false,
    );
    const numericId = { ...noId, id: 7 };
    expect(isPauseView({ level: 1, spells: [], passives: [], relics: [numericId], stats })).toBe(
      false,
    );
    expect(
      isPauseView({
        level: 1,
        spells: [],
        passives: [{ id: 'a', name: 'a', abbr: 'A', description: '', count: -1, maxed: false }],
        relics: [],
        stats,
      }),
    ).toBe(false);
  });
});

describe('isPauseView on spell levels (#326)', () => {
  const view = (): PauseView =>
    pauseView({
      ...empty,
      spells: [
        { id: 'fire', name: 'Fire Bolt', color: 0xff4400, description: 'A bolt.', level: 3 },
        { id: 'ice', name: 'Ice Arrow', color: 0x66ccff, description: 'An arrow.', level: 2 },
      ],
    });
  const withFirst = (patch: Record<string, unknown>): unknown => ({
    ...view(),
    spells: [{ ...view().spells[0], ...patch }, ...view().spells.slice(1)],
  });

  it('fills the level, the top one and whether a spell is at it', () => {
    const [fire, ice] = view().spells;
    expect(fire).toMatchObject({ level: 3, maxLevel: 3, maxed: true });
    expect(ice).toMatchObject({ level: 2, maxLevel: 3, maxed: false });
    expect(isPauseView(view())).toBe(true);
  });

  it('rejects a level outside 1 to 3, or not a whole number', () => {
    for (const level of [0, 4, 2.5, -1, NaN, Infinity, '2', null, undefined]) {
      expect(isPauseView(withFirst({ level, maxed: false })), String(level)).toBe(false);
    }
  });

  it('rejects a wrong top level, or a maxed flag that disagrees with the level', () => {
    expect(isPauseView(withFirst({ maxLevel: 4 }))).toBe(false);
    expect(isPauseView(withFirst({ maxed: false }))).toBe(false);
    expect(isPauseView(withFirst({ level: 2, maxed: true }))).toBe(false);
  });
});
