/**
 * Movement and menu input math (spec §5).
 *
 * Pure TS, no Phaser: scenes and entities read the raw keyboard / gamepad state
 * and hand it here, so the deadzone, the keyboard-vs-pad tie-break and diagonal
 * normalization are unit-tested without an engine. The Phaser side lives in
 * `scenes/input.ts` (menus) and `entities/Player.ts` (movement).
 */

/** Player move speed in px/s (spec §5). */
export const PLAYER_SPEED = 180;

/** Left-stick magnitude below this reads as no input at all, so a resting stick never drifts (spec §5). */
export const STICK_DEADZONE = 0.2;

export interface Vec2 {
  x: number;
  y: number;
}

/** Four directions held down, from WASD / arrows / D-pad. */
export interface DirectionState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Held direction keys as a vector, y down like screen space. Opposite directions cancel. */
export function directionVector(keys: DirectionState): Vec2 {
  return {
    x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0),
  };
}

/**
 * Left stick as a vector. Below the deadzone it reads as zero; at or above it
 * the raw magnitude is kept, so a half-pushed stick moves at half speed.
 */
export function stickVector(x: number, y: number, deadzone = STICK_DEADZONE): Vec2 {
  return Math.hypot(x, y) < deadzone ? { x: 0, y: 0 } : { x, y };
}

/** Gamepad move vector: the D-pad is digital and wins over the stick when both are pushed. */
export function padVector(dpad: DirectionState, stick: Vec2): Vec2 {
  const digital = directionVector(dpad);
  return digital.x !== 0 || digital.y !== 0 ? digital : stick;
}

/** Keyboard and gamepad are both live; whichever is non-zero wins, keyboard on a tie (spec §5). */
export function resolveMove(keyboard: Vec2, pad: Vec2): Vec2 {
  return keyboard.x !== 0 || keyboard.y !== 0 ? keyboard : pad;
}

/**
 * Velocity in px/s. The magnitude is clamped to 1 before scaling, so a diagonal
 * is no faster than a cardinal, while a part-pushed stick keeps its analog
 * magnitude and moves proportionally slower.
 */
export function moveVelocity(move: Vec2, speed = PLAYER_SPEED): Vec2 {
  const length = Math.hypot(move.x, move.y);
  if (length === 0) return { x: 0, y: 0 };
  const scale = (length > 1 ? 1 / length : 1) * speed;
  return { x: move.x * scale, y: move.y * scale };
}

/** Menu/overlay gamepad state: directions plus the confirm button (A). */
export interface MenuInputState extends DirectionState {
  confirm: boolean;
}

/** Inputs that went from released to pressed since the previous poll. */
export function pressedEdges(prev: MenuInputState, curr: MenuInputState): MenuInputState {
  return {
    up: curr.up && !prev.up,
    down: curr.down && !prev.down,
    left: curr.left && !prev.left,
    right: curr.right && !prev.right,
    confirm: curr.confirm && !prev.confirm,
  };
}

/**
 * Selection step from freshly pressed directions: -1 back, +1 forward, 0 for
 * none or a contradiction. Vertical and horizontal both step, so a row of cards
 * and a column of buttons navigate the same way.
 */
export function menuStep(pressed: DirectionState): number {
  const back = (pressed.left ? 1 : 0) + (pressed.up ? 1 : 0);
  const forward = (pressed.right ? 1 : 0) + (pressed.down ? 1 : 0);
  return Math.sign(forward - back);
}

/** Move a selection index by `step`, wrapping around both ends. */
export function wrapIndex(index: number, step: number, count: number): number {
  return (((index + step) % count) + count) % count;
}
