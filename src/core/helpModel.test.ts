import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from '../config/animations';
import { ARENA_SIZE } from '../config/arena';
import { TEXTURE_KEYS } from '../config/colors';
import { GEM_XP_VALUE } from '../config/gems';
import {
  BOMB_DAMAGE,
  BOSS_EMBERS,
  CHEST_EMBERS,
  EMBER_DROPS,
  HEAL_AMOUNT,
  MAGNET_DURATION_MS,
} from '../config/pickups';
import { buildIconFrame } from '../config/buildIcons';
import { PASSIVES, type Passive } from '../config/passives';
import { ROSTER_SPELL_IDS, SPELLS_BY_ELEMENT, elementOf } from '../config/loadout';
import { rosterCards } from '../config/rosterCards';
import { SPELL_LEVEL_TEXT_MAX, SPELL_LEVELS, type SpellLevelTable } from '../config/spellLevels';
import { defaultControls, rebind } from './controls';
import {
  MAX_PASSIVE_HELP_ROWS,
  NO_RANK_CAP,
  MAX_SPELL_HELP_ROWS,
  aboutRowCount,
  clampHelpPage,
  groupChangelog,
  controlHelpRows,
  helpShoulderStep,
  passiveHelpPages,
  passiveHelpRows,
  pickupHelpRows,
  spellHelpPages,
  spellHelpRows,
} from './helpModel';
import { MAX_OFFER_SIZE } from './levelUp';
import { relicCountFor } from './pickups';

const row = (name: string) => {
  const found = pickupHelpRows().find((r) => r.name === name);
  if (!found) throw new Error(`no ${name} row`);
  return found;
};

describe('pickupHelpRows', () => {
  it('lists the seven pickups in the ticket order', () => {
    expect(pickupHelpRows().map((r) => r.name)).toEqual([
      'XP gem',
      'Ember',
      'Health',
      'Magnet',
      'Bomb',
      'Chest',
      'Relic',
    ]);
  });

  it('gives every row an idle clip the atlas defines and a placeholder texture', () => {
    const clips = new Set(ANIMATIONS.map((anim) => anim.name));
    for (const r of pickupHelpRows()) {
      expect(clips).toContain(r.clip);
      expect(TEXTURE_KEYS).toContain(r.texture);
    }
  });

  it('reads every number from the config the pickups use', () => {
    expect(row('XP gem').effect).toContain(`${GEM_XP_VALUE} XP`);
    expect(row('Ember').source).toContain(`every tank kill (worth ${EMBER_DROPS.tank.value})`);
    expect(row('Ember').source).toContain(`${BOSS_EMBERS} from the boss`);
    expect(row('Health').effect).toContain(`${HEAL_AMOUNT} HP`);
    expect(row('Magnet').effect).toContain(`${MAGNET_DURATION_MS / 1000} s`);
    expect(row('Bomb').effect).toContain(`${BOMB_DAMAGE} damage`);
    expect(row('Chest').effect).toContain(`${CHEST_EMBERS} Embers`);
    // CO-208: the count the map places, not a fixed one.
    expect(row('Relic').source).toBe(
      `${relicCountFor(ARENA_SIZE)} placed round the map at run start, more on bigger maps`,
    );
    expect(row('Relic').source).toMatch(/^5 /);
    expect(row('Relic').effect).toContain(`1 of ${MAX_OFFER_SIZE}`);
  });

  it('says the other kills only sometimes drop an Ember (#126: too many types to name)', () => {
    expect(row('Ember').source).toBe(
      `every tank kill (worth ${EMBER_DROPS.tank.value}); some other kills; ${BOSS_EMBERS} from the boss`,
    );
  });

  it('tells the magnet pickup apart from the Magnet passive', () => {
    expect(row('Magnet').effect).toContain('not the Magnet passive');
  });

  it('keeps each line short enough for one line of the 960 px screen', () => {
    for (const r of pickupHelpRows()) {
      expect(r.source.length).toBeLessThanOrEqual(90);
      expect(r.effect.length).toBeLessThanOrEqual(90);
    }
  });
});

