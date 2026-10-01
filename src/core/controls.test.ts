import { describe, expect, it } from 'vitest';
import {
  ACTION_CONTEXTS,
  CONTROL_ACTIONS,
  DEFAULT_KEYS,
  DEFAULT_PAD,
  KEY_LABELS,
  MENU_ACTIONS,
  PAD_LABELS,
  RESERVED_KEYS,
  RESERVED_PAD,
  type ControlAction,
} from '../config/controls';
import {
  bindingLabel,
  defaultControls,
  dropUnknownControlKeys,
  joinLabels,
  keyBadge,
  keyLabel,
  menuSafe,
  moveLabel,
  padLabel,
  readControls,
  rebind,
  resetAll,
  resetDevice,
  writeControls,
  type Controls,
} from './controls';
import { emptySave, migrate, parseSave, serializeSave, type SaveSettings } from './save';

const settings = (json: string): SaveSettings => JSON.parse(json) as SaveSettings;

function must(result: ReturnType<typeof rebind>): {
  controls: Controls;
  moved: ControlAction[];
  note: string;
} {
  if (!result.ok) throw new Error(`refused: ${result.note}`);
  return result;
}

describe('defaults', () => {
  it('bind every action on both devices, inside the allow-lists', () => {
    for (const action of CONTROL_ACTIONS) {
      expect(Object.hasOwn(KEY_LABELS, DEFAULT_KEYS[action])).toBe(true);
      expect(DEFAULT_PAD[action]).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_PAD[action]).toBeLessThan(PAD_LABELS.length);
    }
  });

  it('read back from an empty save', () => {
    expect(readControls({})).toEqual(defaultControls());
  });

  it('keep reserved inputs off every menu action', () => {
    for (const action of MENU_ACTIONS) {
      expect(RESERVED_KEYS).not.toContain(DEFAULT_KEYS[action]);
      expect(RESERVED_PAD).not.toContain(DEFAULT_PAD[action]);
    }
  });

  it('have no clash inside a context', () => {
    expect(readControls(writeControls({}, defaultControls()))).toEqual(defaultControls());
    expect(ACTION_CONTEXTS.mute).toHaveLength(3);
  });
});

describe('labels', () => {
  it('names keys and buttons', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel('Digit4')).toBe('4');
    expect(keyLabel('toString')).toBe('?');
    expect(padLabel(5)).toBe('RB');
    expect(padLabel(99)).toBe('?');
  });

  it('names an action binding and the movement', () => {
    const c = defaultControls();
    expect(bindingLabel(c, 'keyboard', 'mute')).toBe('M');
    expect(bindingLabel(c, 'pad', 'mute')).toBe('Back');
    expect(moveLabel(c, 'keyboard')).toBe('W A S D or arrow keys');
    expect(moveLabel(c, 'pad')).toBe('Left stick or D-pad');
    const moved = must(rebind(c, 'keyboard', 'moveUp', 'KeyI')).controls;
    expect(moveLabel(moved, 'keyboard')).toBe('I A S D or arrow keys');
    const pad = must(rebind(c, 'pad', 'moveUp', 7)).controls;
    expect(moveLabel(pad, 'pad')).toBe('Left stick or RT D-pad left D-pad down D-pad right');
  });
});

describe('keyBadge', () => {
  it('keeps short labels and shortens long ones', () => {
    expect(keyBadge('KeyR')).toBe('R');
    expect(keyBadge('Space')).toBe('Spa');
    expect(keyBadge('Home')).toBe('Home');
    expect(keyBadge('ShiftLeft')).toBe('LS');
    expect(keyBadge('NumpadEnter')).toBe('NE');
    expect(keyBadge('Backspace')).toBe('Bac');
    expect(keyBadge('toString')).toBe('?');
    for (const code of Object.keys(KEY_LABELS))
      expect(keyBadge(code).length).toBeLessThanOrEqual(4);
  });
});

describe('joinLabels', () => {
  it('lists labels once each', () => {
    expect(joinLabels(['Esc', 'Esc', 'Start', 'B'])).toBe('Esc, Start or B');
    expect(joinLabels(['Esc', 'P'])).toBe('Esc or P');
    expect(joinLabels(['Esc', 'Esc'])).toBe('Esc');
    expect(joinLabels([])).toBe('');
  });
});

