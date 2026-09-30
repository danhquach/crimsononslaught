import Phaser from 'phaser';
import { MENU_ART } from '../config/menuArt';
import { rowLook, type RowLook, type RowText } from '../core/menuStyle';
import { audioOf } from '../render/audio';
import { focusRing } from './focusRing';
import { CRIMSON, CRIMSON_CSS, SERIF, WINE, drawStrip } from './buildStrips';
import type { MenuItem } from './input';

/**
 * The menu screens' shared look (CO-191): the painted backdrop, the crimson
 * title, the rows, the framed panels and the hint line. Intro, Settings,
 * Profile, Help, Upgrades and SpellSelect draw with these, so a tweak lands on
 * every one of them, Pause's rows and buttons included. A focused row also wears
 * the shared focus ring (CO-196, `focusRing.ts`).
 */

/** The title face for the front door, with the serif behind it while the font loads. */
export const TITLE_FONT = `${MENU_ART.font.family}, ${SERIF}`;

const HINT = 'click, arrows + Enter, or a gamepad';
/** How dark the quiet backdrop lays over the painting. */
const QUIET_ALPHA = 0.6;
const HINT_HEIGHT = 30;
const ROW_HEIGHT = 34;
/** The label colours, one per `RowText`. */
const TEXT_COLOR: Readonly<Record<RowText, string>> = {
  rest: '#bdb3a8',
  lit: '#ffffff',
  active: '#ff4d66',
  off: '#6f665d',
  dim: '#9b9188',
};
/** A bar shows faintly at rest so it reads as a button. */
const BUTTON_REST_ALPHA = 0.35;
/**
 * A lit bar at least this wide shows the ▶ at a fixed inset, so the marker never
 * depends on how wide the font draws a label. The − and + steppers and Buy are
 * narrower and show only the crimson edge, never the ▶. Callers keep a centred
 * label at least `MARKER_CLEARANCE` px from the row's left edge; `menuLook.spec`
 * checks it on the real font.
 */
const MARKER_MIN_WIDTH = 100;
const MARKER_INSET = 12;

export const drawPanel = drawStrip;

/** Queue the menu art and the title font in `preload`. */
export function queueMenuArt(scene: Phaser.Scene): void {
  const { bg, plate, ember, title, font } = MENU_ART;
  scene.load.image(bg.key, bg.url);
  scene.load.image(title.key, title.url);
  scene.load.image(plate.key, plate.url);
  scene.load.spritesheet(ember.key, ember.url, { frameWidth: ember.size, frameHeight: ember.size });
  scene.load.font(font.family, font.url, 'woff2');
}

/**
 * A missing image is one console warning, not a crash: the plates fall back to
 * the bar look, the title to lettering in the title face and the backdrop to black. Checked after `preload`, like the
 * atlas, so a file the dev server answers with its page counts too.
 */
export function warnIfMenuArtMissing(scene: Phaser.Scene): void {
  const missing = [MENU_ART.bg, MENU_ART.plate, MENU_ART.ember, MENU_ART.title].filter(
    (art) => !scene.textures.exists(art.key),
  );
  if (missing.length === 0) return;
  console.warn(
    `[menu] ${missing.map((art) => art.url).join(', ')} did not load; using plain menus`,
  );
}

/**
 * The painting behind a menu: the full scene on the front door, and under
 * every other screen the same painting darkened. Adds no text, so a screen's
 * first texts are its own.
 */
export function drawMenuBackdrop(scene: Phaser.Scene, mode: 'full' | 'quiet'): void {
  const { width, height } = scene.scale;
  if (scene.textures.exists(MENU_ART.bg.key)) scene.add.image(0, 0, MENU_ART.bg.key).setOrigin(0);
  // Canvas has no tint, so the quiet backdrop is a black veil.
  if (mode === 'quiet')
    scene.add.rectangle(0, 0, width, height, 0x000000, QUIET_ALPHA).setOrigin(0);
}

