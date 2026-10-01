import type { FrameName } from './frames';

/**
 * The art for one framed HUD bar (CO-156): a tube frame and the mark that sits
 * at its left end. Every number is in native px, measured on the frame's art
 * box (`ART_BOXES`), not on the frame with its clear margin. These are layout
 * numbers read off the cut art; `scripts/lib/hudBarArt.test.mjs` checks them
 * against the shipped atlas, so a re-cut that moves the tube fails there.
 */
export interface BarArt {
  readonly frame: FrameName;
  readonly mark: FrameName;
  /**
   * End caps, drawn unscaled. Everything between them is the plain middle,
   * the same in every column, which is tiled to the bar's length.
   */
  readonly capLeft: number;
  readonly capRight: number;
  /** The tube's hollow inside, where the fill shows: its inset from each edge of the art box. */
  readonly trough: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
}

/** CO-195: the shield is drawn on the HP bar, so its own frame art is no longer used. */
export type BarId = 'hp' | 'xp' | 'boss';

export const BAR_ART: Readonly<Record<BarId, BarArt>> = {
  hp: {
    frame: 'hud.hpFrame.0',
    mark: 'hud.hpMark.0',
    capLeft: 21,
    capRight: 21,
    trough: { left: 15, top: 10, right: 15, bottom: 9 },
  },
  xp: {
    frame: 'hud.xpFrame.0',
    mark: 'hud.xpMark.0',
    capLeft: 11,
    capRight: 11,
    trough: { left: 9, top: 5, right: 9, bottom: 5 },
  },
  boss: {
    frame: 'hud.bossFrame.0',
    mark: 'hud.bossMark.0',
    capLeft: 11,
    capRight: 11,
    trough: { left: 10, top: 8, right: 10, bottom: 8 },
  },
};

/**
 * The dash icon (#384): a disc the size of a spell slot's, at the bottom right
 * just left of the minimap (`config/minimap.ts`'s box, x 824 to 944 and y 404
 * to 524), clear of the slot icons along the bottom-left.
 */
export const DASH_ICON = { x: 792, y: 506, radius: 18 } as const;

/** The icon art for it (`icon.<name>.0`, like the spell icons); a run without the atlas draws a ring and a glyph. */
export const DASH_ICON_FRAME: FrameName = 'icon.dash.0';
