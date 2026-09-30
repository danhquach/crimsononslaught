import Phaser from 'phaser';
import { FRAMES, type FrameName } from '../config/frames';
import {
  MINIMAP_BOSS_ICON_SIZE,
  MINIMAP_BOX,
  MINIMAP_COLORS,
  MINIMAP_ENEMY_DOT,
  MINIMAP_ICON_FRAMES,
  MINIMAP_ICON_SIZE,
  MINIMAP_MAX_PICKUPS,
  type MinimapPickupKind,
  type MinimapSettings,
} from '../config/minimap';
import { artFrame } from '../core/animation';
import { buildMinimapView, type MinimapFrame, type MinimapView } from '../core/minimap';
import { hasFrameArt } from '../render/atlas';

/** The minimap's layers, in draw order; each is one Graphics, so a switch hides one object. */
type Layer = 'viewport' | 'pickups' | 'enemies' | 'boss';

/** What the browser suite reads back: the box, the layers showing and the two sides of the mapping. */
export interface MinimapReport {
  visible: boolean;
  bounds: { left: number; top: number; right: number; bottom: number };
  layers: Record<Layer, boolean>;
  /** The last snapshot from the run, in world px. */
  world: MinimapFrame | null;
  /** What was drawn from it, in px from the box's top-left. */
  map: MinimapView | null;
  /** The atlas icons showing, in px from the box's top-left; empty when the map draws flat shapes. */
  icons: { frame: FrameName; x: number; y: number }[];
}

type IconKind = MinimapPickupKind | 'boss';

/** Whether every marker's frame can be drawn as art; the atlas installs all pages or none. */
function iconsArt(scene: Phaser.Scene): boolean {
  return Object.values(MINIMAP_ICON_FRAMES).every((frame) => hasFrameArt(scene, frame));
}

/** An atlas frame scaled so its longer side is `size` px, centred on (x, y). */
function setIcon(icon: Phaser.GameObjects.Image, kind: IconKind, size: number): void {
  const frame = MINIMAP_ICON_FRAMES[kind];
  icon.setTexture(FRAMES[frame].page, artFrame(frame));
  icon.setScale(size / Math.max(icon.width, icon.height));
}

/**
 * The icon a Minimap switch shows in Settings, centred on (x, y) and `size` px
 * across: the ring for the map, the white box for the viewport, atlas art for
 * the boss and pickups (the radar's flat shape without it) and red dots for enemies.
 */
