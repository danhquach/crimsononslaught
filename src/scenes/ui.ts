import Phaser from 'phaser';

/**
 * Minimal clickable text button shared by the stub scenes and Result.
 * CO-020 extends this with gamepad confirm via the shared Input helper.
 */
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
      backgroundColor: '#333333',
      padding: { x: 16, y: 8 },
      ...style,
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => text.setAlpha(0.8));
  text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => text.setAlpha(1));
  text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onClick);
  return text;
}
