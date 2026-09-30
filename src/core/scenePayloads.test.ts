import { describe, expect, it } from 'vitest';
import { AREA_CARDS } from '../config/areas';
import { COMPANION_CARDS } from '../config/companions';
import { EARTH_ROSTER_CARDS } from '../config/earthRoster';
import { FIRE_ROSTER_CARDS } from '../config/fireRoster';
import { ICE_ROSTER_CARDS } from '../config/iceRoster';
import { LIGHTNING_ROSTER_CARDS } from '../config/lightningRoster';
import { ROSTER_SPELL_IDS } from '../config/loadout';
import { PASSIVES } from '../config/passives';
import { RELIC_BUFFS } from '../config/relics';
import { SHIELD_CARDS } from '../config/shields';
import { SPELL_CARDS } from '../config/spells';
import { STRIKE_CARDS } from '../config/strikes';
import {
  HELP_VIEWS,
  MAX_BUILD_COUNT,
  MAX_SPELL_PAGE,
  isGamePayload,
  isHelpPayload,
  isLevelUpPayload,
  isPausePayload,
  isResultPayload,
  isRunBuild,
  isRunStats,
  isSettingsPayload,
  type ResultPayload,
  type RunBuild,
} from './scenePayloads';

const stats = {
  timeSurvivedMs: 12_345,
  level: 3,
  kills: 42,
  spellId: 'fire',
  embers: 17,
  consumables: 2,
  relics: 1,
};
const build: RunBuild = {
  spells: [
    { id: 'fire', name: 'Fire Bolt', color: 0xff5500, level: 3 },
    { id: 'fire_meteor', name: 'Meteor', color: 0xff8800, level: 1 },
  ],
  passives: [
    ['passive_power', 3],
    ['passive_haste', 1],
  ],
  relics: [['relic_hourglass', 2]],
};
const result: ResultPayload = {
  outcome: 'win',
  stats: { ...stats, spellId: 'fire' },
  build,
  earned: 210,
  balance: 560,
};

describe('isGamePayload', () => {
  it('accepts every spell id with an integer seed', () => {
    for (const spellId of ['fire', 'ice', 'lightning', 'earth']) {
      expect(isGamePayload({ spellId, seed: 1 })).toBe(true);
    }
    expect(isGamePayload({ spellId: 'ice', seed: 0 })).toBe(true);
    expect(isGamePayload({ spellId: 'ice', seed: -7 })).toBe(true);
  });

  it('rejects missing or malformed payloads (Phaser passes {} when none is given)', () => {
    expect(isGamePayload(undefined)).toBe(false);
    expect(isGamePayload(null)).toBe(false);
    expect(isGamePayload({})).toBe(false);
    expect(isGamePayload({ spellId: 'water', seed: 1 })).toBe(false);
    expect(isGamePayload({ spellId: 'fire' })).toBe(false);
    expect(isGamePayload({ spellId: 'fire', seed: 1.5 })).toBe(false);
    expect(isGamePayload({ spellId: 'fire', seed: '1' })).toBe(false);
    expect(isGamePayload({ spellId: 'fire', seed: NaN })).toBe(false);
  });
});

describe('isRunStats', () => {
  it('accepts a full stats object', () => {
    expect(isRunStats(stats)).toBe(true);
  });

  it('rejects each missing or mistyped field', () => {
    for (const key of Object.keys(stats)) {
      const partial: Record<string, unknown> = { ...stats };
      delete partial[key];
      expect(isRunStats(partial), `missing ${key}`).toBe(false);
    }
    expect(isRunStats({ ...stats, kills: Infinity })).toBe(false);
    expect(isRunStats({ ...stats, level: '3' })).toBe(false);
    expect(isRunStats({ ...stats, spellId: 'water' })).toBe(false);
    expect(isRunStats({ ...stats, embers: '17' })).toBe(false);
    expect(isRunStats({ ...stats, consumables: null })).toBe(false);
    expect(isRunStats({ ...stats, relics: NaN })).toBe(false);
  });
});

