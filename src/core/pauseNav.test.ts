import { describe, expect, it } from 'vitest';
import { stepPauseFocus, type PauseFocus, type PauseNavLayout } from './pauseNav';

/** Spells at a wide pitch, then two passive rows and one relic row at a tile pitch. */
const layout: PauseNavLayout = {
  menuRows: 4,
  buildRows: [
    [450, 570, 690, 810],
    [450, 490, 530, 570, 610],
    [450, 490],
    [450, 490, 530],
  ],
};

const walk = (from: PauseFocus | null, dirs: string, at = layout): PauseFocus =>
  dirs
    .split(' ')
    .reduce<PauseFocus | null>(
      (focus, d) => stepPauseFocus(focus, d as 'up' | 'down' | 'left' | 'right', at),
      from,
    )!;

describe('stepPauseFocus', () => {
  it('wakes on the first menu row, whatever the press', () => {
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      expect(stepPauseFocus(null, dir, layout)).toEqual({ zone: 'menu', index: 0 });
    }
  });

  it('steps the menu up and down, wrapping at both ends, and ignores left', () => {
    const top = { zone: 'menu', index: 0 } as const;
    expect(walk(top, 'down down down')).toEqual({ zone: 'menu', index: 3 });
    expect(walk(top, 'down down down down')).toEqual(top);
    expect(walk(top, 'up')).toEqual({ zone: 'menu', index: 3 });
    expect(walk(top, 'left')).toEqual(top);
  });

  it('steps right into the first strip and left back to the menu row it left', () => {
    const inStrips = walk({ zone: 'menu', index: 2 }, 'right');
    expect(inStrips).toEqual({ zone: 'build', row: 0, col: 0, menu: 2 });
    expect(walk(inStrips, 'right right left left left')).toEqual({ zone: 'menu', index: 2 });
  });

  it('stops at a row end, and at the top and bottom rows', () => {
    const start = walk({ zone: 'menu', index: 0 }, 'right');
    expect(walk(start, 'right right right right right')).toMatchObject({ row: 0, col: 3 });
    expect(walk(start, 'up')).toEqual(start);
    expect(walk(start, 'down down down down down')).toMatchObject({ row: 3, col: 0 });
  });

  it('moves up and down onto the nearest item across', () => {
    // Spell at x 690 -> the passive at 610, the row's last; down again -> 490.
    const third = walk({ zone: 'menu', index: 0 }, 'right right right');
    expect(walk(third, 'down')).toMatchObject({ row: 1, col: 4 });
    expect(walk(third, 'down down')).toMatchObject({ row: 2, col: 1 });
    expect(walk(third, 'down down down')).toMatchObject({ row: 3, col: 1 });
    expect(walk(third, 'down up')).toMatchObject({ row: 0, col: 1 });
  });

  it('stays in the menu when the strips hold nothing', () => {
    const bare = { menuRows: 4, buildRows: [[], []] };
    expect(walk({ zone: 'menu', index: 1 }, 'right', bare)).toEqual({ zone: 'menu', index: 1 });
  });

  it('goes back to the menu from a focus the layout no longer has', () => {
    const stale = { zone: 'build', row: 9, col: 0, menu: 3 } as const;
    expect(stepPauseFocus(stale, 'right', layout)).toEqual({ zone: 'menu', index: 3 });
  });
});
