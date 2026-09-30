import Phaser from 'phaser';
import {
  FOCUS_STYLE,
  focusOwner,
  focusRingRects,
  itemLook,
  pulseAlpha,
  ringOutset,
  type Box,
  type ItemLook,
} from '../core/focusStyle';

/**
 * The one focus ring a scene draws (CO-196): keyline and core in one Graphics,
 * the pulsing halo in another, both at scene level on top of everything (bar
 * Pause's count badges, which sit above it on purpose so the ring never clips
 * one) and outside the focused item's box, so no item's own look (a card's kind colour, a
 * row's fill) is ever painted over. Made on the first focus, so a mouse-only
 * screen never has one, and its one pulse tween is paused while nothing is
 * focused, never re-added.
 */
interface Ring {
  core: Phaser.GameObjects.Graphics;
  halo: Phaser.GameObjects.Graphics;
  pulse: Phaser.Tweens.Tween;
  owner: ReturnType<typeof focusOwner<object>>;
  box: Box | null;
}

const rings = new WeakMap<Phaser.Scene, Ring>();

function makeRing(scene: Phaser.Scene): Ring {
  const core = scene.add.graphics().setVisible(false);
  const halo = scene.add.graphics().setVisible(false).setAlpha(pulseAlpha(0));
  // Alpha only, like the front door's embers; the scene owns the tween.
  const pulse = scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: FOCUS_STYLE.pulseMs,
    repeat: -1,
    onUpdate: (tween) => halo.setAlpha(pulseAlpha(tween.getValue() ?? 0)),
  });
  pulse.pause();
  // `scene.restart` reuses the scene object; its objects and tween are gone by then.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => rings.delete(scene));
  const ring = { core, halo, pulse, owner: focusOwner<object>(), box: null };
  rings.set(scene, ring);
  return ring;
}

/**
 * A framed item's ring box, centred on `x, y`: the frame grown by half its raised
 * 4 px stroke, so the ring clears the stroke instead of covering its outer edge.
 */
export function frameBox(x: number, y: number, width: number, height: number): Box {
  const grow = 2;
  return {
    x: x - width / 2 - grow,
    y: y - height / 2 - grow,
    width: width + 2 * grow,
    height: height + 2 * grow,
  };
}

function sameBox(a: Box | null, b: Box): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** The scene's ring: `owner` is whichever item asks to show or hide it. */
export function focusRing(scene: Phaser.Scene): {
  show(owner: object, box: Box): void;
  hide(owner: object): void;
} {
  return {
    show: (owner, box) => {
      const ring = rings.get(scene) ?? makeRing(scene);
      if (!ring.owner.show(owner) && sameBox(ring.box, box)) return;
      ring.box = box;
      const rects = focusRingRects(box);
      const { keyline, color, halo } = FOCUS_STYLE;
      ring.core.clear();
      for (const [rect, rgb] of [
        [rects.keyline, keyline],
        [rects.core, color],
      ] as const) {
        ring.core.lineStyle(rect.lineWidth, rgb, 1);
        ring.core.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
      ring.halo.clear();
      ring.halo.lineStyle(rects.halo.lineWidth, halo, 1);
      ring.halo.strokeRect(rects.halo.x, rects.halo.y, rects.halo.width, rects.halo.height);
      ring.core.setVisible(true);
      ring.halo.setVisible(true);
      scene.children.bringToTop(ring.core);
      scene.children.bringToTop(ring.halo);
      // Moving to the end of the list does not re-sort it: without this, a scene that
      // lifts an item (Pause's count badges) over the ring at depth 1 loses that order.
      scene.children.queueDepthSort();
      ring.pulse.resume();
    },
    hide: (owner) => {
      const ring = rings.get(scene);
      if (!ring?.owner.hide(owner)) return;
      ring.box = null;
      ring.core.setVisible(false);
      ring.halo.setVisible(false);
      ring.pulse.pause();
    },
  };
}

/**
 * One item that can be pointed at and focused: `paint` draws its own look from
 * `itemLook`, and focus also shows the shared ring round `box`. The pointer
 * alone never shows the ring.
 */
export function focusable(
  scene: Phaser.Scene,
  box: Box,
  paint: (look: ItemLook) => void,
): { setHovered(on: boolean): void; setFocused(on: boolean): void } {
  const owner = {};
  const state = { hovered: false, focused: false };
  const apply = (): void => {
    const look = itemLook(state);
    paint(look);
    if (look.ring) focusRing(scene).show(owner, box);
    else focusRing(scene).hide(owner);
  };
  apply();
  return {
    setHovered: (on) => {
      state.hovered = on;
      apply();
    },
    setFocused: (on) => {
      state.focused = on;
      apply();
    },
  };
}

/** What the ring is doing, for the browser suite. */
export interface FocusRingReport {
  visible: boolean;
  /** The focused item's box, and the ring's outer edge, in game pixels. */
  box: Box | null;
  outer: Box | null;
  haloAlpha: number;
  pulsing: boolean;
}

/** The scene's ring as drawn; read-only, for the browser suite. */
export function focusRingOf(scene: Phaser.Scene): FocusRingReport {
  const ring = rings.get(scene);
  const box = ring?.box ?? null;
  const out = ringOutset();
  return {
    visible: ring?.core.visible ?? false,
    box,
    outer: box && {
      x: box.x - out,
      y: box.y - out,
      width: box.width + 2 * out,
      height: box.height + 2 * out,
    },
    haloAlpha: ring?.halo.alpha ?? 0,
    pulsing: ring ? !ring.pulse.isPaused() : false,
  };
}