/** A screen's title, in the pause screen's "Paused" style. */
export function addMenuTitle(scene: Phaser.Scene, x: number, y: number, label: string): void {
  scene.add
    .text(x, y, label, { fontFamily: SERIF, fontSize: '42px', color: CRIMSON_CSS })
    .setOrigin(0.5);
}

/** The input hint on a dark strip along the bottom edge. */
export function addHintLine(scene: Phaser.Scene, text = HINT): void {
  const { width, height } = scene.scale;
  scene.add.rectangle(0, height - HINT_HEIGHT, width, HINT_HEIGHT, 0x000000, 0.6).setOrigin(0);
  scene.add
    .text(width / 2, height - HINT_HEIGHT / 2, text, {
      fontFamily: SERIF,
      fontSize: '14px',
      color: '#a89f94',
    })
    .setOrigin(0.5);
}

export interface MenuRowSpec {
  /** A painted plate (needs the art; falls back to a bar without it) or a wine bar. */
  kind: 'plate' | 'bar';
  label: string;
  /** The row's centre and width; a plate is as tall as its art, a bar 34 px. */
  x: number;
  y: number;
  width: number;
  onConfirm: () => void;
  /** A bar's label stays left with a ▶ before it, as Pause's menu does; the default is centred. */
  align?: 'left' | 'center';
  /** A bar's fill with nothing going on: `BUTTON_REST_ALPHA` by default, 0 for a list row. */
  restAlpha?: number;
}

export interface MenuRow extends MenuItem {
  setLabel(label: string): void;
  /** A disabled row ignores the pointer and dims; the arrows can still land on it. */
  setEnabled(enabled: boolean): void;
  /** Marks where the player is, as an open tab does. */
  setActive(active: boolean): void;
  /** Dims the label and the bar at rest, as a switch that is off; the row still answers. */
  setDim(dim: boolean): void;
}

/** What a row reports to the browser suite (`menuRowsOf`). */
export interface MenuRowReport {
  label: string;
  /** In game pixels. */
  bounds: { x: number; y: number; width: number; height: number };
  selected: boolean;
  /** The pointer is over it. */
  hovered: boolean;
  enabled: boolean;
  active: boolean;
  dim: boolean;
  /** The label's own box, in game pixels: what the browser suite measures contrast in. */
  labelBounds: { x: number; y: number; width: number; height: number };
}

const reports = new WeakMap<Phaser.Scene, (() => MenuRowReport)[]>();

/** Every row the scene drew, in the order it drew them; read-only, for the browser suite. */
export function menuRowsOf(scene: Phaser.Scene): MenuRowReport[] {
  return (reports.get(scene) ?? []).map((report) => report());
}

const PLATE_PARTS = ['l', 'm', 'r'] as const;

/** The plate's pieces as frames of its image, cut once per game: left cap, plain middle, right cap. */
function plateFrames(scene: Phaser.Scene): void {
  const { plate } = MENU_ART;
  const texture = scene.textures.get(plate.key);
  if (texture.has('rest.l')) return;
  const middle = plate.width - plate.capLeft - plate.capRight;
  (['rest', 'lit'] as const).forEach((state, i) => {
    const y = i * plate.height;
    texture.add(`${state}.l`, 0, 0, y, plate.capLeft, plate.height);
    texture.add(`${state}.m`, 0, plate.capLeft, y, middle, plate.height);
    texture.add(`${state}.r`, 0, plate.width - plate.capRight, y, plate.capRight, plate.height);
  });
}

/**
 * One menu row: a label with a ▶ marker, on a plate or a wine bar with a
 * crimson edge. Every way of lighting it, the pointer, the arrows or a pad,
 * goes through `paint`, the one place the focus look is decided.
 */