describe('isHelpPayload', () => {
  it('accepts every Help view', () => {
    for (const view of HELP_VIEWS) expect(isHelpPayload({ view }), view).toBe(true);
  });

  it('rejects a missing or unknown view', () => {
    expect(isHelpPayload(undefined)).toBe(false);
    expect(isHelpPayload({})).toBe(false);
    // 'spells' is a view since #327; the allow-list is exact, so near misses and hostile shapes stay out.
    for (const view of ['Spells', 'spells ', ' spells', '__proto__', 'constructor', '']) {
      expect(isHelpPayload({ view }), JSON.stringify(view)).toBe(false);
    }
    expect(isHelpPayload({ view: ['spells'] })).toBe(false);
    expect(isHelpPayload({ view: { toString: () => 'spells' } })).toBe(false);
    expect(isHelpPayload(JSON.parse('{"__proto__":{"view":"spells"}}'))).toBe(false);
  });

  it('accepts the Spells view', () => {
    expect(isHelpPayload({ view: 'spells' })).toBe(true);
  });

  it('accepts a spellPage only as a small non-negative integer, or left out', () => {
    expect(isHelpPayload({ view: 'spells' })).toBe(true);
    expect(isHelpPayload({ view: 'spells', spellPage: undefined })).toBe(true);
    for (const spellPage of [0, 1, 3, MAX_SPELL_PAGE]) {
      expect(isHelpPayload({ view: 'spells', spellPage }), String(spellPage)).toBe(true);
    }
  });

  it('rejects a hostile spellPage', () => {
    const hostile: unknown[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      -0.5,
      1.5,
      MAX_SPELL_PAGE + 1,
      Number.MAX_SAFE_INTEGER,
      1e21,
      '1',
      '',
      null,
      true,
      [],
      [1],
      {},
      { valueOf: () => 1 },
      BigInt(1),
    ];
    for (const spellPage of hostile) {
      expect(isHelpPayload({ view: 'spells', spellPage }), String(spellPage)).toBe(false);
    }
    // JSON.parse makes `__proto__` an ordinary own key: the first payload has a hostile
    // spellPage of its own and is rejected; in the second `__proto__` is just an extra
    // key, the prototype is untouched, spellPage is absent and the payload is accepted.
    expect(isHelpPayload(JSON.parse('{"view":"spells","spellPage":{"__proto__":{"x":1}}}'))).toBe(
      false,
    );
    expect(isHelpPayload(JSON.parse('{"view":"spells","__proto__":{"spellPage":"x"}}'))).toBe(true);
  });

  it('reads spellPage as the scene does, so an inherited value is checked like an own one', () => {
    // The validator and HelpScene both read `data.spellPage` along the prototype chain.
    expect(isHelpPayload(Object.create({ view: 'spells', spellPage: 3 }))).toBe(true);
    expect(isHelpPayload(Object.create({ view: 'spells', spellPage: '3' }))).toBe(false);
    expect(isHelpPayload(Object.assign(Object.create({ spellPage: 3 }), { view: 'spells' }))).toBe(
      true,
    );
    expect(
      isHelpPayload(Object.assign(Object.create({ spellPage: 999 }), { view: 'spells' })),
    ).toBe(false);
  });
});