export function addSwitchIcon(
  scene: Phaser.Scene,
  key: keyof MinimapSettings,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Graphics | Phaser.GameObjects.Image {
  const g = scene.add.graphics();
  const r = size / 2;
  if (key === 'on') {
    g.fillStyle(MINIMAP_COLORS.plate, MINIMAP_COLORS.plateAlpha).fillCircle(x, y, r);
    g.lineStyle(1, MINIMAP_COLORS.ring, 1).strokeCircle(x, y, r - 0.5);
  } else if (key === 'viewport') {
    g.lineStyle(1, MINIMAP_COLORS.viewport, 1).strokeRect(
      x - r + 0.5,
      y - r * 0.6,
      size - 1,
      r * 1.2,
    );
  } else if (key === 'enemies') {
    g.fillStyle(MINIMAP_COLORS.enemy, 1);
    for (const [dx, dy] of [
      [-4, -3],
      [3, -4],
      [0, 0],
      [-3, 4],
      [4, 3],
    ] as const) {
      g.fillRect(x + dx - 1.5, y + dy - 1.5, 3, 3);
    }
  } else {
    const kind: IconKind = key === 'boss' ? 'boss' : 'chest';
    if (iconsArt(scene)) {
      g.destroy();
      const icon = scene.add.image(x, y, FRAMES[MINIMAP_ICON_FRAMES[kind]].page);
      setIcon(icon, kind, size);
      return icon;
    }
    g.fillStyle(MINIMAP_COLORS[kind], 1);
    if (kind === 'boss') g.fillCircle(x, y, r * 0.7);
    else g.fillRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
  }
  return g;
}

/**
 * CO-207: the HUD's minimap, a round radar with the player at its centre: a
 * plate and ring, the arena's edge where it is in range, the player, and the
 * layers the player's switches turn on. The run hands over a snapshot every
 * 100 ms and each layer is cleared and redrawn from it then, never per frame; the enemies are `fillRect`s on one Graphics, so a full crowd is one
 * draw object.
 */
export class Minimap {
  private readonly box: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly edge: Phaser.GameObjects.Graphics;
  private readonly layers: Record<Layer, Phaser.GameObjects.Graphics>;
  private readonly player: Phaser.GameObjects.Graphics;
  /** A fixed pool of atlas icons, repositioned on every snapshot; empty without the atlas. */
  private readonly pickupIcons: Phaser.GameObjects.Image[] = [];
  private readonly bossIcon: Phaser.GameObjects.Image | null = null;
  /** What each pooled icon shows now, so a texture is only set when the kind changes. */
  private readonly shown: (IconKind | null)[] = [];
  private icons: MinimapReport['icons'] = [];
  private world: MinimapFrame | null = null;
  private map: MinimapView | null = null;

  constructor(scene: Phaser.Scene) {
    const make = (): Phaser.GameObjects.Graphics => scene.add.graphics();
    this.plate = make();
    this.edge = make();
    this.layers = { viewport: make(), pickups: make(), enemies: make(), boss: make() };
    this.player = make();
    if (iconsArt(scene)) {
      const pool = (): Phaser.GameObjects.Image =>
        scene.add.image(0, 0, FRAMES[MINIMAP_ICON_FRAMES.health].page).setVisible(false);
      for (let i = 0; i < MINIMAP_MAX_PICKUPS; i++) this.pickupIcons.push(pool());
      this.bossIcon = pool();
    }
    this.box = scene.add
      .container(MINIMAP_BOX.x, MINIMAP_BOX.y, [
        this.plate,
        this.edge,
        this.layers.viewport,
        this.layers.pickups,
        ...this.pickupIcons,
        this.layers.enemies,
        this.layers.boss,
        ...(this.bossIcon ? [this.bossIcon] : []),
        this.player,
      ])
      .setVisible(false);
    const r = MINIMAP_BOX.size / 2;
    this.plate
      .fillStyle(MINIMAP_COLORS.plate, MINIMAP_COLORS.plateAlpha)
      .fillCircle(r, r, r)
      .lineStyle(1, MINIMAP_COLORS.ring, 1)
      .strokeCircle(r, r, r - 0.5);
  }

  get report(): MinimapReport {
    const { x, y, size } = MINIMAP_BOX;
    return {
      visible: this.box.visible,
      bounds: { left: x, top: y, right: x + size, bottom: y + size },
      layers: {
        viewport: this.layers.viewport.visible,
        pickups: this.layers.pickups.visible,
        enemies: this.layers.enemies.visible,
        boss: this.layers.boss.visible,
      },
      world: this.world,
      map: this.map,
      icons: this.icons,
    };
  }

  /** The box's own objects, so a check of the rest of the HUD can leave them out. */
  get parts(): Phaser.GameObjects.GameObject[] {
    return [this.box];
  }

  hide(): void {
    this.box.setVisible(false);
  }

  /** Draw a snapshot. A switch that is off hides its layer; the Minimap switch hides the box. */
  show(frame: MinimapFrame): void {
    this.world = frame;
    this.box.setVisible(frame.settings.on);
    if (!frame.settings.on) return;
    const view = buildMinimapView(frame, MINIMAP_BOX.size);
    this.map = view;
    this.edge.clear().lineStyle(1, MINIMAP_COLORS.outline, 1);
    for (const s of view.arena) this.edge.lineBetween(s.x1, s.y1, s.x2, s.y2);

    const { viewport, pickups, enemies, boss } = this.layers;
    viewport.setVisible(view.viewport !== null).clear();
    if (view.viewport) {
      viewport.lineStyle(1, MINIMAP_COLORS.viewport, 0.9);
      for (const s of view.viewport) viewport.lineBetween(s.x1, s.y1, s.x2, s.y2);
    }
    pickups.setVisible(frame.settings.pickups).clear();
    this.icons = [];
    view.pickups.forEach((p, i) => {
      const icon = this.pickupIcons[i];
      if (!icon) {
        pickups.fillStyle(MINIMAP_COLORS[p.kind], 1).fillRect(p.x - 2, p.y - 2, 4, 4);
        return;
      }
      this.place(icon, i, p.kind, MINIMAP_ICON_SIZE, p);
    });
    for (let i = view.pickups.length; i < this.pickupIcons.length; i++) {
      this.pickupIcons[i]?.setVisible(false);
    }
    enemies.setVisible(frame.settings.enemies).clear().fillStyle(MINIMAP_COLORS.enemy, 1);
    for (let i = 0; i + 1 < view.enemies.length; i += 2) {
      const dot = MINIMAP_ENEMY_DOT;
      enemies.fillRect(
        (view.enemies[i] ?? 0) - dot / 2,
        (view.enemies[i + 1] ?? 0) - dot / 2,
        dot,
        dot,
      );
    }
    boss.setVisible(view.boss !== null).clear();
    this.bossIcon?.setVisible(false);
    if (view.boss && this.bossIcon) {
      this.place(this.bossIcon, this.pickupIcons.length, 'boss', MINIMAP_BOSS_ICON_SIZE, view.boss);
    } else if (view.boss) {
      boss.fillStyle(MINIMAP_COLORS.boss, 1).fillCircle(view.boss.x, view.boss.y, 4);
    }
    this.player
      .clear()
      .fillStyle(MINIMAP_COLORS.player, 1)
      .fillRect(view.player.x - 2, view.player.y - 2, 4, 4);
  }

  /** Show a pooled icon for `kind` at the marker, changing its texture only when its kind changed. */
  private place(
    icon: Phaser.GameObjects.Image,
    slot: number,
    kind: IconKind,
    size: number,
    at: { x: number; y: number },
  ): void {
    if (this.shown[slot] !== kind) {
      setIcon(icon, kind, size);
      this.shown[slot] = kind;
    }
    icon.setPosition(at.x, at.y).setVisible(true);
    this.icons.push({ frame: MINIMAP_ICON_FRAMES[kind], x: at.x, y: at.y });
  }
}
