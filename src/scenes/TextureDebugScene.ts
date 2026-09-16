import Phaser from 'phaser';
import { PLACEHOLDERS, TEXTURE_KEYS } from '../config/colors';

/**
 * Dev-only check for CO-005: draws every texture key in a row with its label.
 * Reached via `?debug=textures`; never part of the normal scene flow.
 */
export class TextureDebugScene extends Phaser.Scene {
  constructor() {
    super('TextureDebug');
  }

  create(): void {
    const { width, height } = this.scale;
    const step = width / (TEXTURE_KEYS.length + 1);
    const y = height / 2;

    this.add
      .text(width / 2, 40, 'Placeholder textures', { fontFamily: 'monospace', fontSize: '24px' })
      .setOrigin(0.5);

    TEXTURE_KEYS.forEach((key, i) => {
      const x = step * (i + 1);
      const img = this.add.image(x, y, key);
      const spec = PLACEHOLDERS[key];
      this.add
        .text(x, y + 70, `${key}\n${spec.shape}\n${img.width}x${img.height}`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          align: 'center',
        })
        .setOrigin(0.5, 0);
    });
  }
}
