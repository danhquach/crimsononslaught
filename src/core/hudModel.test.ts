import { describe, expect, it } from 'vitest';
import {
  INITIAL_HUD,
  applyRunEvent,
  bossBarVisible,
  formatTimer,
  fraction,
  passiveLines,
  shieldBarVisible,
  cooldownBadge,
  shortSpellName,
  slotLabel,
  slotRows,
  spellGlyph,
  type HudModel,
} from './hudModel';
import type { RunEventPayloads } from './runEvents';

const FIRE = { id: 'fire', name: 'Fire Bolt', color: 0xff4400, progress: 0.25, secondsLeft: 1.5 };
const COLUMN = {
  id: 'fire_column',
  name: 'Fire Column',
  color: 0xffaa00,
  progress: 0.75,
  secondsLeft: 0.5,
};
const FIRE_ROW = {
  kind: 'spell',
  name: 'Fire Bolt',
  label: 'Fire Bolt',
  glyph: 'FB',
  color: 0xff4400,
  ready: false,
  waiting: 0.75,
  badge: '1',
} as const;
const COLUMN_ROW = {
  kind: 'spell',
  name: 'Fire Column',
  label: 'Column',
  glyph: 'FC',
  color: 0xffaa00,
  ready: false,
  waiting: 0.25,
  badge: null,
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
    const payload = { spells: [FIRE, COLUMN], passives: [{ name: 'Haste', rank: 2 }] };
    const m = withLoadout(INITIAL_HUD, payload);
    expect(m.spells).toEqual([FIRE, COLUMN]);
    expect(m.passives).toEqual([{ name: 'Haste', rank: 2 }]);
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

describe('shieldBarVisible', () => {
  it('is hidden until a shield is equipped and shown once one is (#134)', () => {
    expect(shieldBarVisible(INITIAL_HUD)).toBe(false);
    const equipped = applyRunEvent(INITIAL_HUD, { name: 'shield', payload: { pool: 60, max: 60 } });
    expect(shieldBarVisible(equipped)).toBe(true);
    // A broken shield is still equipped, so the empty bar stays on screen.
    const broken = applyRunEvent(equipped, { name: 'shield', payload: { pool: 0, max: 60 } });
    expect(shieldBarVisible(broken)).toBe(true);
    expect(fraction(broken.shield, broken.shieldMax)).toBe(0);
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

  it('reads as open, not locked, before the first loadout event lands', () => {
    expect(slotRows(INITIAL_HUD).map((row) => row.kind)).toEqual(['open', 'locked', 'locked']);
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

describe('passiveLines', () => {
  it('lists each passive with its rank, in the order taken', () => {
    const m = withLoadout(INITIAL_HUD, {
      spells: [],
      passives: [
        { name: 'Haste', rank: 3 },
        { name: 'Power', rank: 1 },
      ],
    });
    expect(passiveLines(m)).toEqual(['Haste ×3', 'Power ×1']);
    expect(passiveLines(INITIAL_HUD)).toEqual([]);
  });
});
