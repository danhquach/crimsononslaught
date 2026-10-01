import {
  ACTION_CONTEXTS,
  ACTION_LABEL,
  CONTROLS_KEYBOARD_PREFIX,
  CONTROLS_KEY_PREFIX,
  CONTROLS_PAD_PREFIX,
  CONTROL_ACTIONS,
  DEFAULT_KEYS,
  DEFAULT_PAD,
  FIXED_KEYS,
  KEY_LABELS,
  MENU_ACTIONS,
  PAD_LABELS,
  RESERVED_KEYS,
  RESERVED_PAD,
  type ControlAction,
  type ControlDevice,
} from '../config/controls';
import type { SaveSettings } from './save';

/**
 * The rebindable controls (CO-226), pure logic. Keyboard bindings are
 * `KeyboardEvent.code` strings (the physical key, so WASD stays a cluster on
 * any layout); pad bindings are standard-mapping button indices. Every action
 * is always bound on both devices, and what is read back from storage is
 * checked against the allow-lists in `config/controls.ts`.
 */

export interface Controls {
  keyboard: Record<ControlAction, string>;
  pad: Record<ControlAction, number>;
}

type Input = string | number;

export function defaultControls(): Controls {
  return { keyboard: { ...DEFAULT_KEYS }, pad: { ...DEFAULT_PAD } };
}

/** A value on the keyboard allow-list. Own keys only, so `toString` and `__proto__` fail. */
export function isKeyCode(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(KEY_LABELS, value);
}

/** A value on the controller allow-list: a whole button index 0 to 15. */
export function isPadButton(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PAD_LABELS.length
  );
}

function isAllowed(device: ControlDevice, value: unknown): value is Input {
  return device === 'keyboard' ? isKeyCode(value) : isPadButton(value);
}

/** Menu Confirm, Back, card picks and menu navigation use it, so a menu action may not. */
function isReserved(device: ControlDevice, input: Input): boolean {
  return device === 'keyboard'
    ? RESERVED_KEYS.includes(input as string)
    : RESERVED_PAD.includes(input as number);
}

/** Whether `input` is free of the menus' own keys, so a screen may also act on it. */
export function menuSafe(device: ControlDevice, input: Input): boolean {
  return !isReserved(device, input);
}

function shareContext(a: ControlAction, b: ControlAction): boolean {
  return ACTION_CONTEXTS[a].some((context) => ACTION_CONTEXTS[b].includes(context));
}

function isValidDevice(
  device: ControlDevice,
  map: Readonly<Record<ControlAction, Input>>,
): boolean {
  for (const action of CONTROL_ACTIONS) {
    const input = map[action];
    if (!isAllowed(device, input)) return false;
    if (device === 'keyboard' && FIXED_KEYS.includes(input as string)) return false;
    if (MENU_ACTIONS.includes(action) && isReserved(device, input)) return false;
  }
  for (const [i, a] of CONTROL_ACTIONS.entries()) {
    for (const b of CONTROL_ACTIONS.slice(i + 1)) {
      if (map[a] === map[b] && shareContext(a, b)) return false;
    }
  }
  return true;
}

const settingKey = (device: ControlDevice, action: ControlAction): string =>
  (device === 'keyboard' ? CONTROLS_KEYBOARD_PREFIX : CONTROLS_PAD_PREFIX) + action;

/**
 * The bindings held in a save's `settings`. Own keys only; a missing entry is
 * the default. A device with any bad value, a clash or a reserved input on a
 * menu action falls back to its defaults whole; the other device is untouched.
 */
export function readControls(saved: Readonly<SaveSettings>): Controls {
  const out = defaultControls();
  for (const device of ['keyboard', 'pad'] as const) {
    const map: Record<ControlAction, Input> = {
      ...(device === 'keyboard' ? DEFAULT_KEYS : DEFAULT_PAD),
    };
    let sound = true;
    for (const action of CONTROL_ACTIONS) {
      const key = settingKey(device, action);
      if (!Object.hasOwn(saved, key)) continue;
      const value = saved[key];
      if (isAllowed(device, value)) map[action] = value;
      else sound = false;
    }
    if (sound && isValidDevice(device, map)) {
      if (device === 'keyboard') out.keyboard = map as Record<ControlAction, string>;
      else out.pad = map as Record<ControlAction, number>;
    }
  }
  return out;
}

/** A save's `settings` with the bindings written over it; other keys kept. */
export function writeControls(
  saved: Readonly<SaveSettings>,
  controls: Readonly<Controls>,
): SaveSettings {
  const written: SaveSettings = { ...saved };
  for (const action of CONTROL_ACTIONS) {
    written[settingKey('keyboard', action)] = controls.keyboard[action];
    written[settingKey('pad', action)] = controls.pad[action];
  }
  return written;
}

/**
 * A save's `settings` without any `controls.` key that is not a known action's
 * binding or whose value is off its allow-list. The load-time allow-list: a
 * stored file never grows the save with keys it invented.
 */
export function dropUnknownControlKeys(saved: Readonly<SaveSettings>): SaveSettings {
  const kept: SaveSettings = {};
  for (const [key, value] of Object.entries(saved)) {
    // Assigning an object to `__proto__` would swap the result's prototype.
    if (key === '__proto__') continue;
    if (key.startsWith(CONTROLS_KEY_PREFIX)) {
      const device = key.startsWith(CONTROLS_KEYBOARD_PREFIX)
        ? 'keyboard'
        : key.startsWith(CONTROLS_PAD_PREFIX)
          ? 'pad'
          : null;
      const prefix = device === 'keyboard' ? CONTROLS_KEYBOARD_PREFIX : CONTROLS_PAD_PREFIX;
      const action = key.slice(prefix.length);
      const known = (CONTROL_ACTIONS as readonly string[]).includes(action);
      if (device === null || !known || !isAllowed(device, value)) continue;
    }
    kept[key] = value;
  }
  return kept;
}