export function addMenuRow(scene: Phaser.Scene, spec: MenuRowSpec): MenuRow {
  const { x, y, width } = spec;
  const plated = spec.kind === 'plate' && scene.textures.exists(MENU_ART.plate.key);
  const height = plated ? MENU_ART.plate.height : ROW_HEIGHT;
  const left = x - width / 2;
  const listed = !plated && spec.align === 'left';
  const restAlpha = plated ? 0 : (spec.restAlpha ?? BUTTON_REST_ALPHA);

  // Drawn back to front; the zone on top takes the pointer for all of it.
  let paintBody: (look: RowLook) => void;
  if (plated) {
    plateFrames(scene);
    const { key, capLeft, capRight } = MENU_ART.plate;
    const parts = PLATE_PARTS.map((part) =>
      scene.add.image(0, y, key, `rest.${part}`).setOrigin(0, 0.5),
    );
    parts[0]?.setX(left);
    parts[1]?.setX(left + capLeft).setDisplaySize(width - capLeft - capRight, height);
    parts[2]?.setX(left + width - capRight);
    paintBody = (look) =>
      parts.forEach((part, i) => part.setFrame(`${look.lit ? 'lit' : 'rest'}.${PLATE_PARTS[i]}`));
  } else {
    const bar = scene.add.rectangle(x, y, width, height, WINE, restAlpha);
    const edge = scene.add.rectangle(left + 1.5, y, 3, height, CRIMSON).setAlpha(0);
    paintBody = (look) => {
      bar.setFillStyle(WINE, look.fillAlpha);
      edge.setAlpha(look.lit ? 1 : 0);
    };
  }
  const text = scene.add
    .text(listed ? left + 32 : x, y, spec.label, {
      fontFamily: plated ? TITLE_FONT : SERIF,
      fontSize: plated ? '26px' : '20px',
      color: TEXT_COLOR.rest,
    })
    .setOrigin(listed ? 0 : 0.5, 0.5);
  const markerAt = left + (plated ? MENU_ART.plate.capLeft + 8 : MARKER_INSET);
  const marker = scene.add
    .text(markerAt, y, '▶', {
      fontFamily: SERIF,
      fontSize: plated ? '16px' : '14px',
      color: CRIMSON_CSS,
    })
    .setOrigin(0, 0.5)
    .setAlpha(0);
  const showsMarker = plated || width >= MARKER_MIN_WIDTH;

  const state = { selected: false, hovered: false, enabled: true, active: false, dim: false };
  const owner = {};
  const rowBox = { x: left, y: y - height / 2, width, height };
  let shown: RowText | null = null;
  const paint = (): void => {
    const look = rowLook(state, restAlpha);
    paintBody(look);
    if (look.focused) focusRing(scene).show(owner, rowBox);
    else focusRing(scene).hide(owner);
    marker.setAlpha(look.lit && showsMarker ? 1 : 0);
    // Setting a colour redraws the text, so only when it changes.
    if (look.text !== shown) text.setColor(TEXT_COLOR[look.text]);
    shown = look.text;
  };
  paint();

  const zone = scene.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });
  zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
    state.hovered = true;
    paint();
    audioOf(scene).play('ui.move');
  });
  zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    state.hovered = false;
    paint();
  });
  zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, spec.onConfirm);

  const list = reports.get(scene) ?? [];
  if (list.length === 0)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => reports.delete(scene));
  list.push(() => {
    const box = text.getBounds();
    return {
      label: text.text,
      bounds: { ...rowBox },
      labelBounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      selected: state.selected,
      hovered: state.hovered,
      enabled: state.enabled,
      active: state.active,
      dim: state.dim,
    };
  });
  reports.set(scene, list);

  return {
    setSelected: (selected) => {
      state.selected = selected;
      paint();
    },
    confirm: spec.onConfirm,
    setLabel: (label) => {
      if (text.text === label) return;
      text.setText(label);
      paint();
    },
    setEnabled: (enabled) => {
      if (state.enabled === enabled) return;
      state.enabled = enabled;
      if (enabled) zone.setInteractive({ useHandCursor: true });
      else {
        state.hovered = false;
        zone.disableInteractive();
      }
      paint();
    },
    setActive: (active) => {
      state.active = active;
      paint();
    },
    setDim: (dim) => {
      if (state.dim === dim) return;
      state.dim = dim;
      paint();
    },
  };
}