describe('menuSafe', () => {
  it('is false for the menus own inputs and true for the rest', () => {
    expect(menuSafe('keyboard', 'Escape')).toBe(false);
    expect(menuSafe('keyboard', 'Enter')).toBe(false);
    expect(menuSafe('keyboard', 'Digit2')).toBe(false);
    expect(menuSafe('keyboard', 'KeyP')).toBe(true);
    expect(menuSafe('pad', 0)).toBe(false);
    expect(menuSafe('pad', 12)).toBe(false);
    expect(menuSafe('pad', 9)).toBe(true);
  });
});

describe('write and read', () => {
  it('round-trips a rebinding and keeps other settings', () => {
    const c = must(rebind(defaultControls(), 'keyboard', 'moveUp', 'KeyI')).controls;
    const written = writeControls({ 'audio.master': 0.3 }, c);
    expect(written['audio.master']).toBe(0.3);
    expect(written['controls.key.moveUp']).toBe('KeyI');
    expect(readControls(written)).toEqual(c);
  });

  it('survives a save serialise and parse', () => {
    const c = must(rebind(defaultControls(), 'pad', 'dash', 7)).controls;
    const save = { ...emptySave(), settings: writeControls({}, c) };
    const parsed = parseSave(serializeSave(save));
    expect(parsed.status).toBe('ok');
    expect(readControls(parsed.save.settings)).toEqual(c);
  });

  it('resets only the device with a bad value', () => {
    const c = must(rebind(defaultControls(), 'pad', 'dash', 7)).controls;
    const written = { ...writeControls({}, c), 'controls.key.moveUp': 'NotAKey' };
    const read = readControls(written);
    expect(read.keyboard).toEqual(DEFAULT_KEYS);
    expect(read.pad).toEqual(c.pad);
  });

  it('resets a device with a clash inside a context', () => {
    const read = readControls({ 'controls.key.moveUp': 'KeyD' });
    expect(read.keyboard).toEqual(DEFAULT_KEYS);
  });

  it('allows a shared key across contexts', () => {
    expect(readControls({ 'controls.key.reroll': 'KeyW' }).keyboard.reroll).toBe('KeyW');
  });

  it('resets a device with a reserved input on a menu action, but allows it on a game action', () => {
    expect(readControls({ 'controls.key.mute': 'Escape' }).keyboard).toEqual(DEFAULT_KEYS);
    expect(readControls({ 'controls.pad.reroll': 0 }).pad).toEqual(DEFAULT_PAD);
    expect(readControls({ 'controls.key.dash': 'Enter' }).keyboard.dash).toBe('Enter');
    expect(readControls({ 'controls.pad.dash': 12, 'controls.pad.moveUp': 0 }).pad.dash).toBe(12);
  });

  it('resets a device that binds an arrow key', () => {
    expect(readControls({ 'controls.key.moveUp': 'ArrowUp' }).keyboard).toEqual(DEFAULT_KEYS);
  });
});

describe('hostile saved bindings', () => {
  const hostile: unknown[] = [
    'toString',
    'constructor',
    '__proto__',
    'hasOwnProperty',
    '',
    ' KeyW',
    'KeyW ',
    'keyw',
    'KEYW',
    'ＫｅｙＷ',
    'Key​W',
    '‮KeyW',
    'KeyА',
    'Tab',
    'MetaLeft',
    'F5',
    'x'.repeat(1_000_000),
    7,
    true,
    null,
    [],
    {},
    { __proto__: { x: 1 } },
  ];

  it.each(hostile.map((value, i) => [i, value]))(
    'keyboard value #%i falls back to the defaults',
    (_i, value) => {
      const read = readControls({ 'controls.key.moveUp': value as string });
      expect(read.keyboard).toEqual(DEFAULT_KEYS);
      expect(read.pad).toEqual(DEFAULT_PAD);
    },
  );

  const hostilePad: unknown[] = [
    Number.NaN,
    Infinity,
    -Infinity,
    1.5,
    -1,
    16,
    99,
    1e21,
    '3',
    '0',
    true,
    null,
    [3],
    '__proto__',
  ];

  it.each(hostilePad.map((value, i) => [i, value]))(
    'pad value #%i falls back to the defaults',
    (_i, value) => {
      const read = readControls({ 'controls.pad.dash': value as number });
      expect(read.pad).toEqual(DEFAULT_PAD);
      expect(read.keyboard).toEqual(DEFAULT_KEYS);
    },
  );

  it('survives a __proto__ key in the JSON without touching the prototype', () => {
    const saved = settings(
      '{"__proto__":{"controls.key.moveUp":"KeyI"},"controls.key.__proto__":"KeyI","controls.pad.constructor":3}',
    );
    const kept = dropUnknownControlKeys(saved);
    expect(readControls(kept)).toEqual(defaultControls());
    expect(readControls(saved)).toEqual(defaultControls());
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)['controls.key.moveUp']).toBeUndefined();
  });

  it('does not read an inherited setting', () => {
    const settingsWithProto = Object.create({ 'controls.key.moveUp': 'KeyI' }) as SaveSettings;
    expect(readControls(settingsWithProto)).toEqual(defaultControls());
  });
});

