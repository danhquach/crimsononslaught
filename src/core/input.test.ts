import { describe, expect, it } from 'vitest';
import {
  PLAYER_SPEED,
  STICK_DEADZONE,
  clampMoveSpeed,
  directionVector,
  menuStep,
  moveVelocity,
  padVector,
  pressedEdges,
  resolveMove,
  stickVector,
  wrapIndex,
  type DirectionState,
  type MenuInputState,
} from './input';

const NONE: DirectionState = { up: false, down: false, left: false, right: false };
const dirs = (held: Partial<DirectionState>): DirectionState => ({ ...NONE, ...held });

const MENU_NONE: MenuInputState = { ...NONE, confirm: false };
const menu = (held: Partial<MenuInputState>): MenuInputState => ({ ...MENU_NONE, ...held });

describe('directionVector', () => {
  it('maps held keys to screen-space axes', () => {
    expect(directionVector(dirs({ right: true, up: true }))).toEqual({ x: 1, y: -1 });
    expect(directionVector(dirs({ left: true, down: true }))).toEqual({ x: -1, y: 1 });
  });

  it('cancels opposite directions', () => {
    expect(directionVector(dirs({ left: true, right: true, up: true, down: true }))).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('is zero with nothing held', () => {
    expect(directionVector(NONE)).toEqual({ x: 0, y: 0 });
  });
});

describe('stickVector', () => {
  it('reads a resting or barely nudged stick as no input', () => {
    expect(stickVector(0, 0)).toEqual({ x: 0, y: 0 });
    expect(stickVector(0.19, 0)).toEqual({ x: 0, y: 0 });
    // Just inside the deadzone circle on the diagonal (magnitude ~0.198).
    expect(stickVector(0.14, 0.14)).toEqual({ x: 0, y: 0 });
  });

  it('keeps the raw magnitude at and above the deadzone', () => {
    expect(stickVector(STICK_DEADZONE, 0)).toEqual({ x: 0.2, y: 0 });
    expect(stickVector(0.5, -0.5)).toEqual({ x: 0.5, y: -0.5 });
  });
});

describe('padVector', () => {
  it('uses the stick when the D-pad is idle', () => {
    expect(padVector(NONE, { x: 0.5, y: 0 })).toEqual({ x: 0.5, y: 0 });
  });

  it('lets the D-pad win over a pushed stick', () => {
    expect(padVector(dirs({ left: true }), { x: 0.9, y: 0.9 })).toEqual({ x: -1, y: 0 });
  });
});

describe('resolveMove', () => {
  it('prefers the keyboard when both are pushed', () => {
    expect(resolveMove({ x: 1, y: 0 }, { x: -1, y: 0 })).toEqual({ x: 1, y: 0 });
  });

  it('falls through to the pad when the keyboard is idle', () => {
    expect(resolveMove({ x: 0, y: 0 }, { x: -0.4, y: 0.3 })).toEqual({ x: -0.4, y: 0.3 });
  });

  it('is zero when neither is pushed', () => {
    expect(resolveMove({ x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('moveVelocity', () => {
  it('moves at full speed on a cardinal', () => {
    expect(moveVelocity({ x: 1, y: 0 })).toEqual({ x: PLAYER_SPEED, y: 0 });
  });

  it('normalizes a diagonal to the same speed as a cardinal', () => {
    const v = moveVelocity({ x: 1, y: 1 });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(PLAYER_SPEED, 10);
    expect(v.x).toBeCloseTo(v.y, 10);
  });

  it('scales speed with an analog magnitude below 1', () => {
    const v = moveVelocity({ x: 0.5, y: 0 });
    expect(v).toEqual({ x: PLAYER_SPEED / 2, y: 0 });
  });

  it('stands still on a zero vector', () => {
    expect(moveVelocity({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('pressedEdges', () => {
  it('reports only released -> pressed transitions', () => {
    const prev = menu({ right: true, confirm: true });
    const curr = menu({ right: true, down: true, confirm: true });
    expect(pressedEdges(prev, curr)).toEqual(menu({ down: true }));
  });

  it('reports nothing while inputs are held', () => {
    const held = menu({ left: true, confirm: true });
    expect(pressedEdges(held, held)).toEqual(MENU_NONE);
  });
});

describe('menuStep', () => {
  it('steps forward on right or down and back on left or up', () => {
    expect(menuStep(dirs({ right: true }))).toBe(1);
    expect(menuStep(dirs({ down: true }))).toBe(1);
    expect(menuStep(dirs({ left: true }))).toBe(-1);
    expect(menuStep(dirs({ up: true }))).toBe(-1);
  });

  it('stays put on nothing or on contradicting directions', () => {
    expect(menuStep(NONE)).toBe(0);
    expect(menuStep(dirs({ left: true, right: true }))).toBe(0);
    expect(menuStep(dirs({ up: true, down: true }))).toBe(0);
    expect(menuStep(dirs({ up: true, right: true }))).toBe(0);
  });
});

describe('wrapIndex', () => {
  it('wraps around both ends', () => {
    expect(wrapIndex(3, 1, 4)).toBe(0);
    expect(wrapIndex(0, -1, 4)).toBe(3);
  });

  it('moves normally inside the range', () => {
    expect(wrapIndex(1, 1, 4)).toBe(2);
    expect(wrapIndex(0, 0, 1)).toBe(0);
  });
});

describe('clampMoveSpeed', () => {
  it('keeps any positive finite speed, perk-raised ones included', () => {
    expect(clampMoveSpeed(PLAYER_SPEED)).toBe(180);
    expect(clampMoveSpeed(180 * 1.1 ** 3)).toBeCloseTo(239.58, 10);
    expect(clampMoveSpeed(0.5)).toBe(0.5);
  });

  it('falls back on anything else, so no perk can freeze or teleport the player', () => {
    for (const value of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, '180', null, undefined]) {
      expect(clampMoveSpeed(value)).toBe(PLAYER_SPEED);
    }
  });

  it('takes the fallback the caller gives', () => {
    expect(clampMoveSpeed(-1, 200)).toBe(200);
  });
});