describe('isPausePayload', () => {
  const power = {
    id: 'passive_power',
    name: 'Power',
    abbr: 'Po',
    description: 'More damage.',
    count: 2,
    maxed: false,
  };
  const stats = { kills: 12, embers: 3, elapsedMs: 61_000 };
  const view = {
    level: 4,
    spells: [
      {
        id: 'fire',
        name: 'Fire Bolt',
        color: 0xff4400,
        description: 'A bolt.',
        level: 3,
        maxLevel: 3,
        maxed: true,
      },
      {
        id: 'ice',
        name: 'Ice Arrow',
        color: 0x66ccff,
        description: 'An arrow.',
        level: 1,
        maxLevel: 3,
        maxed: false,
      },
    ],
    passives: [power],
    relics: [{ ...power, id: 'relic_hourglass', name: 'Hourglass', abbr: 'Ho', count: 1 }],
    stats,
  };
  const empty = { level: 1, spells: [], passives: [], relics: [], stats };

  it('accepts a view, with or without an action to confirm', () => {
    expect(isPausePayload({ view })).toBe(true);
    expect(isPausePayload({ view: empty })).toBe(true);
    for (const confirm of ['restart', 'end', 'menu']) {
      expect(isPausePayload({ view, confirm }), confirm).toBe(true);
    }
  });

  it('accepts a maxed capped passive and rejects a maxed flag that disagrees (CO-197)', () => {
    const swift = {
      ...power,
      id: 'passive_swift',
      name: 'Swift',
      count: 5,
      maxRank: 5,
      maxed: true,
    };
    expect(isPausePayload({ view: { ...view, passives: [swift] } })).toBe(true);
    expect(isSettingsPayload({ pause: { view: { ...view, passives: [swift] } } })).toBe(true);
    const bad = { ...power, maxed: true };
    expect(isPausePayload({ view: { ...view, passives: [bad] } })).toBe(false);
    expect(isSettingsPayload({ pause: { view: { ...view, passives: [bad] } } })).toBe(false);
  });

  it('rejects a missing or malformed view, and Resume as a confirmation', () => {
    expect(isPausePayload(undefined)).toBe(false);
    expect(isPausePayload({})).toBe(false);
    expect(isPausePayload({ view, confirm: 'resume' })).toBe(false);
    expect(isPausePayload({ view, confirm: 'settings' })).toBe(false);
    expect(isPausePayload({ view, confirm: 'quit' })).toBe(false);
    expect(isPausePayload({ view: { ...view, level: 1.5 } })).toBe(false);
    expect(isPausePayload({ view: { ...view, spells: ['Fire Bolt'] } })).toBe(false);
    expect(isPausePayload({ view: { ...view, passives: [{ name: 'Power' }] } })).toBe(false);
    expect(isPausePayload({ view: { ...view, relics: [{ ...power, count: -1 }] } })).toBe(false);
    expect(isPausePayload({ view: { ...view, stats: undefined } })).toBe(false);
    expect(isPausePayload({ view: { ...view, stats: { ...stats, elapsedMs: NaN } } })).toBe(false);
  });

  it('accepts a Settings payload only with a plain pause view to go back to', () => {
    expect(isSettingsPayload({ pause: { view } })).toBe(true);
    expect(isSettingsPayload({ pause: { view: empty } })).toBe(true);
    expect(isSettingsPayload(undefined)).toBe(false);
    expect(isSettingsPayload({})).toBe(false);
    expect(isSettingsPayload({ pause: undefined })).toBe(false);
    expect(isSettingsPayload({ pause: {} })).toBe(false);
    expect(isSettingsPayload({ pause: { view: { ...view, level: -1 } } })).toBe(false);
    // The bare pause payload is not a Settings payload, and Settings never returns to a prompt.
    expect(isSettingsPayload({ view })).toBe(false);
    expect(isSettingsPayload({ pause: { view, confirm: 'end' } })).toBe(false);
    expect(isSettingsPayload({ pause: { view, confirm: 'settings' } })).toBe(false);
  });
});

describe('isResultPayload', () => {
  it('accepts win, lose and an ended run with valid stats', () => {
    expect(isResultPayload(result)).toBe(true);
    expect(isResultPayload({ ...result, outcome: 'lose' })).toBe(true);
    expect(isResultPayload({ ...result, outcome: 'ended' })).toBe(true);
  });

  it('rejects missing payload, unknown outcome, or bad stats', () => {
    expect(isResultPayload(undefined)).toBe(false);
    expect(isResultPayload({})).toBe(false);
    expect(isResultPayload({ outcome: 'draw', stats })).toBe(false);
    expect(isResultPayload({ outcome: 'win' })).toBe(false);
    expect(isResultPayload({ outcome: 'win', stats: {} })).toBe(false);
  });

  it('rejects a payload without a valid build', () => {
    expect(isResultPayload({ ...result, build: undefined })).toBe(false);
    expect(
      isResultPayload({ ...result, build: { ...build, passives: [['passive_nope', 1]] } }),
    ).toBe(false);
  });

  it('rejects a payload without the run reward', () => {
    expect(isResultPayload({ outcome: 'win', stats })).toBe(false);
    expect(isResultPayload({ ...result, earned: NaN })).toBe(false);
    expect(isResultPayload({ ...result, balance: undefined })).toBe(false);
  });
});

/** Every spell a run can equip, named and coloured as Game's cards are. */
const ROSTER_CARDS: Readonly<Record<string, { name: string; color: number }>> = {
  ...SPELL_CARDS,
  ...COMPANION_CARDS,
  ...SHIELD_CARDS,
  ...AREA_CARDS,
  ...STRIKE_CARDS,
  ...FIRE_ROSTER_CARDS,
  ...ICE_ROSTER_CARDS,
  ...LIGHTNING_ROSTER_CARDS,
  ...EARTH_ROSTER_CARDS,
};

