import { describe, expect, it } from 'vitest';
import { validateSpellLevelStats } from '../core/spellLevelStats';
import { SPELLS_BY_ELEMENT } from './loadout';
import { rosterBaseStats } from './rosterBaseStats';
import {
  MAX_SPELL_LEVEL,
  SPELL_LEVELS,
  SPELL_LEVEL_STATS,
  SPELL_LEVEL_TEXT_MAX,
  isSpellLevel,
  spellLevelText,
  validateSpellLevels,
  type SpellLevelTable,
} from './spellLevels';

const ENTRY = { 2: 'Adds a blade.', 3: 'Blades explode on impact.' };

describe('SPELL_LEVELS (#326)', () => {
  it('has an entry for exactly the spells whose levels have landed: every Fire (#327) and Ice (#328) spell', () => {
    expect(Object.keys(SPELL_LEVELS).sort()).toEqual(
      [...SPELLS_BY_ELEMENT.fire, ...SPELLS_BY_ELEMENT.ice].sort(),
    );
    expect(validateSpellLevels()).toEqual([]);
  });

  it('adds stats only to spells that have text, and the fields exist (#327, #328)', () => {
    // A spell whose levels are all behaviour (Ice Shield, Ice Storm) has text and no stat add.
    for (const id of Object.keys(SPELL_LEVEL_STATS)) expect(SPELL_LEVELS, id).toHaveProperty(id);
    expect(validateSpellLevelStats(SPELL_LEVEL_STATS, rosterBaseStats)).toEqual([]);
  });

  it('caps a spell at level 3', () => {
    expect(MAX_SPELL_LEVEL).toBe(3);
  });
});

describe('isSpellLevel', () => {
  it('accepts 1, 2 and 3', () => {
    for (const level of [1, 2, 3]) expect(isSpellLevel(level)).toBe(true);
  });

  it('rejects everything else', () => {
    for (const value of [0, 4, -1, 2.5, NaN, Infinity, 99999999999, '2', null, undefined, {}]) {
      expect(isSpellLevel(value), String(value)).toBe(false);
    }
  });
});

describe('spellLevelText', () => {
  const table: SpellLevelTable = { fire: ENTRY };

  it('reads the text for level 2 and 3', () => {
    expect(spellLevelText(table, 'fire', 2)).toBe(ENTRY[2]);
    expect(spellLevelText(table, 'fire', 3)).toBe(ENTRY[3]);
  });

  it('has nothing for level 1, an out-of-range level or a spell without an entry', () => {
    expect(spellLevelText(table, 'fire', 1)).toBeUndefined();
    expect(spellLevelText(table, 'fire', 4)).toBeUndefined();
    expect(spellLevelText(table, 'ice', 2)).toBeUndefined();
  });

  it('does not read a spell off the prototype chain', () => {
    expect(spellLevelText({}, 'toString' as never, 2)).toBeUndefined();
  });
});

describe('validateSpellLevels', () => {
  it('passes a well-formed table', () => {
    expect(validateSpellLevels({ fire: ENTRY, ice: ENTRY })).toEqual([]);
  });

  it('rejects a key outside the roster', () => {
    expect(validateSpellLevels({ water: ENTRY } as unknown as SpellLevelTable)).toEqual([
      'spell levels: "water" is not a roster spell',
    ]);
  });

  it('rejects an own __proto__ key', () => {
    const table = JSON.parse('{"__proto__": {"2": "a", "3": "b"}}') as SpellLevelTable;
    expect(validateSpellLevels(table)).toEqual(['spell levels: "__proto__" is not a roster spell']);
  });

  it('rejects an empty or missing text', () => {
    expect(validateSpellLevels({ fire: { 2: '', 3: ENTRY[3] } })).toEqual([
      'spell levels: "fire" level 2 has no text',
    ]);
    expect(validateSpellLevels({ fire: { 2: ENTRY[2] } } as unknown as SpellLevelTable)).toEqual([
      'spell levels: "fire" level 3 has no text',
    ]);
  });

  it('rejects a text longer than the card shows in two lines', () => {
    const long = 'x'.repeat(SPELL_LEVEL_TEXT_MAX + 1);
    const [problem] = validateSpellLevels({ fire: { 2: long, 3: ENTRY[3] } });
    expect(problem).toMatch(
      new RegExp(
        `level 2 text is ${SPELL_LEVEL_TEXT_MAX + 1} characters, over ${SPELL_LEVEL_TEXT_MAX}`,
      ),
    );
    expect(
      validateSpellLevels({ fire: { 2: 'x'.repeat(SPELL_LEVEL_TEXT_MAX), 3: ENTRY[3] } }),
    ).toEqual([]);
  });

  it('rejects text that is not printable ASCII', () => {
    for (const text of ['Adds a blade‮', 'Adds\na blade', 'Adds a blаde']) {
      expect(validateSpellLevels({ fire: { 2: text, 3: ENTRY[3] } }), JSON.stringify(text)).toEqual(
        ['spell levels: "fire" level 2 text is not printable ASCII'],
      );
    }
  });
});