describe('dropUnknownControlKeys', () => {
  it('keeps valid bindings and every non-controls key', () => {
    const saved: SaveSettings = {
      'controls.key.moveUp': 'KeyI',
      'controls.pad.dash': 7,
      'audio.master': 0.3,
      'minimap.on': true,
    };
    expect(dropUnknownControlKeys(saved)).toEqual(saved);
  });

  it('drops unknown actions, devices, look-alikes and invisible characters', () => {
    const saved: SaveSettings = {
      'controls.key.moveUp': 'KeyI',
      'controls.key.evil': 'KeyI',
      'controls.key.__proto__': 'KeyI',
      'controls.key.constructor': 'KeyI',
      'controls.key.moveUp​': 'KeyI',
      'controls.key.‮moveUp': 'KeyI',
      'controls.key.mоveUp': 'KeyI',
      'controls.mouse.moveUp': 'KeyI',
      'controls.moveUp': 'KeyI',
      'controls.': 'KeyI',
      'Controls.key.moveUp': 'KeyI',
      [`controls.key.${'a'.repeat(100_000)}`]: 'KeyI',
    };
    expect(Object.keys(dropUnknownControlKeys(saved)).sort()).toEqual([
      'Controls.key.moveUp',
      'controls.key.moveUp',
    ]);
  });

  it('drops a known key whose value is off its allow-list or the wrong type', () => {
    const saved: SaveSettings = {
      'controls.key.moveUp': 'Tab',
      'controls.key.moveDown': 3,
      'controls.key.moveLeft': true,
      'controls.pad.dash': 16,
      'controls.pad.pause': '9',
      'controls.pad.mute': 1.5,
      'controls.pad.skip': 5,
    };
    expect(dropUnknownControlKeys(saved)).toEqual({ 'controls.pad.skip': 5 });
  });

  it('leaves none of 10,000 junk controls keys', () => {
    const saved: SaveSettings = {};
    for (let i = 0; i < 10_000; i++) saved[`controls.junk${i}`] = 'KeyW';
    expect(dropUnknownControlKeys(saved)).toEqual({});
  });

  it('runs on load through migrate', () => {
    const data = {
      ...emptySave(),
      settings: {
        'controls.key.moveUp': 'KeyI',
        'controls.key.evil': 'KeyI',
        'controls.pad.dash': 99,
      },
    };
    const migrated = migrate(data);
    expect(migrated.ok && migrated.save.settings).toEqual({ 'controls.key.moveUp': 'KeyI' });
  });
});

