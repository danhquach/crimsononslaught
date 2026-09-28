/**
 * Pad and arrow-key focus on the pause screen (CO-179): the menu column on the
 * left and the build strips on the right. Pure TS, unit-tested; `PauseScene`
 * draws the highlight where this says.
 *
 * Up and down step the menu, wrapping, as before; right steps into the strips.
 * In the strips, left and right step along a row and up and down move to the
 * row above or below, onto the item nearest across. Left off a row's first
 * item goes back to the menu row it came from.
 */

export type NavDirection = 'up' | 'down' | 'left' | 'right';

export type PauseFocus =
  | { zone: 'menu'; index: number }
  /** `menu` is the row a step back out of the strips returns to. */
  | { zone: 'build'; row: number; col: number; menu: number };

export interface PauseNavLayout {
  menuRows: number;
  /** Each non-empty strip row, top to bottom, as its items' centre x. */
  buildRows: readonly (readonly number[])[];
}

/** Where one press leaves the focus. No focus yet: any press wakes it on the first menu row. */
export function stepPauseFocus(
  focus: PauseFocus | null,
  dir: NavDirection,
  layout: Readonly<PauseNavLayout>,
): PauseFocus {
  const menuRows = Math.max(1, layout.menuRows);
  const rows = layout.buildRows.filter((row) => row.length > 0);
  if (focus === null) return { zone: 'menu', index: 0 };

  if (focus.zone === 'menu') {
    if (dir === 'up' || dir === 'down') {
      const step = dir === 'up' ? -1 : 1;
      return { zone: 'menu', index: (((focus.index + step) % menuRows) + menuRows) % menuRows };
    }
    if (dir === 'right' && rows.length > 0) {
      return { zone: 'build', row: 0, col: 0, menu: focus.index };
    }
    return focus;
  }

  const row = rows[focus.row];
  if (!row) return { zone: 'menu', index: focus.menu };
  if (dir === 'left') {
    return focus.col > 0 ? { ...focus, col: focus.col - 1 } : { zone: 'menu', index: focus.menu };
  }
  if (dir === 'right') return { ...focus, col: Math.min(focus.col + 1, row.length - 1) };

  const target = rows[focus.row + (dir === 'up' ? -1 : 1)];
  if (!target) return focus;
  const x = row[Math.min(focus.col, row.length - 1)] ?? 0;
  return { ...focus, row: focus.row + (dir === 'up' ? -1 : 1), col: nearest(target, x) };
}

/** Index of the value in `xs` closest to `x`; the first on a tie. */
function nearest(xs: readonly number[], x: number): number {
  let best = 0;
  xs.forEach((value, i) => {
    if (Math.abs(value - x) < Math.abs((xs[best] ?? 0) - x)) best = i;
  });
  return best;
}