describe('spellHelpRows', () => {
  it('lists exactly the spells whose levels have landed, in roster order: Fire, Ice, Lightning, then Earth', () => {
    expect(spellHelpRows().map((r) => r.id)).toEqual([
      ...SPELLS_BY_ELEMENT.fire,
      ...SPELLS_BY_ELEMENT.ice,
      ...SPELLS_BY_ELEMENT.lightning,
      ...SPELLS_BY_ELEMENT.earth,
    ]);
  });

  it('fits the panel: no page holds more rows than it has room for', () => {
    for (const page of spellHelpPages()) {
      expect(page.rows.length).toBeLessThanOrEqual(MAX_SPELL_HELP_ROWS);
    }
  });

  it('reads name, colour and description from the same card the level-up uses', () => {
    const cards = new Map(rosterCards().map((card) => [card.id, card]));
    for (const r of spellHelpRows()) {
      const card = cards.get(r.id);
      expect(r.name).toBe(card?.name);
      expect(r.description).toBe(card?.description);
      expect(r.color).toBe(card?.color);
    }
  });

  it('shows the very text the level-up card shows for levels 2 and 3', () => {
    for (const r of spellHelpRows()) {
      expect(r.lv2).toBe(SPELL_LEVELS[r.id]?.[2]);
      expect(r.lv3).toBe(SPELL_LEVELS[r.id]?.[3]);
    }
  });

  it('keeps each level inside the level text budget', () => {
    for (const r of spellHelpRows()) {
      expect(r.lv2.length).toBeLessThanOrEqual(SPELL_LEVEL_TEXT_MAX);
      expect(r.lv3.length).toBeLessThanOrEqual(SPELL_LEVEL_TEXT_MAX);
    }
  });

  it('follows the table it is given: only spells with an entry, in roster order', () => {
    const table: SpellLevelTable = {
      earth: { 2: 'Two.', 3: 'Three.' },
      ice: { 2: 'Ice two.', 3: 'Ice three.' },
    };
    expect(spellHelpRows(table).map((r) => r.id)).toEqual(['ice', 'earth']);
    expect(spellHelpRows({})).toEqual([]);
  });

  it('never invents a row for a key that is not a roster spell', () => {
    const table = { __proto__: null, water: { 2: 'x', 3: 'y' } } as unknown as SpellLevelTable;
    expect(spellHelpRows(table)).toEqual([]);
    expect(ROSTER_SPELL_IDS).not.toContain('water');
  });
});

describe('spellHelpPages', () => {
  const both: SpellLevelTable = {
    fire: { 2: 'Fire two.', 3: 'Fire three.' },
    ice: { 2: 'Ice two.', 3: 'Ice three.' },
  };

  it('is a Fire, an Ice, a Lightning then an Earth page while those are the elements with text', () => {
    const pages = spellHelpPages();
    expect(pages.map((p) => [p.element, p.title])).toEqual([
      ['fire', 'Fire'],
      ['ice', 'Ice'],
      ['lightning', 'Lightning'],
      ['earth', 'Earth'],
    ]);
    expect(pages[0]?.rows.map((r) => r.id)).toEqual(SPELLS_BY_ELEMENT.fire);
    expect(pages[1]?.rows.map((r) => r.id)).toEqual(SPELLS_BY_ELEMENT.ice);
    expect(pages[2]?.rows.map((r) => r.id)).toEqual(SPELLS_BY_ELEMENT.lightning);
    expect(pages[3]?.rows.map((r) => r.id)).toEqual(SPELLS_BY_ELEMENT.earth);
  });

  it('gives each element its own page, in element order, titled by the element', () => {
    const pages = spellHelpPages(both);
    expect(pages.map((p) => [p.element, p.title])).toEqual([
      ['fire', 'Fire'],
      ['ice', 'Ice'],
    ]);
    for (const page of pages) {
      expect(page.rows.length).toBeGreaterThan(0);
      expect(page.rows.length).toBeLessThanOrEqual(MAX_SPELL_HELP_ROWS);
      for (const r of page.rows) expect(elementOf(r.id), r.id).toBe(page.element);
    }
  });

  it('lists every row once, in spellHelpRows order', () => {
    const table: SpellLevelTable = { ...both, earth: { 2: 'E two.', 3: 'E three.' } };
    const paged = spellHelpPages(table).flatMap((p) => p.rows.map((r) => r.id));
    expect(paged).toEqual(spellHelpRows(table).map((r) => r.id));
    expect(new Set(paged).size).toBe(paged.length);
  });

  it('has no page for an empty table', () => {
    expect(spellHelpPages({})).toEqual([]);
  });
});

describe('clampHelpPage', () => {
  it('keeps a page that exists', () => {
    expect(clampHelpPage(0, 2)).toBe(0);
    expect(clampHelpPage(1, 2)).toBe(1);
  });

  it('clamps out-of-range pages to the nearest end', () => {
    expect(clampHelpPage(2, 2)).toBe(1);
    expect(clampHelpPage(Number.MAX_SAFE_INTEGER, 2)).toBe(1);
    expect(clampHelpPage(-1, 2)).toBe(0);
    expect(clampHelpPage(Number.NEGATIVE_INFINITY, 2)).toBe(0);
  });

  it('sends NaN, infinity and no pages to the first page, and truncates fractions', () => {
    expect(clampHelpPage(Number.NaN, 2)).toBe(0);
    expect(clampHelpPage(Number.POSITIVE_INFINITY, 2)).toBe(0);
    expect(clampHelpPage(1, 0)).toBe(0);
    expect(clampHelpPage(1.9, 3)).toBe(1);
  });
});