describe('rebind', () => {
  it('moves one action to a free key with no note', () => {
    const result = must(rebind(defaultControls(), 'keyboard', 'moveUp', 'KeyI'));
    expect(result.controls.keyboard.moveUp).toBe('KeyI');
    expect(result.moved).toEqual([]);
    expect(result.note).toBe('');
  });

  it('swaps with a holder in the same context and says so', () => {
    const result = must(rebind(defaultControls(), 'keyboard', 'moveUp', 'KeyS'));
    expect(result.controls.keyboard.moveUp).toBe('KeyS');
    expect(result.controls.keyboard.moveDown).toBe('KeyW');
    expect(result.moved).toEqual(['moveDown']);
    expect(result.note).toBe('Move down moved to W');
  });

  it('leaves a holder in another context alone', () => {
    const result = must(rebind(defaultControls(), 'keyboard', 'reroll', 'KeyW'));
    expect(result.controls.keyboard.reroll).toBe('KeyW');
    expect(result.controls.keyboard.moveUp).toBe('KeyW');
    expect(result.moved).toEqual([]);
  });

  it('swaps mute with a game action and a level-up action alike', () => {
    const result = must(rebind(defaultControls(), 'keyboard', 'mute', 'KeyS'));
    expect(result.controls.keyboard.mute).toBe('KeyS');
    expect(result.controls.keyboard.moveDown).toBe('KeyM');
    expect(result.controls.keyboard.skip).toBe('KeyM');
    expect(result.moved).toEqual(['moveDown', 'skip']);
  });

  it('swaps a pad button and names it', () => {
    const result = must(rebind(defaultControls(), 'pad', 'reroll', 3));
    expect(result.controls.pad.reroll).toBe(3);
    expect(result.controls.pad.ban).toBe(2);
    expect(result.note).toBe('Ban moved to X');
  });

  it('is a no-op for the binding it already has', () => {
    const c = defaultControls();
    const result = must(rebind(c, 'keyboard', 'moveUp', 'KeyW'));
    expect(result.controls).toEqual(c);
    expect(result.moved).toEqual([]);
    expect(result.note).toBe('');
  });

  it('refuses a key off the allow-list', () => {
    for (const input of [
      'Tab',
      'MetaLeft',
      'F5',
      'CapsLock',
      'toString',
      '__proto__',
      '',
      7,
      null,
    ]) {
      expect(rebind(defaultControls(), 'keyboard', 'moveUp', input).ok).toBe(false);
    }
    for (const input of [16, -1, 1.5, Number.NaN, '3', null]) {
      expect(rebind(defaultControls(), 'pad', 'dash', input).ok).toBe(false);
    }
  });

  it('refuses an arrow key with its own note', () => {
    const result = rebind(defaultControls(), 'keyboard', 'moveUp', 'ArrowLeft');
    expect(result).toEqual({ ok: false, note: 'Arrow keys are fixed for movement and menus.' });
  });

  it('refuses a reserved input on a menu action but allows it on a game action', () => {
    const c = defaultControls();
    expect(rebind(c, 'keyboard', 'mute', 'Enter').ok).toBe(false);
    expect(rebind(c, 'keyboard', 'reroll', 'Digit1').ok).toBe(false);
    expect(rebind(c, 'keyboard', 'helpNext', 'Escape').ok).toBe(false);
    expect(rebind(c, 'pad', 'ban', 0).ok).toBe(false);
    expect(rebind(c, 'pad', 'mute', 12).ok).toBe(false);
    expect(rebind(c, 'keyboard', 'dash', 'Enter').ok).toBe(true);
    expect(rebind(c, 'pad', 'moveUp', 0).ok).toBe(true);
  });

  it('refuses a swap that would hand a menu action a reserved input', () => {
    // Pause holds Esc; taking M from Mute would give Mute the Esc.
    const result = rebind(defaultControls(), 'keyboard', 'pause', 'KeyM');
    expect(result.ok).toBe(false);
    expect(result.note).toContain('Mute');
  });

  it('never changes the controls it is given', () => {
    const c = defaultControls();
    const before = JSON.stringify(c);
    rebind(c, 'keyboard', 'moveUp', 'KeyS');
    rebind(c, 'pad', 'dash', 7);
    rebind(c, 'keyboard', 'mute', 'Enter');
    expect(JSON.stringify(c)).toBe(before);
  });

  it('keeps every action bound and valid after a long run of rebinds', () => {
    let c = defaultControls();
    const keys = Object.keys(KEY_LABELS);
    for (let i = 0; i < 400; i++) {
      const action = CONTROL_ACTIONS[(i * 7) % CONTROL_ACTIONS.length] as ControlAction;
      const key = keys[(i * 13) % keys.length] as string;
      const result = rebind(c, 'keyboard', action, key);
      if (result.ok) c = result.controls;
      const padResult = rebind(c, 'pad', action, (i * 5) % 16);
      if (padResult.ok) c = padResult.controls;
      expect(readControls(writeControls({}, c))).toEqual(c);
    }
  });
});

describe('resets', () => {
  it('resets one device and keeps the other', () => {
    let c = must(rebind(defaultControls(), 'keyboard', 'moveUp', 'KeyI')).controls;
    c = must(rebind(c, 'pad', 'dash', 7)).controls;
    const keyboard = resetDevice(c, 'keyboard');
    expect(keyboard.keyboard).toEqual(DEFAULT_KEYS);
    expect(keyboard.pad.dash).toBe(7);
    const pad = resetDevice(c, 'pad');
    expect(pad.pad).toEqual(DEFAULT_PAD);
    expect(pad.keyboard.moveUp).toBe('KeyI');
  });

  it('resets everything', () => {
    expect(resetAll()).toEqual(defaultControls());
  });
});