describe('isRunBuild', () => {
  const withSpells = (spells: unknown): unknown => ({ ...build, spells });
  const withPassives = (passives: unknown): unknown => ({ ...build, passives });
  const withRelics = (relics: unknown): unknown => ({ ...build, relics });

  it('accepts an empty build and a valid one', () => {
    expect(isRunBuild({ spells: [], passives: [], relics: [] })).toBe(true);
    expect(isRunBuild(build)).toBe(true);
  });

  it("accepts every roster spell under its own card's name and colour", () => {
    const spells = ROSTER_SPELL_IDS.map((id) => {
      const card = ROSTER_CARDS[id];
      expect(card, id).toBeDefined();
      return { id, name: card?.name, color: card?.color, level: 1 };
    });
    expect(isRunBuild(withSpells(spells))).toBe(true);
  });

  it('accepts the largest build the game allows: every passive and relic, at any rank up to the cap', () => {
    const maxed = {
      spells: build.spells,
      passives: PASSIVES.map((passive) => [passive.id, passive.maxRank ?? MAX_BUILD_COUNT]),
      relics: RELIC_BUFFS.map((buff) => [buff.id, MAX_BUILD_COUNT]),
    };
    expect(isRunBuild(maxed)).toBe(true);
  });

  it('rejects ids outside the allow-lists, and repeats', () => {
    expect(isRunBuild(withSpells([{ id: 'water', name: 'Water', color: 0, level: 1 }]))).toBe(
      false,
    );
    expect(isRunBuild(withSpells([build.spells[0], build.spells[0]]))).toBe(false);
    expect(isRunBuild(withPassives([['passive_nope', 1]]))).toBe(false);
    expect(isRunBuild(withPassives([['relic_hourglass', 1]]))).toBe(false);
    expect(isRunBuild(withRelics([['passive_power', 1]]))).toBe(false);
    expect(
      isRunBuild(
        withPassives([
          ['passive_power', 1],
          ['passive_power', 2],
        ]),
      ),
    ).toBe(false);
    expect(
      isRunBuild(
        withRelics([
          ['relic_hourglass', 1],
          ['relic_hourglass', 1],
        ]),
      ),
    ).toBe(false);
  });

  it('rejects prototype keys and inherited names as ids', () => {
    for (const id of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']) {
      expect(isRunBuild(withPassives([[id, 1]])), id).toBe(false);
      expect(isRunBuild(withRelics([[id, 1]])), id).toBe(false);
      expect(isRunBuild(withSpells([{ id, name: 'Fire Bolt', color: 0, level: 1 }])), id).toBe(
        false,
      );
    }
    // A parsed `__proto__` key is an own property, not the prototype; the guard reads fields only.
    const parsed: unknown = JSON.parse(
      '{"spells":[],"passives":[],"relics":[],"__proto__":{"polluted":true}}',
    );
    expect(isRunBuild(parsed)).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const parsedSpell: unknown = JSON.parse(
      '{"spells":[{"__proto__":{"id":"fire","name":"Fire Bolt","color":0,"level":1}}],"passives":[],"relics":[]}',
    );
    expect(isRunBuild(parsedSpell)).toBe(false);
  });

  it('rejects ranks and stacks that are not whole numbers from 1 to the cap', () => {
    for (const count of [0, -1, 1.5, NaN, Infinity, MAX_BUILD_COUNT + 1, '3', null, undefined]) {
      expect(isRunBuild(withPassives([['passive_power', count]])), String(count)).toBe(false);
      expect(isRunBuild(withRelics([['relic_hourglass', count]])), String(count)).toBe(false);
    }
  });

  it('rejects malformed pairs and fields', () => {
    for (const pair of [
      ['passive_power'],
      ['passive_power', 1, 2],
      { 0: 'passive_power', 1: 1 },
      'passive_power',
    ]) {
      expect(isRunBuild(withPassives([pair])), JSON.stringify(pair)).toBe(false);
    }
    expect(isRunBuild(withPassives({ passive_power: 1 }))).toBe(false);
    expect(isRunBuild(withPassives(new Map([['passive_power', 1]])))).toBe(false);
    expect(isRunBuild({ ...build, spells: undefined })).toBe(false);
    expect(isRunBuild(null)).toBe(false);
    expect(isRunBuild('build')).toBe(false);
  });

  it('accepts a spell level of 1, 2 or 3, and nothing else (#326)', () => {
    const level = (value: unknown): unknown =>
      withSpells([{ id: 'fire', name: 'Fire Bolt', color: 0xff5500, level: value }]);
    for (const ok of [1, 2, 3]) expect(isRunBuild(level(ok)), String(ok)).toBe(true);
    const hostile = [
      0,
      4,
      99999999999,
      2.5,
      -1,
      NaN,
      Infinity,
      '3',
      null,
      undefined,
      { valueOf: () => 2 },
      [2],
    ];
    for (const bad of hostile) expect(isRunBuild(level(bad)), String(bad)).toBe(false);
    expect(isRunBuild(withSpells([{ id: 'fire', name: 'Fire Bolt', color: 0xff5500 }]))).toBe(
      false,
    );
  });

  it('turns away a huge array before reading it', () => {
    const huge = Array.from({ length: 100_000 }, () => ['passive_power', 1]);
    expect(isRunBuild(withPassives(huge))).toBe(false);
    expect(isRunBuild(withRelics(huge))).toBe(false);
    const spells = Array.from({ length: 100_000 }, () => build.spells[0]);
    expect(isRunBuild(withSpells(spells))).toBe(false);
  });

  it('allows only plain ASCII spell names, and a colour in 24-bit RGB', () => {
    const spell = (name: unknown, color: unknown = 0xff5500): unknown =>
      withSpells([{ id: 'fire', name, color, level: 1 }]);
    expect(isRunBuild(spell("Sage's Fire-Bolt 2"))).toBe(true);
    expect(isRunBuild(spell('fire_meteor'))).toBe(true); // Game's fallback: the id
    for (const name of [
      '',
      'x'.repeat(41),
      'Fire\u202EBolt', // bidi override
      'Fire\u200BBolt', // zero-width space
      'F\u0456re Bolt', // Cyrillic look-alike i
      '<img src=x onerror=alert(1)>',
      'Fire\nBolt',
      42,
    ]) {
      expect(isRunBuild(spell(name)), JSON.stringify(name)).toBe(false);
    }
    for (const color of [-1, 0x1000000, 1.5, NaN, '0xff5500']) {
      expect(isRunBuild(spell('Fire Bolt', color)), String(color)).toBe(false);
    }
  });
});

