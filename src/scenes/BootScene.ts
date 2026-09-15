import Phaser from 'phaser';

/**
 * First scene. For now it only shows the title; later tickets add
 * placeholder-texture generation (CO-005) and the hand-off to SpellSelect (CO-010).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
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
