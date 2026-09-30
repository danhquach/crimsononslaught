import { nearest, stepPauseFocus, type NavDirection, type PauseFocus } from './pauseNav';

/**
 * Pad and arrow-key focus on the result screen (CO-198): "Play again" as the
 * lone menu row, and the build strips (spells, passives, relics) as the pause
 * screen's strip rows. It steps like the pause screen's layout, except that
 * up from "Play again" goes back up into the strips, at the item nearest
 * across, and down off the last strip row lands on "Play again". Pure TS,
 * unit-tested; `ResultScene` draws the highlight where this says.
 */

export interface ResultNavLayout {
  /** Each strip row, top to bottom, as its items' centre x; empty rows are skipped. */
  buildRows: readonly (readonly number[])[];
  /** Centre x of the "Play again" button, for the item up from it lands on. */
  buttonX: number;
}

/** Where one press leaves the focus. No focus yet: any press wakes it on "Play again". */
export function stepResultFocus(
  focus: PauseFocus | null,
  dir: NavDirection,
  layout: Readonly<ResultNavLayout>,
): PauseFocus {
  const rows = layout.buildRows.filter((row) => row.length > 0);
  const stepLayout = { menuRows: 1, buildRows: rows };
  const button: PauseFocus = { zone: 'menu', index: 0 };
  if (focus === null) return button;

  if (focus.zone === 'menu') {
    if (dir === 'up') {
      const last = rows.at(-1);
      if (!last) return focus;
      return { zone: 'build', row: rows.length - 1, col: nearest(last, layout.buttonX), menu: 0 };
    }
    if (dir === 'right') return stepPauseFocus(focus, dir, stepLayout);
    return focus;
  }

  if (dir === 'down' && focus.row >= rows.length - 1) return button;
  return stepPauseFocus(focus, dir, stepLayout);
}
