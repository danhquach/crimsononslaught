import Phaser from 'phaser';
import { PASSIVE_COLOR, RELIC_COLOR, offerColor } from '../core/offerColors';
import type { PauseItem } from '../core/pauseModel';
import { FRAMES } from '../config/frames';
import { artFrame } from '../core/animation';
import {
  SPELL_ICON_ART_SIZE,
  addSpellIcon,
  buildIconArt,
  type IconSpell,
} from '../render/spellIcon';

/**
 * The pieces the pause screen (#252) and the result screen (#290) both draw a
 * run's build with: the crimson theme, framed strips, spell icons on rims,
 * passive tiles and relic gems with their counts, and the hero on its stand.
 * Each function adds its objects to `scene` and lays nothing else out.
 */

export const CRIMSON = 0xdc143c;
export const CRIMSON_CSS = '#dc143c';
export const WINE = 0x5a1620;
export const SERIF = 'Georgia, serif';

/** A passive tile's side; a relic gem fits the same slot. */
export const TILE = 32;
/** The HUD slot's size (CO-170): a whole-number scale keeps the art's pixels even. */
export const SPELL_ICON_SIZE = SPELL_ICON_ART_SIZE;

const HERO_CLIP = 'hero.idle.down';
const HERO_SCALE = 3;
/** A fallen hero (a lost run) is drawn grey on a grey stand. */
const FALLEN_TINT = 0x777777;
const FALLEN_RIM = 0x555555;

/** A framed strip with its label, if it has one; the caller fills it. */
export function drawStrip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label?: string,
): void {
  scene.add
    .rectangle(x - 4, y - 4, width + 8, height + 8)
    .setOrigin(0)
    .setStrokeStyle(1, 0x2a0a10);
  scene.add.rectangle(x, y, width, height, 0x17110f).setOrigin(0).setStrokeStyle(2, WINE);
  if (!label) return;
  scene.add.text(x + 14, y + 12, label.toUpperCase(), {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: CRIMSON_CSS,
  });
}

/**
 * A spell's icon on a black disc whose rim wears its kind's colour (CO-164),
 * as its level-up card did. Returns the rim.
 */
export function addSpellDisc(
  scene: Phaser.Scene,
  x: number,
  y: number,
  spell: IconSpell,
): Phaser.GameObjects.Arc {
  const rim = scene.add
    .circle(x, y, SPELL_ICON_SIZE / 2 + 3, 0x000000)
    .setStrokeStyle(2, offerColor('active', spell.id));
  addSpellIcon(scene, x, y, spell, 1);
  return rim;
}

/**
 * A passive's or relic buff's icon art (CO-179) at 1x, the spell icons' size,
 * on a black disc rimmed in `rim`, with its count on a badge. Returns the rim,
 * or `null` with no icon art, where the caller draws its lettered tile. With
 * `parts` (CO-193) every object added is also pushed there, so the HUD can
 * destroy a tile it redraws without wrapping it in a container.
 */
export function addBuildIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tile: Pick<PauseItem, 'id' | 'count'>,
  rim: number,
  parts?: Phaser.GameObjects.GameObject[],
): Phaser.GameObjects.Arc | null {
  const frame = buildIconArt(scene, tile.id);
  if (!frame) return null;
  const face = scene.add.circle(x, y, TILE / 2 + 2, 0x000000).setStrokeStyle(1, rim);
  const image = scene.add.image(x, y, FRAMES[frame].page, artFrame(frame));
  const badge = addBadge(scene, x + TILE / 2 - 2, y + TILE / 2 - 2, tile.count);
  parts?.push(face, image, badge);
  return face;
}

/**
 * A passive: a square tile with its letters and its rank on a badge. Returns
 * the face; `parts` collects every object added, as `addBuildIcon`'s does.
 */
export function addPassiveTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tile: Pick<PauseItem, 'abbr' | 'count'>,
  parts?: Phaser.GameObjects.GameObject[],
): Phaser.GameObjects.Rectangle {
  const face = scene.add.rectangle(x, y, TILE, TILE, 0x241a14).setStrokeStyle(1, PASSIVE_COLOR);
  const letters = scene.add
    .text(x, y, tile.abbr, { fontFamily: 'monospace', fontSize: '13px', color: '#e8d8b0' })
    .setOrigin(0.5);
  const badge = addBadge(scene, x + TILE / 2, y + TILE / 2, tile.count);
  parts?.push(face, letters, badge);
  return face;
}

/** A relic buff: a gem (a square on its point) with its letters and its stacks. Returns the face. */
export function addRelicGem(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tile: PauseItem,
): Phaser.GameObjects.Rectangle {
  const face = scene.add
    .rectangle(x, y, 24, 24, 0x4a1030)
    .setAngle(45)
    .setStrokeStyle(1, RELIC_COLOR);
  scene.add
    .text(x, y, tile.abbr, { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff' })
    .setOrigin(0.5);
  addBadge(scene, x + 14, y + 12, tile.count);
  return face;
}

export function addBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, `${count}`, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: CRIMSON_CSS,
      padding: { x: 3, y: 0 },
    })
    .setOrigin(0.5);
}

/**
 * The hero idling on its pedestal centred on (x, pedestalY), and the level
 * badge under it. A `fallen` hero (#290, a lost run) stands still in grey.
 */
export function drawHeroStand(
  scene: Phaser.Scene,
  x: number,
  pedestalY: number,
  level: number | string,
  fallen = false,
): void {
  const rim = fallen ? FALLEN_RIM : CRIMSON;
  scene.add.ellipse(x, pedestalY, 130, 30, 0x2a0a10).setStrokeStyle(2, rim);
  if (scene.anims.exists(HERO_CLIP)) {
    const hero = scene.add
      .sprite(x, pedestalY + 4, '__DEFAULT')
      .setOrigin(0.5, 1)
      .setScale(HERO_SCALE)
      .play(HERO_CLIP);
    if (fallen) {
      hero.anims.pause();
      // WebGL greys it out; the canvas renderer has no FX, so it only darkens.
      const fx = hero.preFX?.addColorMatrix();
      if (fx) fx.grayscale(1).brightness(0.6, true);
      else hero.setTint(FALLEN_TINT);
    }
  } else {
    // No atlas: a plain marker keeps the stand from looking empty.
    scene.add.circle(x, pedestalY - 40, 28, 0x2a0a10).setStrokeStyle(2, rim);
  }
  scene.add.rectangle(x, pedestalY + 30, 64, 22, CRIMSON);
  scene.add
    .text(x, pedestalY + 30, `LV ${level}`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
    })
    .setOrigin(0.5);
}
