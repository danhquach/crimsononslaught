import { describe, expect, it } from 'vitest';
import type { NavDirection } from './pauseNav';
import { stepResultFocus } from './resultNav';

const DIRS: readonly NavDirection[] = ['up', 'down', 'left', 'right'];
const PLAY = { zone: 'menu', index: 0 } as const;
const MENU = { zone: 'menu', index: 1 } as const;
const layout = {
  buildRows: [
    [428, 578, 728],
    [428, 476, 524, 572],
    [428, 476, 640],
  ],
  buttonXs: [358, 602],
};
const empty = { buildRows: [[], [], []], buttonXs: [358, 602] };

describe('stepResultFocus', () => {
  it('wakes on Play again from nothing, whatever is pressed', () => {
    for (const dir of DIRS) expect(stepResultFocus(null, dir, layout)).toEqual(PLAY);
  });

  it('steps right from Play again to Main menu and left back, without wrapping (CO-218)', () => {
    expect(stepResultFocus(PLAY, 'right', layout)).toEqual(MENU);
    expect(stepResultFocus(MENU, 'left', layout)).toEqual(PLAY);
    expect(stepResultFocus(MENU, 'right', layout)).toEqual(MENU);
    expect(stepResultFocus(PLAY, 'left', layout)).toEqual(PLAY);
  });

  it('steps up from either button onto the last row, at the item nearest that button', () => {
    expect(stepResultFocus(PLAY, 'up', layout)).toEqual({ zone: 'build', row: 2, col: 0, menu: 0 });
    expect(stepResultFocus(MENU, 'up', layout)).toEqual({ zone: 'build', row: 2, col: 2, menu: 1 });
  });

  it('keeps either button on down', () => {
    expect(stepResultFocus(PLAY, 'down', layout)).toEqual(PLAY);
    expect(stepResultFocus(MENU, 'down', layout)).toEqual(MENU);
  });

  it('goes down from the last row to the button nearest across', () => {
    expect(stepResultFocus({ zone: 'build', row: 2, col: 0, menu: 1 }, 'down', layout)).toEqual(
      PLAY,
    );
    expect(stepResultFocus({ zone: 'build', row: 2, col: 2, menu: 0 }, 'down', layout)).toEqual(
      MENU,
    );
  });

  it('goes down elsewhere to the item nearest across', () => {
    expect(stepResultFocus({ zone: 'build', row: 0, col: 1, menu: 0 }, 'down', layout)).toEqual({
      zone: 'build',
      row: 1,
      col: 3,
      menu: 0,
    });
  });

  it('stays on the first row on up, and goes back to the button it came from off column 0', () => {
    const top = { zone: 'build', row: 0, col: 1, menu: 0 } as const;
    expect(stepResultFocus(top, 'up', layout)).toEqual(top);
    expect(stepResultFocus({ ...top, col: 0 }, 'left', layout)).toEqual(PLAY);
    expect(stepResultFocus({ ...top, col: 0, menu: 1 }, 'left', layout)).toEqual(MENU);
  });

  it('walks along a row and stops at its end', () => {
    const at = (col: number) => ({ zone: 'build', row: 0, col, menu: 0 }) as const;
    expect(stepResultFocus(at(0), 'right', layout)).toEqual(at(1));
    expect(stepResultFocus(at(2), 'right', layout)).toEqual(at(2));
    expect(stepResultFocus(at(2), 'left', layout)).toEqual(at(1));
  });

  it('falls back to the button it came from off a row that no longer exists', () => {
    const stale = { zone: 'build', row: 9, col: 0, menu: 0 } as const;
    for (const dir of DIRS) expect(stepResultFocus(stale, dir, layout)).toEqual(PLAY);
    for (const dir of DIRS)
      expect(stepResultFocus({ ...stale, menu: 1 }, dir, layout)).toEqual(MENU);
  });

  it('keeps up and down on the buttons with nothing in the strips, and left and right still step', () => {
    for (const dir of ['up', 'down'] as const) {
      expect(stepResultFocus(PLAY, dir, empty)).toEqual(PLAY);
      expect(stepResultFocus(MENU, dir, empty)).toEqual(MENU);
    }
    expect(stepResultFocus(PLAY, 'right', empty)).toEqual(MENU);
  });

  it('skips empty rows', () => {
    const gaps = { buildRows: [[428, 476], [], [428]], buttonXs: [358, 602] };
    expect(stepResultFocus(PLAY, 'up', gaps)).toEqual({ zone: 'build', row: 1, col: 0, menu: 0 });
    expect(stepResultFocus({ zone: 'build', row: 0, col: 1, menu: 0 }, 'down', gaps)).toEqual({
      zone: 'build',
      row: 1,
      col: 0,
      menu: 0,
    });
  });
});
