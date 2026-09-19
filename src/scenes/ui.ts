import Phaser from 'phaser';
import { audioOf } from '../render/audio';
import type { MenuItem } from './input';

const BUTTON_FILL = '#333333';
const BUTTON_FILL_SELECTED = '#5a1620';

/** Minimal clickable text button shared by the stub scenes and Result. */
export function addTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  const text = scene.add
    .text(x, y, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '28px',
      color: '#ffffff',
      backgroundColor: BUTTON_FILL,
      padding: { x: 16, y: 8 },
      ...style,
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
    text.setAlpha(0.8);
    audioOf(scene).play('ui.move');
  });
  text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => text.setAlpha(1));
  text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onClick);
  return text;
}

/** Wrap a text button as a `MenuItem`, so `attachMenuInput` can highlight and confirm it. */
export function textButtonItem(text: Phaser.GameObjects.Text, onConfirm: () => void): MenuItem {
  return {
    setSelected: (selected) =>
      text.setBackgroundColor(selected ? BUTTON_FILL_SELECTED : BUTTON_FILL),
    confirm: onConfirm,
  };
}
