/**
 * The rebindable controls (CO-226): the actions, their defaults, and the
 * allow-lists a saved binding is checked against. Pure data, no Phaser import;
 * `core/controls.ts` reads, validates and rebinds them.
 */

/** Every action a player can rebind, on the keyboard and on a controller alike. */
export const CONTROL_ACTIONS = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'dash',
  'pause',
  'mute',
  'reroll',
  'skip',
  'ban',
  'helpPrev',
  'helpNext',
] as const;

export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export type ControlDevice = 'keyboard' | 'pad';

export const ACTION_LABEL: Readonly<Record<ControlAction, string>> = {
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  dash: 'Dash',
  pause: 'Pause',
  mute: 'Mute',
  reroll: 'Reroll',
  skip: 'Skip',
  ban: 'Ban',
  helpPrev: 'Help tab ←',
  helpNext: 'Help tab →',
};

/** Where an action is live. Two actions clash only when they share a context. */
export type ControlContext = 'game' | 'levelUp' | 'help';

const ALL_CONTEXTS: readonly ControlContext[] = ['game', 'levelUp', 'help'];

export const ACTION_CONTEXTS: Readonly<Record<ControlAction, readonly ControlContext[]>> = {
  moveUp: ['game'],
  moveDown: ['game'],
  moveLeft: ['game'],
  moveRight: ['game'],
  dash: ['game'],
  pause: ['game'],
  // Mute works on every screen, so it clashes with everything.
  mute: ALL_CONTEXTS,
  reroll: ['levelUp'],
  skip: ['levelUp'],
  ban: ['levelUp'],
  helpPrev: ['help'],
  helpNext: ['help'],
};

/** The actions that act on a menu screen, not only in a run: they may never hold a reserved input. */
export const MENU_ACTIONS: readonly ControlAction[] = CONTROL_ACTIONS.filter((action) =>
  ACTION_CONTEXTS[action].some((context) => context !== 'game'),
);

/** Saved under `settings` as `controls.key.<action>` (a code string) and `controls.pad.<action>` (a button index). */
export const CONTROLS_KEY_PREFIX = 'controls.';
export const CONTROLS_KEYBOARD_PREFIX = 'controls.key.';
export const CONTROLS_PAD_PREFIX = 'controls.pad.';

function buildKeyLabels(): Readonly<Record<string, string>> {
  const labels: Record<string, string> = Object.create(null) as Record<string, string>;
  for (let c = 65; c <= 90; c++) labels[`Key${String.fromCharCode(c)}`] = String.fromCharCode(c);
  for (let d = 0; d <= 9; d++) {
    labels[`Digit${d}`] = String(d);
    labels[`Numpad${d}`] = `Num ${d}`;
  }
  Object.assign(labels, {
    NumpadAdd: 'Num +',
    NumpadSubtract: 'Num -',
    NumpadMultiply: 'Num *',
    NumpadDivide: 'Num /',
    NumpadDecimal: 'Num .',
    Space: 'Space',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    Enter: 'Enter',
    NumpadEnter: 'Num Enter',
    Escape: 'Esc',
  });
  return labels;
}

/**
 * The keyboard allow-list: `KeyboardEvent.code` to its label, in a US layout.
 * A null-prototype table, so `toString` and `__proto__` are not keys; look
 * values up with `Object.hasOwn`. Tab, Meta, CapsLock, the F-keys and
 * ContextMenu are left out: the browser or the OS keeps them.
 */
export const KEY_LABELS: Readonly<Record<string, string>> = buildKeyLabels();

/** The controller allow-list: standard-mapping button indices 0 to 15. Home (16) stays the system's. */
export const PAD_LABELS: readonly string[] = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'L-stick',
  'R-stick',
  'D-pad up',
  'D-pad down',
  'D-pad left',
  'D-pad right',
];

/** Menu Confirm, Back and the card picks: only a game-context action may hold one. */
export const RESERVED_KEYS: readonly string[] = [
  'Enter',
  'NumpadEnter',
  'Escape',
  'Digit1',
  'Digit2',
  'Digit3',
  'Numpad1',
  'Numpad2',
  'Numpad3',
];

/** Pad A and B (Confirm, Back) and the D-pad (menu navigation). */
export const RESERVED_PAD: readonly number[] = [0, 1, 12, 13, 14, 15];

/** The arrow keys always move the player and walk menus; they cannot be captured. */
export const FIXED_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export const DEFAULT_KEYS: Readonly<Record<ControlAction, string>> = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  dash: 'Space',
  pause: 'Escape',
  mute: 'KeyM',
  reroll: 'KeyR',
  skip: 'KeyS',
  ban: 'KeyB',
  helpPrev: 'KeyQ',
  helpNext: 'KeyE',
};

export const DEFAULT_PAD: Readonly<Record<ControlAction, number>> = {
  moveUp: 12,
  moveDown: 13,
  moveLeft: 14,
  moveRight: 15,
  dash: 0,
  pause: 9,
  mute: 8,
  reroll: 2,
  skip: 5,
  ban: 3,
  helpPrev: 4,
  helpNext: 5,
};
