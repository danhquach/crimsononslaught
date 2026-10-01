import { nearest, stepPauseFocus, type NavDirection, type PauseFocus } from './pauseNav';

/**
 * Pad and arrow-key focus on the result screen (CO-198): the buttons along the
 * bottom ("Play again", then "Main menu" since CO-218) as one menu row, and the
 * build strips (spells, passives, relics) as the pause screen's strip rows.
 * Left and right step between the buttons, without wrapping. Up from a button
 * goes up into the last strip row, at the item nearest that button across, and
 * down off the last strip row lands on the button nearest across. In the strips
 * it steps like the pause screen's layout; left off a row's first item goes back
 * to the button it came from. Pure TS, unit-tested; `ResultScene` draws the
 * highlight where this says.
 */

export interface ResultNavLayout {
  /** Each strip row, top to bottom, as its items' centre x; empty rows are skipped. */
  buildRows: readonly (readonly number[])[];
  /** Each button's centre x, left to right; menu index `i` is `buttonXs[i]`. */
  buttonXs: readonly number[];
}

/** Where one press leaves the focus. No focus yet: any press wakes it on "Play again". */
export function stepResultFocus(
  focus: PauseFocus | null,
  dir: NavDirection,
  layout: Readonly<ResultNavLayout>,
): PauseFocus {
  const rows = layout.buildRows.filter((row) => row.length > 0);
  const buttons = Math.max(1, layout.buttonXs.length);
  const stepLayout = { menuRows: buttons, buildRows: rows };
  if (focus === null) return { zone: 'menu', index: 0 };

  if (focus.zone === 'menu') {
    if (dir === 'left' || dir === 'right') {
      const index = focus.index + (dir === 'left' ? -1 : 1);
      return { zone: 'menu', index: Math.min(Math.max(index, 0), buttons - 1) };
    }
    if (dir === 'up') {
      const last = rows.at(-1);
      if (!last) return focus;
      const x = layout.buttonXs[focus.index] ?? 0;
      return { zone: 'build', row: rows.length - 1, col: nearest(last, x), menu: focus.index };
    }
    return focus;
  }

  const row = rows[focus.row];
  if (row && dir === 'down' && focus.row === rows.length - 1) {
    const x = row[Math.min(focus.col, row.length - 1)] ?? 0;
    return { zone: 'menu', index: nearest(layout.buttonXs, x) };
  }
  return stepPauseFocus(focus, dir, stepLayout);
}
