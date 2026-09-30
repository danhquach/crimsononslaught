/**
 * The look of controller focus (CO-196), decided apart from Phaser so the rules
 * are testable. One ring sits just outside whatever the arrows or a pad have
 * highlighted, on every screen: a black keyline against the item, a bright white
 * core and a gold halo that pulses. `scenes/focusRing.ts` paints it.
 *
 * The core is white because nothing else on screen is brighter: not a card's
 * element or kind colour, not the menu crimson. It never takes the item's own
 * colour, so it cannot be mistaken for a thicker version of it.
 */
export const FOCUS_STYLE = {
  /** Between the item and the core, so a pale card border does not run into the white. */
  keyline: 0x000000,
  keylineWidth: 1,
  color: 0xffffff,
  width: 3,
  halo: 0xffd700,
  haloWidth: 2,
  /** The halo's alpha at the dimmest and brightest points of its pulse. */
  haloMin: 0.25,
  haloMax: 0.8,
  pulseMs: 1200,
} as const;

/** A box by its top-left corner, in game pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The path for `Graphics.strokeRect`: the stroke is centred on it. */
export interface StrokeRect extends Box {
  lineWidth: number;
}

/** How far the ring's outer edge sits from the item's box. */
export function ringOutset(): number {
  const { keylineWidth, width, haloWidth } = FOCUS_STYLE;
  return keylineWidth + width + haloWidth;
}

/** `box` grown by `by` on every side, stroked `lineWidth` wide. */
function stroke(box: Box, by: number, lineWidth: number): StrokeRect {
  return {
    x: box.x - by,
    y: box.y - by,
    width: box.width + 2 * by,
    height: box.height + 2 * by,
    lineWidth,
  };
}

/**
 * The ring's three bands, each strictly outside `box` and touching the next:
 * the keyline first, then the core, then the halo.
 */
export function focusRingRects(box: Box): {
  keyline: StrokeRect;
  core: StrokeRect;
  halo: StrokeRect;
} {
  const { keylineWidth, width, haloWidth } = FOCUS_STYLE;
  return {
    keyline: stroke(box, keylineWidth / 2, keylineWidth),
    core: stroke(box, keylineWidth + width / 2, width),
    halo: stroke(box, keylineWidth + width + haloWidth / 2, haloWidth),
  };
}

/** The halo's alpha a fraction `t` of the way through one pulse; `t` 0 and 1 are the dimmest. */
export function pulseAlpha(t: number): number {
  const { haloMin, haloMax } = FOCUS_STYLE;
  return haloMin + ((haloMax - haloMin) * (1 - Math.cos(2 * Math.PI * t))) / 2;
}

export interface ItemLook {
  /** Hover or focus: the item's own subtle lift. */
  raised: boolean;
  /** Focus: the ring draws round it. */
  ring: boolean;
}

/**
 * What an item shows for hover and focus. Both raise it the same subtle way; only
 * focus adds the ring, so the pointer alone never draws it, and focus wins when
 * both are on.
 */
export function itemLook(state: { hovered: boolean; focused: boolean }): ItemLook {
  return { raised: state.hovered || state.focused, ring: state.focused };
}

/**
 * Who holds the one ring a scene draws. Items are told about a move in turn, the
 * old one off and the new one on, in either order; an item hiding after another
 * has taken the ring must not take it away.
 */
export function focusOwner<T>(): {
  show(owner: T): boolean;
  hide(owner: T): boolean;
  current(): T | null;
} {
  let current: T | null = null;
  return {
    show: (owner) => {
      if (current === owner) return false;
      current = owner;
      return true;
    },
    hide: (owner) => {
      if (current !== owner) return false;
      current = null;
      return true;
    },
    current: () => current,
  };
}
