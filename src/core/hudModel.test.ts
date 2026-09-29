import { describe, expect, it } from 'vitest';
import {
  INITIAL_HUD,
  applyRunEvent,
  bossBarVisible,
  formatTimer,
  fraction,
  hpBarView,
  cooldownBadge,
  shortSpellName,
  slotLabel,
  slotRows,
  spellGlyph,
  type HudModel,
} from './hudModel';
import type { RunEventPayloads } from './runEvents';

const FIRE = {
  id: 'fire',
  name: 'Fire Bolt',
  color: 0xff4400,
  progress: 0.25,
  secondsLeft: 1.5,
  level: 1,
};
const COLUMN = {
  id: 'fire_column',
  name: 'Fire Column',
  color: 0xffaa00,
  progress: 0.75,
  secondsLeft: 0.5,
  level: 2,
};
const FIRE_ROW = {
  kind: 'spell',
  id: 'fire',
  name: 'Fire Bolt',
  label: 'Fire Bolt',
  glyph: 'FB',
  color: 0xff4400,
  ready: false,
  waiting: 0.75,
  badge: '1',
  level: 1,
  maxed: false,
  levelBadge: '1',
} as const;
const COLUMN_ROW = {
  kind: 'spell',
  id: 'fire_column',
  name: 'Fire Column',
  label: 'Column',
  glyph: 'FC',
  color: 0xffaa00,
  ready: false,
  waiting: 0.25,
  badge: null,
  level: 2,
  maxed: false,
  levelBadge: '2',
} as const;

function withLoadout(model: Readonly<HudModel>, payload: RunEventPayloads['loadout']): HudModel {
  return applyRunEvent(model, { name: 'loadout', payload });
}

function atLevel(level: number): HudModel {
  return applyRunEvent(INITIAL_HUD, { name: 'xp', payload: { xp: 0, xpToNext: 10, level } });
}

describe('formatTimer', () => {
  it('formats elapsed ms as m:ss, flooring to whole seconds', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(999)).toBe('0:00');
    expect(formatTimer(1000)).toBe('0:01');
    expect(formatTimer(59_999)).toBe('0:59');
    expect(formatTimer(60_000)).toBe('1:00');
    expect(formatTimer(300_000)).toBe('5:00');
    expect(formatTimer(605_000)).toBe('10:05');
  });

  it('clamps negative and non-finite input to 0:00', () => {
    expect(formatTimer(-5000)).toBe('0:00');
    expect(formatTimer(NaN)).toBe('0:00');
    expect(formatTimer(Infinity)).toBe('0:00');
  });
});

describe('fraction', () => {
  it('returns value / max clamped to [0, 1]', () => {
    expect(fraction(50, 100)).toBe(0.5);
    expect(fraction(100, 100)).toBe(1);
    expect(fraction(150, 100)).toBe(1);
    expect(fraction(-5, 100)).toBe(0);
    expect(fraction(0, 100)).toBe(0);
  });

  it('returns 0 when max is zero, negative or not a number', () => {
    expect(fraction(5, 0)).toBe(0);
    expect(fraction(5, -1)).toBe(0);
    expect(fraction(5, NaN)).toBe(0);
    expect(fraction(NaN, 100)).toBe(0);
  });
});