describe('isLevelUpPayload', () => {
  const passive = {
    kind: 'passive',
    id: 'passive_power',
    name: 'Power',
    rank: 1,
    maxRank: 3,
    description: 'Every spell deals 10% more damage.',
  };
  const active = {
    kind: 'active',
    id: 'fire_meteor',
    name: 'Meteor',
    description: 'Calls a meteor down on the crowd.',
  };

  it('accepts one to three valid cards, of either kind', () => {
    expect(isLevelUpPayload({ offer: [passive] })).toBe(true);
    expect(isLevelUpPayload({ offer: [passive, passive, passive] })).toBe(true);
    expect(isLevelUpPayload({ offer: [active, active] })).toBe(true);
  });

  it('accepts an upgrade card, and rejects one naming a spell outside the roster (#326)', () => {
    const upgrade = {
      kind: 'upgrade',
      id: 'spell_level_fire',
      name: 'Fire Bolt',
      description: 'Adds a bolt.',
      rank: 2,
      maxRank: 3,
    };
    expect(isLevelUpPayload({ offer: [upgrade, passive] })).toBe(true);
    expect(isLevelUpPayload({ offer: [{ ...upgrade, id: 'spell_level_water' }] })).toBe(false);
    expect(isLevelUpPayload({ offer: [{ ...upgrade, rank: 1 }] })).toBe(false);
  });

  it('rejects an empty offer (Game handles that path without an overlay) and more than three', () => {
    expect(isLevelUpPayload({ offer: [] })).toBe(false);
    expect(isLevelUpPayload({ offer: [passive, passive, passive, passive] })).toBe(false);
  });

  it('rejects missing payload or a malformed card', () => {
    expect(isLevelUpPayload(undefined)).toBe(false);
    expect(isLevelUpPayload({})).toBe(false);
    expect(isLevelUpPayload({ offer: 'passive' })).toBe(false);
    expect(isLevelUpPayload({ offer: [{ ...passive, rank: 0 }] })).toBe(false);
    expect(isLevelUpPayload({ offer: [{ ...active, kind: 'perk' }] })).toBe(false);
  });

  it('accepts reroll and ban counts of 0 or more, and rejects anything else (#228)', () => {
    expect(isLevelUpPayload({ offer: [passive], actions: { rerolls: 3, bans: 1 } })).toBe(true);
    expect(isLevelUpPayload({ offer: [passive], actions: { rerolls: 0, bans: 0 } })).toBe(true);
    expect(isLevelUpPayload({ offer: [passive], actions: { rerolls: -1, bans: 0 } })).toBe(false);
    expect(isLevelUpPayload({ offer: [passive], actions: { rerolls: 1.5, bans: 0 } })).toBe(false);
    expect(isLevelUpPayload({ offer: [passive], actions: { rerolls: 1 } })).toBe(false);
  });
});