export type RebindResult =
  | { ok: true; controls: Controls; moved: ControlAction[]; note: string }
  | { ok: false; note: string };

export function keyLabel(code: string): string {
  return (isKeyCode(code) ? KEY_LABELS[code] : undefined) ?? '?';
}

export function padLabel(button: number): string {
  return (isPadButton(button) ? PAD_LABELS[button] : undefined) ?? '?';
}

/**
 * A key label short enough for a small badge: up to four characters as is, a
 * two-word label as its initials ("Left Shift" is "LS"), a long word cut to three.
 */
export function keyBadge(code: string): string {
  const label = keyLabel(code);
  if (label.length <= 4) return label;
  const words = label.split(' ');
  return words.length > 1 ? words.map((word) => word.charAt(0)).join('') : label.slice(0, 3);
}

/** Labels as a list with duplicates dropped: "Esc, Start or B". */
export function joinLabels(labels: readonly string[]): string {
  const unique = [...new Set(labels)];
  if (unique.length <= 1) return unique.join('');
  return `${unique.slice(0, -1).join(', ')} or ${unique[unique.length - 1]}`;
}

function inputLabel(device: ControlDevice, input: Input): string {
  return device === 'keyboard' ? keyLabel(input as string) : padLabel(input as number);
}

/** The label of an action's current binding. */
export function bindingLabel(
  controls: Readonly<Controls>,
  device: ControlDevice,
  action: ControlAction,
): string {
  return inputLabel(device, controls[device][action]);
}

/** How a hint names movement: the bound keys plus the fixed arrows, or the stick plus the bound buttons. */
export function moveLabel(controls: Readonly<Controls>, device: ControlDevice): string {
  if (device === 'keyboard') {
    const keys = (['moveUp', 'moveLeft', 'moveDown', 'moveRight'] as const)
      .map((action) => bindingLabel(controls, 'keyboard', action))
      .join(' ');
    return `${keys} or arrow keys`;
  }
  const same = (['moveUp', 'moveDown', 'moveLeft', 'moveRight'] as const).every(
    (action) => controls.pad[action] === DEFAULT_PAD[action],
  );
  if (same) return 'Left stick or D-pad';
  const buttons = (['moveUp', 'moveLeft', 'moveDown', 'moveRight'] as const)
    .map((action) => bindingLabel(controls, 'pad', action))
    .join(' ');
  return `Left stick or ${buttons}`;
}

/**
 * Bind `input` to `action` on one device. Any action that shares a context
 * with it and holds `input` swaps to the action's old input, so none is left
 * unbound. Refused, with a note, when `input` is off the allow-list, an arrow,
 * reserved for a menu action, or when the swap would leave any binding
 * invalid. The `controls` passed in is never changed.
 */
export function rebind(
  controls: Readonly<Controls>,
  device: ControlDevice,
  action: ControlAction,
  input: unknown,
): RebindResult {
  if (!isAllowed(device, input)) {
    const fixed = device === 'keyboard' && typeof input === 'string' && FIXED_KEYS.includes(input);
    return {
      ok: false,
      note: fixed ? 'Arrow keys are fixed for movement and menus.' : 'That cannot be used.',
    };
  }
  if (device === 'keyboard' && FIXED_KEYS.includes(input as string)) {
    return { ok: false, note: 'Arrow keys are fixed for movement and menus.' };
  }
  const current = controls[device][action];
  if (current === input)
    return { ok: true, controls: cloneControls(controls), moved: [], note: '' };
  if (MENU_ACTIONS.includes(action) && isReserved(device, input)) {
    return { ok: false, note: `${inputLabel(device, input)} is kept for the menus.` };
  }
  const map: Record<ControlAction, Input> = { ...controls[device] };
  const moved = CONTROL_ACTIONS.filter(
    (other) => other !== action && map[other] === input && shareContext(action, other),
  );
  map[action] = input;
  for (const other of moved) map[other] = current;
  if (!isValidDevice(device, map)) {
    const names = moved.map((other) => ACTION_LABEL[other]).join(' and ');
    return {
      ok: false,
      note: `${names || ACTION_LABEL[action]} cannot take ${inputLabel(device, current)}.`,
    };
  }
  const next = cloneControls(controls);
  if (device === 'keyboard') next.keyboard = map as Record<ControlAction, string>;
  else next.pad = map as Record<ControlAction, number>;
  const note =
    moved.length === 0
      ? ''
      : `${moved.map((other) => ACTION_LABEL[other]).join(' and ')} moved to ${inputLabel(device, current)}`;
  return { ok: true, controls: next, moved, note };
}

function cloneControls(controls: Readonly<Controls>): Controls {
  return { keyboard: { ...controls.keyboard }, pad: { ...controls.pad } };
}

/** One device back to its defaults; the other kept. */
export function resetDevice(controls: Readonly<Controls>, device: ControlDevice): Controls {
  const next = cloneControls(controls);
  if (device === 'keyboard') next.keyboard = { ...DEFAULT_KEYS };
  else next.pad = { ...DEFAULT_PAD };
  return next;
}

export function resetAll(): Controls {
  return defaultControls();
}