describe('applyRunEvent', () => {
  it('starts at run-start values (spec §5: HP 100, level 1, no kills, waves phase)', () => {
    expect(INITIAL_HUD).toEqual({
      elapsedMs: 0,
      hp: 100,
      maxHp: 100,
      xp: 0,
      xpToNext: 0,
      level: 1,
      kills: 0,
      embers: 0,
      phase: 'waves',
      bossHp: 0,
      bossMaxHp: 0,
      shield: 0,
      shieldMax: 0,
      spells: [],
      passives: [],
    });
  });

  it('timer sets elapsedMs', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'timer', payload: { elapsedMs: 61_500 } });
    expect(m.elapsedMs).toBe(61_500);
  });

  it('hp sets hp and maxHp', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'hp', payload: { hp: 37, maxHp: 120 } });
    expect(m.hp).toBe(37);
    expect(m.maxHp).toBe(120);
  });

  it('xp sets xp, xpToNext and level together', () => {
    const m = applyRunEvent(INITIAL_HUD, {
      name: 'xp',
      payload: { xp: 4, xpToNext: 20, level: 3 },
    });
    expect(m.xp).toBe(4);
    expect(m.xpToNext).toBe(20);
    expect(m.level).toBe(3);
  });

  it('kill sets the running kill count', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'kill', payload: { kills: 12 } });
    expect(m.kills).toBe(12);
  });

  it('embers sets the running Embers count (#195)', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'embers', payload: { embers: 42 } });
    expect(m.embers).toBe(42);
  });

  it('phase sets the run phase', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'phase', payload: { phase: 'boss' } });
    expect(m.phase).toBe('boss');
  });

  it('bossHp sets bossHp and bossMaxHp', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'bossHp', payload: { hp: 250, maxHp: 400 } });
    expect(m.bossHp).toBe(250);
    expect(m.bossMaxHp).toBe(400);
  });

  it('shield sets the pool and what a full one holds (#134)', () => {
    const m = applyRunEvent(INITIAL_HUD, { name: 'shield', payload: { pool: 24, max: 60 } });
    expect(m.shield).toBe(24);
    expect(m.shieldMax).toBe(60);
  });

  it('loadout sets the spells casting and the passives held (#144)', () => {
    const passives = [{ id: 'passive_haste', name: 'Haste', rank: 2 }];
    const m = withLoadout(INITIAL_HUD, { spells: [FIRE, COLUMN], passives });
    expect(m.spells).toEqual([FIRE, COLUMN]);
    expect(m.passives).toEqual(passives);
  });

  it('leaves unrelated fields untouched and never mutates its input', () => {
    const before: HudModel = { ...INITIAL_HUD, kills: 7, level: 2 };
    const frozen = Object.freeze({ ...before });
    const after = applyRunEvent(frozen, { name: 'timer', payload: { elapsedMs: 1000 } });
    expect(after).toEqual({ ...before, elapsedMs: 1000 });
    expect(frozen).toEqual(before);
    expect(after).not.toBe(frozen);
  });
});

describe('hpBarView (CO-195)', () => {
  const hud = (hp: number, maxHp: number, shield: number, shieldMax: number): HudModel => ({
    ...INITIAL_HUD,
    hp,
    maxHp,
    shield,
    shieldMax,
  });

  it('is HP alone with no shield equipped', () => {
    expect(hpBarView(hud(70, 100, 0, 0))).toEqual({
      hp: 0.7,
      shield: 0,
      hpText: 'HP 70 / 100',
      shieldText: '',
    });
  });

  it('is HP alone while an equipped shield is broken', () => {
    expect(hpBarView(hud(70, 100, 0, 60))).toEqual(hpBarView(hud(70, 100, 0, 0)));
  });

  it('draws the shield right after the red while there is room for both', () => {
    expect(hpBarView(hud(70, 100, 20, 60))).toEqual({
      hp: 0.7,
      shield: 0.2,
      hpText: 'HP 70',
      shieldText: '+20',
    });
  });

  it('shrinks the red on full HP so the shield fills the end, never past it', () => {
    const view = hpBarView(hud(100, 100, 25, 60));
    expect(view.hp).toBeCloseTo(0.8);
    expect(view.shield).toBeCloseTo(0.2);
    expect(view.hp + view.shield).toBeLessThanOrEqual(1);
  });

  it('drains the ice first, easing back to HP alone with no jump when it breaks', () => {
    let last = hpBarView(hud(100, 100, 30, 60));
    for (let shield = 29; shield >= 0; shield--) {
      const next = hpBarView(hud(100, 100, shield, 60));
      expect(next.shield).toBeLessThan(last.shield);
      // The red grows back by at most one shield point's share each step.
      expect(next.hp - last.hp).toBeGreaterThanOrEqual(0);
      expect(next.hp - last.hp).toBeLessThan(0.01);
      last = next;
    }
    expect(last).toEqual(hpBarView(hud(100, 100, 0, 0)));
  });

  it('rounds partial points up, as the HP label always has', () => {
    expect(hpBarView(hud(69.2, 100, 0.4, 60))).toMatchObject({
      hpText: 'HP 70',
      shieldText: '+1',
    });
  });

  it('keeps both shares in [0, 1] on hostile numbers', () => {
    const cases: [number, number, number][] = [
      [-5, 100, 10],
      [NaN, 100, 10],
      [50, 0, 10],
      [50, 100, Infinity],
      [50, NaN, 10],
    ];
    for (const [hp, maxHp, shield] of cases) {
      const view = hpBarView(hud(hp, maxHp, shield, 60));
      for (const share of [view.hp, view.shield]) {
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
      }
      expect(view.hp + view.shield).toBeLessThanOrEqual(1);
    }
  });
});

