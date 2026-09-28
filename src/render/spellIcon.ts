import Phaser from 'phaser';
import { buildIconFrame } from '../config/buildIcons';
import { FRAMES, type FrameName } from '../config/frames';
import { spellIconFrame } from '../config/spellIcons';
import { artFrame } from '../core/animation';
import { spellGlyph } from '../core/hudModel';
import { hasFrameArt } from './atlas';

/** The CO-154 icon's art box: 32 px square inside its 36 px frame, what the HUD slot draws at 1x. */
export const SPELL_ICON_ART_SIZE = 32;

/**
 * The art a spell's icon draws: its CO-154 frame, or `null` for a spell with
 * no icon art or a run with no atlas, which shows its colour and letters
 * instead. The one place that choice is made (CO-170), for the cards, the pause
 * screen and the HUD slot alike.
 */
export function spellIconArt(scene: Phaser.Scene, id: string): FrameName | null {
  const frame = spellIconFrame(id);
  return frame && hasFrameArt(scene, frame) ? frame : null;
}

/** A passive's or relic buff's icon art (CO-179), or `null` for one with none or a run with no atlas. */
export function buildIconArt(scene: Phaser.Scene, id: string): FrameName | null {
  const frame = buildIconFrame(id);
  return frame && hasFrameArt(scene, frame) ? frame : null;
}

/** What an icon knows about the spell it shows. */
export interface IconSpell {
  id: string;
  name: string;
  color: number;
}

/**
 * A spell's icon on a card (CO-155) or the pause screen (CO-170), centred on (x, y) at a whole-number
 * `scale` of the HUD slot's size, so its nearest-neighbour pixels stay even:
 * the spell's CO-154 art, or — for a spell with no icon art, or a run with no
 * atlas — a disc in its colour with its initials, as its HUD slot falls back
 * to. Returns the objects for the caller's container; none is interactive.
 */
export function addSpellIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  spell: Readonly<IconSpell>,
  scale: number,
): Phaser.GameObjects.GameObject[] {
  const size = SPELL_ICON_ART_SIZE * scale;
  const frame = spellIconArt(scene, spell.id);
  if (frame) {
    const icon = scene.add.image(x, y, FRAMES[frame].page, artFrame(frame));
    return [icon.setScale(size / Math.max(icon.width, icon.height))];
  }
  const disc = scene.add.circle(x, y, size / 2, spell.color).setStrokeStyle(2, 0x777777);
  const glyph = scene.add
    .text(x, y, spellGlyph(spell.name), {
      fontFamily: 'monospace',
      fontSize: `${13 * scale}px`,
      color: '#eeeeee',
      stroke: '#000000',
      strokeThickness: 2 * scale,
    })
    .setOrigin(0.5);
  return [disc, glyph];
}
