import Phaser from 'phaser';
import { generatePlaceholderTextures } from '../render/textures';

/**
 * First scene: builds the placeholder textures every later scene draws with,
 * then hands off. Until SpellSelect exists (CO-010) it shows the title;
 * `?debug=textures` opens the CO-005 texture check instead.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generatePlaceholderTextures(this);

    if (new URLSearchParams(location.search).get('debug') === 'textures') {
      this.scene.start('TextureDebug');
      return;
    }

    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'Crimson Onslaught', {
        fontFamily: 'Georgia, serif',
        fontSize: '64px',
        color: '#dc143c',
      })
      .setOrigin(0.5);
  }
}
