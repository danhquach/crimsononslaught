import Phaser from 'phaser';
import { INFO_HINT } from '../core/pauseModel';
import { focusable, frameBox } from './focusRing';

/**
 * Inspecting the run's build (CO-179, CO-198): the pause and result screens
 * draw the same strips, and each item in them reads out on an info line for a
 * pointer, the arrows or a pad alike.
 */

/** One readable item in a strip, for the pointer and the pad alike. */
export interface BuildSlot {
  x: number;
  y: number;
  /** Its face's size, for the focus ring's box. */
  size: number;
  /** What the info line reads for it. */
  info: string;
  setLit(on: boolean): void;
}

export interface InspectOptions {
  x: number;
  y: number;
  /** The face's size, for the focus ring's box. */
  size: number;
  info: string;
  /** The rim colour a lit face thickens in. */
  rim: number;
  /** The rim's width at rest; lit adds one. */
  restWidth?: number;
}

/**
 * Draws one item with `draw` and makes it readable. Its count badge (a pill and
 * its text, and any letters), or a spell's level pill (#326), is lifted over
 * the focus ring, which sits at depth 0, so the ring never clips the count or
 * a MAX pill. Pointing at the face, or the pad selecting it, thickens its rim
 * and calls `onPoint` with the slot (`null` once the pointer leaves); the pad's
 * focus also draws the shared ring round it (CO-196).
 */
export function addInspectable(
  scene: Phaser.Scene,
  draw: () => Phaser.GameObjects.Shape,
  { x, y, size, info, rim, restWidth = 1 }: InspectOptions,
  onPoint: (slot: BuildSlot | null) => void,
): BuildSlot {
  const before = scene.children.list.length;
  const face = draw();
  for (const o of scene.children.list.slice(before)) {
    if (o.type === 'Text' || o.type === 'Graphics') {
      (o as Phaser.GameObjects.Text | Phaser.GameObjects.Graphics).setDepth(1);
    }
  }
  const focus = focusable(scene, frameBox(x, y, size, size), ({ raised }) => {
    face.setStrokeStyle(raised ? restWidth + 1 : restWidth, rim);
  });
  const slot: BuildSlot = { x, y, size, info, setLit: focus.setFocused };
  face.setInteractive();
  face.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
    focus.setHovered(true);
    onPoint(slot);
  });
  face.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    focus.setHovered(false);
    onPoint(null);
  });
  return slot;
}

/** The info line's text and colour for a slot, or the hint when nothing is pointed at. */
export function infoLook(slot: BuildSlot | null): { text: string; color: string } {
  return slot ? { text: slot.info, color: '#eeeeee' } : { text: INFO_HINT, color: '#888888' };
}
