import Phaser from 'phaser';
import { SCENE } from '../core/scenePayloads';

/**
 * Stub HUD overlay, launched by Game and stopped by it when the run ends.
 * CO-012 fills it with timer, HP / XP bars and the boss bar driven by RunState events.
 */
export class HudScene extends Phaser.Scene {
  constructor() {
    super(SCENE.hud);
  }

  create(): void {
    this.add.text(12, 8, 'HUD (stub)', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#cccccc',
    });
  }
}