describe('bossBarVisible', () => {
  it('is hidden in waves, shown in boss, hidden again once the run is over', () => {
    expect(bossBarVisible(INITIAL_HUD)).toBe(false);
    const boss = applyRunEvent(INITIAL_HUD, { name: 'phase', payload: { phase: 'boss' } });
    expect(bossBarVisible(boss)).toBe(true);
    const over = applyRunEvent(boss, { name: 'phase', payload: { phase: 'over' } });
    expect(bossBarVisible(over)).toBe(false);
  });
});

describe('slotRows', () => {
  it('shows the default spell, then both slots locked with their unlock levels at level 1', () => {
    const m = withLoadout(INITIAL_HUD, { spells: [FIRE], passives: [] });
    expect(slotRows(m)).toEqual([
      FIRE_ROW,
      { kind: 'locked', unlockLevel: 2 },
      { kind: 'locked', unlockLevel: 5 },
    ]);
  });

  it('opens a slot on the level that unlocks it, and fills it with the pick', () => {
    const level2 = withLoadout(atLevel(2), { spells: [FIRE], passives: [] });
    expect(slotRows(level2).map((row) => row.kind)).toEqual(['spell', 'open', 'locked']);
    const level5 = withLoadout(atLevel(5), { spells: [FIRE], passives: [] });
    expect(slotRows(level5).map((row) => row.kind)).toEqual(['spell', 'open', 'open']);
    const picked = withLoadout(level5, { spells: [FIRE, COLUMN], passives: [] });
    expect(slotRows(picked)).toEqual([FIRE_ROW, COLUMN_ROW, { kind: 'open' }]);
  });

  it('gives every casting spell an icon, even past three (the ?loadout= hook casts without slots)', () => {
    const fourth = { ...COLUMN, id: 'fire_meteor', name: 'Meteor' };
    const third = {
      ...COLUMN,
      id: 'fire_dragon',
      name: 'Fire Dragon',
      progress: null,
      secondsLeft: null,
    };
    const m = withLoadout(INITIAL_HUD, { spells: [FIRE, COLUMN, third, fourth], passives: [] });
    expect(slotRows(m).map(slotLabel)).toEqual(['Fire Bolt', 'Column', 'Dragon', 'Meteor']);
  });

  it('sweeps from fully dark right after a cast to clear when ready', () => {
    const at = (progress: number, secondsLeft: number) =>
      slotRows(
        withLoadout(INITIAL_HUD, { spells: [{ ...FIRE, progress, secondsLeft }], passives: [] }),
      )[0];
    expect(at(0, 2)).toMatchObject({ ready: false, waiting: 1, badge: '2' });
    expect(at(0.5, 1)).toMatchObject({ ready: false, waiting: 0.5, badge: '1' });
    expect(at(0.9, 0.2)).toMatchObject({ ready: false, waiting: expect.closeTo(0.1), badge: null });
    expect(at(1, 0)).toMatchObject({ ready: true, waiting: 0, badge: null });
  });

  it('reads a spell with no cooldown (an orbit, a shield) as always ready', () => {
    const orbit = { ...FIRE, progress: null, secondsLeft: null };
    const [row] = slotRows(withLoadout(INITIAL_HUD, { spells: [orbit], passives: [] }));
    expect(row).toMatchObject({ kind: 'spell', ready: true, waiting: 0, badge: null });
  });

  it('keeps the sweep in [0, 1] whatever progress it is handed', () => {
    for (const progress of [-1, 2, Number.NaN]) {
      const [row] = slotRows(
        withLoadout(INITIAL_HUD, { spells: [{ ...FIRE, progress }], passives: [] }),
      );
      expect(row?.kind === 'spell' && row.waiting).toBeGreaterThanOrEqual(0);
      expect(row?.kind === 'spell' && row.waiting).toBeLessThanOrEqual(1);
    }
  });

  it('carries the id for the icon art and the glyph for a spell with none', () => {
    const unknown = { ...FIRE, id: 'not_a_spell', name: 'Mystery Bolt' };
    const [row] = slotRows(withLoadout(INITIAL_HUD, { spells: [unknown], passives: [] }));
    expect(row).toMatchObject({ kind: 'spell', id: 'not_a_spell', glyph: 'MB' });
  });

  it('reads as open, not locked, before the first loadout event lands', () => {
    expect(slotRows(INITIAL_HUD).map((row) => row.kind)).toEqual(['open', 'locked', 'locked']);
  });
});

