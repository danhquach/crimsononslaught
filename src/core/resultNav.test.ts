import { describe, expect, it } from 'vitest';
import type { NavDirection } from './pauseNav';
import { stepResultFocus } from './resultNav';

const DIRS: readonly NavDirection[] = ['up', 'down', 'left', 'right'];
const BUTTON = { zone: 'menu', index: 0 } as const;
const layout = {
  buildRows: [
    [428, 578, 728],
    [428, 476, 524, 572],
    [428, 476],
  ],
  buttonX: 480,
};
const empty = { buildRows: [[], [], []], buttonX: 480 };

describe('stepResultFocus', () => {
  it('wakes on Play again from nothing, whatever is pressed', () => {
    for (const dir of DIRS) expect(stepResultFocus(null, dir, layout)).toEqual(BUTTON);
  });

  it('steps right from Play again into the first strip item', () => {
    expect(stepResultFocus(BUTTON, 'right', layout)).toEqual({
      zone: 'build',
      row: 0,
      col: 0,
      menu: 0,
    });
  });

  it('steps up from Play again onto the last row, at the item nearest the button', () => {
    expect(stepResultFocus(BUTTON, 'up', layout)).toEqual({
      zone: 'build',
      row: 2,
      col: 1,
      menu: 0,
    });
  });

  it('keeps Play again on down and left', () => {
    expect(stepResultFocus(BUTTON, 'down', layout)).toEqual(BUTTON);
    expect(stepResultFocus(BUTTON, 'left', layout)).toEqual(BUTTON);
  });

  it('goes down from the last row to Play again, and down elsewhere to the item nearest across', () => {
    expect(stepResultFocus({ zone: 'build', row: 2, col: 1, menu: 0 }, 'down', layout)).toEqual(
      BUTTON,
    );
    expect(stepResultFocus({ zone: 'build', row: 0, col: 1, menu: 0 }, 'down', layout)).toEqual({
      zone: 'build',
      row: 1,
      col: 3,
      menu: 0,
    });
  });

  it('stays on the first row on up, and goes back to Play again off column 0', () => {
    const top = { zone: 'build', row: 0, col: 1, menu: 0 } as const;
    expect(stepResultFocus(top, 'up', layout)).toEqual(top);
    expect(stepResultFocus({ ...top, col: 0 }, 'left', layout)).toEqual(BUTTON);
  });

  it('walks along a row and stops at its end', () => {
    const at = (col: number) => ({ zone: 'build', row: 0, col, menu: 0 }) as const;
    expect(stepResultFocus(at(0), 'right', layout)).toEqual(at(1));
    expect(stepResultFocus(at(2), 'right', layout)).toEqual(at(2));
    expect(stepResultFocus(at(2), 'left', layout)).toEqual(at(1));
  });

  it('falls back to Play again from a row that no longer exists', () => {
    const stale = { zone: 'build', row: 9, col: 0, menu: 0 } as const;
    for (const dir of DIRS) expect(stepResultFocus(stale, dir, layout)).toEqual(BUTTON);
  });

  it('stays on Play again with nothing in the strips', () => {
    for (const dir of ['right', 'up', 'down'] as const) {
      expect(stepResultFocus(BUTTON, dir, empty)).toEqual(BUTTON);
    }
  });

  it('skips empty rows', () => {
    const gaps = { buildRows: [[428, 476], [], [428]], buttonX: 480 };
    expect(stepResultFocus(BUTTON, 'up', gaps)).toEqual({ zone: 'build', row: 1, col: 0, menu: 0 });
    expect(stepResultFocus({ zone: 'build', row: 0, col: 1, menu: 0 }, 'down', gaps)).toEqual({
      zone: 'build',
      row: 1,
      col: 0,
      menu: 0,
    });
  });
});