describe('groupChangelog (#377)', () => {
  const e = (version: string, line = 'x') => ({ version, line });

  it('puts entries of one version under a single heading', () => {
    const groups = groupChangelog([
      e('0.1.0', 'a'),
      e('0.1.0', 'b'),
      e('0.1.0', 'c'),
      e('0.1.0', 'd'),
      e('0.1.0', 'e'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.lines).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('starts a group at each change of version', () => {
    expect(groupChangelog([e('a'), e('a'), e('b')]).map((g) => g.lines.length)).toEqual([2, 1]);
  });

  it('merges only neighbours', () => {
    expect(groupChangelog([e('a'), e('b'), e('a')]).map((g) => g.version)).toEqual(['a', 'b', 'a']);
  });

  it('is empty for no entries', () => {
    expect(groupChangelog([])).toEqual([]);
  });

  it('counts a heading and every line as rows', () => {
    expect(aboutRowCount(groupChangelog([e('a'), e('a'), e('b')]))).toBe(5);
    expect(aboutRowCount([])).toBe(0);
  });
});

describe('passiveHelpRows (CO-238)', () => {
  const rows = passiveHelpRows();
  const rowOf = (id: string) => {
    const found = rows.find((r) => r.id === id);
    if (!found) throw new Error(`no ${id} row`);
    return found;
  };

  it('has one row per catalog passive, in catalog order', () => {
    expect(rows.map((r) => r.id)).toEqual(PASSIVES.map((p) => p.id));
  });

  it('gives every row an icon, its description and its cap', () => {
    for (const passive of PASSIVES) {
      const r = rowOf(passive.id);
      expect(buildIconFrame(passive.id), passive.id).toBeDefined();
      expect(r.name, passive.id).toBe(passive.name);
      expect(r.effect, passive.id).toContain(passive.description);
      expect(r.cap, passive.id).toBe(String(passive.maxRank));
    }
  });

  it('tells the Magnet passive from the Magnet pickup, and only that one', () => {
    expect(rowOf('passive_magnet').effect).toContain('Not the Magnet pickup.');
    expect(rows.filter((r) => r.effect.includes('Not the'))).toHaveLength(1);
    expect(row('Magnet').effect).toContain('not the Magnet passive');
  });

  it('keeps every line to 90 characters or fewer', () => {
    for (const r of rows) {
      expect(r.effect.length, r.id).toBeLessThanOrEqual(90);
      expect(r.cap.length, r.id).toBeLessThanOrEqual(90);
    }
  });

  it('shows a dash in the Max rank column for a passive without a maxRank', () => {
    const fake: Passive = {
      id: 'passive_fake',
      name: 'Fake',
      description: 'Does a thing.',
      field: 'damageMul',
      op: 'mul',
      amount: 1.1,
    };
    expect(passiveHelpRows([fake])[0]?.cap).toBe(NO_RANK_CAP);
  });
});

describe('passiveHelpPages (CO-238)', () => {
  const pages = passiveHelpPages();

  it('holds at most MAX_PASSIVE_HELP_ROWS rows a page, every row once, in order', () => {
    for (const page of pages) expect(page.rows.length).toBeLessThanOrEqual(MAX_PASSIVE_HELP_ROWS);
    expect(pages.flatMap((p) => p.rows.map((r) => r.id))).toEqual(PASSIVES.map((p) => p.id));
  });

  it('titles the pages Page 1, Page 2 and so on', () => {
    expect(pages.map((p) => p.title)).toEqual(pages.map((_, i) => `Page ${i + 1}`));
  });

  it('has no page for an empty catalog', () => {
    expect(passiveHelpPages([])).toEqual([]);
  });
});

describe('helpShoulderStep (#377, #384, CO-238)', () => {
  const counts = { spells: 3, passives: 2 };

  it('walks Pickups -> Spells pages -> Passives pages -> Controls -> About with RB', () => {
    expect(helpShoulderStep('pickups', 0, counts, 1)).toEqual({ view: 'spells', page: 0 });
    expect(helpShoulderStep('spells', 0, counts, 1)).toEqual({ view: 'spells', page: 1 });
    expect(helpShoulderStep('spells', 1, counts, 1)).toEqual({ view: 'spells', page: 2 });
    expect(helpShoulderStep('spells', 2, counts, 1)).toEqual({ view: 'passives', page: 0 });
    expect(helpShoulderStep('passives', 0, counts, 1)).toEqual({ view: 'passives', page: 1 });
    expect(helpShoulderStep('passives', 1, counts, 1)).toEqual({ view: 'controls' });
    expect(helpShoulderStep('controls', 0, counts, 1)).toEqual({ view: 'about' });
  });

  it('walks back with LB, landing on the last page of a paged tab', () => {
    expect(helpShoulderStep('about', 0, counts, -1)).toEqual({ view: 'controls' });
    expect(helpShoulderStep('controls', 0, counts, -1)).toEqual({ view: 'passives', page: 1 });
    expect(helpShoulderStep('passives', 1, counts, -1)).toEqual({ view: 'passives', page: 0 });
    expect(helpShoulderStep('passives', 0, counts, -1)).toEqual({ view: 'spells', page: 2 });
    expect(helpShoulderStep('spells', 2, counts, -1)).toEqual({ view: 'spells', page: 1 });
    expect(helpShoulderStep('spells', 0, counts, -1)).toEqual({ view: 'pickups' });
  });

  it('does not wrap at either end', () => {
    expect(helpShoulderStep('pickups', 0, counts, -1)).toBeNull();
    expect(helpShoulderStep('about', 0, counts, 1)).toBeNull();
  });

  it('does nothing on the feedback form', () => {
    expect(helpShoulderStep('feedback', 0, counts, 1)).toBeNull();
    expect(helpShoulderStep('feedback', 0, counts, -1)).toBeNull();
  });

  it('copes with a single page, or none', () => {
    const one = { spells: 1, passives: 1 };
    expect(helpShoulderStep('spells', 0, one, 1)).toEqual({ view: 'passives', page: 0 });
    expect(helpShoulderStep('passives', 0, one, 1)).toEqual({ view: 'controls' });
    expect(helpShoulderStep('controls', 0, one, -1)).toEqual({ view: 'passives', page: 0 });
    expect(helpShoulderStep('controls', 0, { spells: 1, passives: 0 }, -1)).toEqual({
      view: 'passives',
      page: 0,
    });
  });
});

describe('controlHelpRows (#384)', () => {
  const byAction = (action: string) => controlHelpRows().find((r) => r.action === action);

  it('lists Move, Dash, Pause, Mute, Level-up and Help tabs in that order', () => {
    expect(controlHelpRows().map((r) => r.action)).toEqual([
      'Move',
      'Dash',
      'Pause',
      'Mute',
      'Level-up',
      'Help tabs',
    ]);
  });

  it('names the default bindings', () => {
    expect(byAction('Move')).toMatchObject({
      keyboard: 'W A S D or arrow keys',
      gamepad: 'Left stick or D-pad',
    });
    expect(byAction('Dash')).toMatchObject({ keyboard: 'Space', gamepad: 'A' });
    expect(byAction('Pause')).toMatchObject({ keyboard: 'Esc', gamepad: 'Start' });
    expect(byAction('Mute')).toMatchObject({ keyboard: 'M', gamepad: 'Back' });
    expect(byAction('Level-up')).toMatchObject({
      keyboard: 'R reroll, S skip, B ban',
      gamepad: 'X reroll, RB skip, Y ban',
    });
    expect(byAction('Help tabs')).toMatchObject({ keyboard: 'Q / E', gamepad: 'LB / RB' });
  });

  it('names the current bindings, not the defaults (CO-226)', () => {
    let controls = defaultControls();
    for (const [action, key] of [
      ['moveUp', 'KeyI'],
      ['dash', 'ShiftLeft'],
      ['mute', 'KeyN'],
      ['helpNext', 'KeyP'],
    ] as const) {
      const result = rebind(controls, 'keyboard', action, key);
      if (result.ok) controls = result.controls;
    }
    const row = (action: string) =>
      controlHelpRows(undefined, controls).find((r) => r.action === action);
    expect(row('Move')?.keyboard).toBe('I A S D or arrow keys');
    expect(row('Dash')?.keyboard).toBe('Left Shift');
    expect(row('Mute')?.keyboard).toBe('N');
    expect(row('Help tabs')?.keyboard).toBe('Q / P');
  });

  it('reads the dash numbers from its stats', () => {
    const note = controlHelpRows({
      distancePx: 200,
      durationMs: 100,
      invulnMs: 100,
      cooldownMs: 1500,
    })[1]!.note;
    expect(note).toContain('200 px');
    expect(note).toContain('1.5 s');
    expect(byAction('Dash')?.note).toContain('120 px');
    expect(byAction('Dash')?.note).toContain('3 s');
  });
});