describe('slotRows spell levels (#326)', () => {
  const rowAt = (level: number) =>
    slotRows(withLoadout(INITIAL_HUD, { spells: [{ ...FIRE, level }], passives: [] }))[0];

  it('reads the level for the pill, and MAX at the top one', () => {
    expect(rowAt(1)).toMatchObject({ level: 1, maxed: false, levelBadge: '1' });
    expect(rowAt(2)).toMatchObject({ level: 2, maxed: false, levelBadge: '2' });
    expect(rowAt(3)).toMatchObject({ level: 3, maxed: true, levelBadge: 'MAX' });
  });

  it('keeps each spell at its own level', () => {
    const m = withLoadout(INITIAL_HUD, {
      spells: [{ ...FIRE, level: 3 }, COLUMN],
      passives: [],
    });
    expect(slotRows(m).map((row) => (row.kind === 'spell' ? row.levelBadge : null))).toEqual([
      'MAX',
      '2',
      null,
    ]);
  });
});

describe('slotLabel', () => {
  it('names the spell, says open, or says locked with the unlock level (spec §10)', () => {
    expect(slotLabel(COLUMN_ROW)).toBe('Column');
    expect(slotLabel({ kind: 'open' })).toBe('Open');
    expect(slotLabel({ kind: 'locked', unlockLevel: 5 })).toBe('Lv 5');
  });
});

describe('shortSpellName', () => {
  it('keeps a name that fits, else its last word, else cuts it with an ellipsis', () => {
    expect(shortSpellName('Fire Bolt')).toBe('Fire Bolt');
    expect(shortSpellName('Earthquake')).toBe('Earthquake');
    expect(shortSpellName('Frost Nova Bomb')).toBe('Bomb');
    expect(shortSpellName('Lightning Companion')).toBe('Companion');
    expect(shortSpellName('Extraordinarily')).toBe('Extraordi…');
  });
});

describe('spellGlyph', () => {
  it('takes the first letters of the first two words', () => {
    expect(spellGlyph('Fire Bolt')).toBe('FB');
    expect(spellGlyph('Frost Nova Bomb')).toBe('FN');
    expect(spellGlyph('tornado')).toBe('T');
  });
});

describe('cooldownBadge', () => {
  it('shows whole seconds left, floored, and hides under one second', () => {
    expect(cooldownBadge(3.9)).toBe('3');
    expect(cooldownBadge(1)).toBe('1');
    expect(cooldownBadge(0.99)).toBeNull();
    expect(cooldownBadge(0)).toBeNull();
    expect(cooldownBadge(null)).toBeNull();
    expect(cooldownBadge(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
