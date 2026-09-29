import type { Rng } from './rng';

/**
 * The look of one menu row (CO-191), decided apart from Phaser so the rules
 * are testable: which of hover, selection and the like wins, and what each
 * looks like. `scenes/menuUi.ts` paints the answer.
 */
export interface RowState {
  /** The arrows or a pad have it highlighted. */
  selected: boolean;
  /** The pointer is over it. */
  hovered: boolean;
  /** It can be acted on. */
  enabled: boolean;
  /** It marks where the player is, as the open tab does. */
  active: boolean;
  /** It is a switch that is off: readable, but quieter than one that is on. */
  dim: boolean;
}

export type RowText = 'rest' | 'lit' | 'active' | 'off' | 'dim';

export interface RowLook {
  /** The ▶ marker and the crimson edge (or the plate's lit frame) show. */
  lit: boolean;
  /** How strongly the wine bar behind the label is filled. */
  fillAlpha: number;
  text: RowText;
}

const FILL_SELECTED = 1;
const FILL_HOVERED = 0.6;
const FILL_ACTIVE = 0.5;
/** A dim row keeps this share of its bar's rest fill. */
const DIM_FILL = 0.4;

/**
 * Selection beats hover, and both beat the active mark and the dim of an off switch; a lit row reads white
 * whatever it also is. A disabled row never answers the pointer and keeps its
 * dim label, but still shows where the arrows have landed. `restAlpha` is the
 * bar's fill with nothing going on, faint for a button and none for a list row.
 */
export function rowLook(state: RowState, restAlpha = 0): RowLook {
  if (state.selected) {
    const text = state.enabled ? 'lit' : 'off';
    return { lit: true, fillAlpha: state.enabled ? FILL_SELECTED : FILL_HOVERED, text };
  }
  if (!state.enabled) return { lit: false, fillAlpha: restAlpha, text: 'off' };
  if (state.hovered) return { lit: true, fillAlpha: FILL_HOVERED, text: 'lit' };
  if (state.active) return { lit: false, fillAlpha: FILL_ACTIVE, text: 'active' };
  if (state.dim) return { lit: false, fillAlpha: restAlpha * DIM_FILL, text: 'dim' };
  return { lit: false, fillAlpha: restAlpha, text: 'rest' };
}

/** One drifting spark on the front door, all values fixed at creation. */
export interface Ember {
  x: number;
  /** Where its climb starts, and how far it rises. */
  y: number;
  rise: number;
  /** Sideways sway, in px, and how many swings it makes on the way up. */
  sway: number;
  swings: number;
  /** Seconds for one climb, and the seconds a start is put off so they do not rise together. */
  life: number;
  delay: number;
  /** Where in the flicker it starts. */
  phase: number;
  scale: number;
}

export interface EmberPose {
  x: number;
  y: number;
  alpha: number;
  frame: number;
  scale: number;
}

const EMBER_PEAK_ALPHA = 0.85;
const EMBER_FLICKER_HZ = 9;

/** `count` embers scattered over a `width` x `height` canvas, from `rng` alone. */
export function makeEmbers(rng: Rng, count: number, width: number, height: number): Ember[] {
  return Array.from({ length: count }, () => ({
    x: rng.next() * width,
    y: height * (0.6 + rng.next() * 0.45),
    rise: height * (0.35 + rng.next() * 0.4),
    sway: 6 + rng.next() * 18,
    swings: 1 + rng.next() * 2,
    life: 6 + rng.next() * 6,
    delay: rng.next() * 8,
    phase: rng.next() * 4,
    scale: 0.7 + rng.next() * 0.9,
  }));
}

/**
 * Where an ember is a fraction `t` of the way up its climb: it fades in over
 * the first tenth, out over the last third, sways as it rises and flickers
 * through `frames` frames.
 */
export function emberPose(ember: Ember, t: number, frames: number): EmberPose {
  const fadeIn = Math.min(1, t / 0.1);
  const fadeOut = Math.min(1, (1 - t) / 0.35);
  return {
    x: ember.x + Math.sin(t * ember.swings * Math.PI * 2) * ember.sway,
    y: ember.y - t * ember.rise,
    alpha: EMBER_PEAK_ALPHA * Math.max(0, Math.min(fadeIn, fadeOut)),
    frame: Math.floor(ember.phase + t * ember.life * EMBER_FLICKER_HZ) % frames,
    scale: ember.scale,
  };
}
