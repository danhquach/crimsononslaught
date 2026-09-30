import { describe, expect, it } from 'vitest';
import {
  BASE_FIRE_DRAGON_STATS,
  BASE_FIRE_WAVE_STATS,
  FIRE_ROSTER_CARDS,
} from '../config/fireRoster';
import type { SpellStatBlock } from '../config/spellFields';
import {
  SPELL_LEVEL_STATS,
  type SpellLevelStatTable,
  type SpellLevelTable,
} from '../config/spellLevels';
import { BASE_SPELL_STATS, SPELL_CARDS } from '../config/spells';
import { buildLoadout } from './loadout';
import { Spell } from './spell';
import { applyLevelStats, levelStatAdds, validateSpellLevelStats } from './spellLevelStats';
import { Spellbook } from './spellbook';
import type { SpellStatsBySpell } from './spellStats';

const TABLE: SpellLevelStatTable = {
  fire: { 2: { projectiles: 1 }, 3: { projectiles: 2, range: 20 } },
};

const TEXTS: SpellLevelTable = { fire: { 2: 'Two bolts.', 3: 'More bolts.' } };

const baseFor = (id: string): SpellStatBlock | undefined =>
  id === 'fire' ? BASE_SPELL_STATS.fire : undefined;

describe('levelStatAdds (#327)', () => {
  it('adds nothing at level 1', () => {
    expect(levelStatAdds(TABLE, 'fire', 1)).toEqual({});
  });

  it('adds level 2 at level 2, and level 3 on top at level 3 (cumulative)', () => {
    expect(levelStatAdds(TABLE, 'fire', 2)).toEqual({ projectiles: 1 });
    expect(levelStatAdds(TABLE, 'fire', 3)).toEqual({ projectiles: 3, range: 20 });
  });

  it('adds nothing for a spell without a row, or one named off the prototype chain', () => {
    expect(levelStatAdds(TABLE, 'ice', 3)).toEqual({});
    expect(levelStatAdds({}, 'toString' as never, 3)).toEqual({});
  });
});

describe('applyLevelStats (#327)', () => {
  it('returns the base values unchanged with no adds', () => {
    expect(applyLevelStats(BASE_SPELL_STATS.fire, {})).toEqual(BASE_SPELL_STATS.fire);
  });

  it('adds to a field the base carries', () => {
    const out = applyLevelStats(BASE_SPELL_STATS.fire, { projectiles: 1 });
    expect(out.projectiles).toBe((BASE_SPELL_STATS.fire.projectiles ?? 0) + 1);
    expect(out.damage).toBe(BASE_SPELL_STATS.fire.damage);
  });

  it('never creates a field the base lacks', () => {
    const out = applyLevelStats({ damage: 5 }, { arc: 55 });
    expect(out).toEqual({ damage: 5 });
    expect('arc' in out).toBe(false);
  });

  it('does not change the base block it was given', () => {
    const base = { ...BASE_SPELL_STATS.fire };
    applyLevelStats(base, { projectiles: 1 });
    expect(base).toEqual(BASE_SPELL_STATS.fire);
  });
});

describe('validateSpellLevelStats (#327)', () => {
  it('passes a well-formed table', () => {
    expect(validateSpellLevelStats(TABLE, baseFor, TEXTS)).toEqual([]);
  });

  it('flags a field the spell does not carry', () => {
    const table: SpellLevelStatTable = { fire: { 2: { arc: 55 } } };
    expect(validateSpellLevelStats(table, baseFor, TEXTS)).toHaveLength(1);
  });

  it('flags __proto__, an unknown id and a non-roster key', () => {
    const table = JSON.parse('{"__proto__": {"2": {"projectiles": 1}}, "nope": {}}');
    expect(validateSpellLevelStats(table, baseFor, TEXTS).length).toBeGreaterThanOrEqual(2);
  });

  it('flags a level other than 2 or 3', () => {
    const table = { fire: { 1: { projectiles: 1 } } } as unknown as SpellLevelStatTable;
    expect(validateSpellLevelStats(table, baseFor, TEXTS)).toHaveLength(1);
  });

  it('flags NaN, Infinity, zero and negative values', () => {
    for (const value of [NaN, Infinity, -1, 0]) {
      const table: SpellLevelStatTable = { fire: { 2: { projectiles: value } } };
      expect(validateSpellLevelStats(table, baseFor, TEXTS), String(value)).toHaveLength(1);
    }
  });

  it('flags a spell with stat adds and no level text', () => {
    expect(validateSpellLevelStats(TABLE, baseFor, {})).toHaveLength(1);
  });
});

describe('Spellbook stat adds (#327)', () => {
  class Stub extends Spell {
    protected cast(): void {}
  }
  const build = (
    table: SpellLevelStatTable,
    base: SpellStatBlock,
    loadout = buildLoadout('fire'),
  ) =>
    new Spellbook(
      loadout,
      (id, stats) => new Stub(id as 'fire', stats as SpellStatsBySpell['fire']),
      () => base,
      table,
    );

  it('gives Fire Bolt 2 projectiles at level 2', () => {
    const spells = build(TABLE, BASE_SPELL_STATS.fire);
    const fire = spells.equip('fire');
    expect(fire?.stats).toMatchObject({ projectiles: 1 });
    spells.upgradeSpell('fire');
    expect(fire?.stats).toMatchObject({ projectiles: 2 });
  });

  it('gives Fire Dragon 2 dragons at level 2 and 3 at level 3', () => {
    const base = BASE_FIRE_DRAGON_STATS.projectiles;
    for (const [level, dragons] of [
      [1, 1],
      [2, 2],
      [3, 3],
    ] as const) {
      const adds = levelStatAdds(SPELL_LEVEL_STATS, 'fire_dragon', level);
      expect(base + (adds.projectiles ?? 0), `level ${level}`).toBe(dragons);
    }
  });

  it('is not multiplied by a passive: the add lands on unscaled fields', () => {
    const wave = { cooldown: 2, damage: 10, arc: 95, range: 100 };
    const spells = build({ fire_column: { 2: { arc: 55 } } }, wave);
    const spell = spells.equip('fire_column' as never);
    spells.upgradeSpell('fire_column');
    spells.takePassive('passive_expanse');
    spells.takePassive('passive_power');
    expect(spell?.stats).toMatchObject({ arc: 150 });
  });
});

describe('level-1 cards (#327)', () => {
  it('still read the base block: a level never rewrites the card stats', () => {
    const arc = FIRE_ROSTER_CARDS.fire_column.stats.find(([label]) => label === 'Arc');
    expect(arc?.[1]).toBe(`${BASE_FIRE_WAVE_STATS.arc}°`);
    expect(SPELL_CARDS.fire.stats).toContainEqual([
      'Projectiles',
      String(BASE_SPELL_STATS.fire.projectiles),
    ]);
  });
});
