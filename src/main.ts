import Phaser from 'phaser';
import { resolveSeed } from './core/rng';
import { BootScene } from './scenes/BootScene';
import { TextureDebugScene } from './scenes/TextureDebugScene';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Run seed: `?seed=<int>` reproduces a run; otherwise a fresh one per load.
// Logged so a bug report can quote it. Scenes receive it via GameScene.init (CO-010).
export const RUN_SEED = resolveSeed(window.location.search, Date.now());
console.info(`[rng] seed=${RUN_SEED}`);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
  },
  scene: [BootScene, TextureDebugScene],
};

new Phaser.Game(config);
