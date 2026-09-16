import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { ResultScene } from './scenes/ResultScene';
import { SpellSelectScene } from './scenes/SpellSelectScene';
import { TextureDebugScene } from './scenes/TextureDebugScene';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

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
  // Flow: Boot -> SpellSelect -> Game (+ Hud overlay) -> Result -> SpellSelect.
  scene: [BootScene, SpellSelectScene, GameScene, HudScene, ResultScene, TextureDebugScene],
};

/**
 * Exported so dev tools and browser tests can reach the running game without a
 * global: `const { game } = await import('/src/main.ts')` resolves to this same
 * module instance under the Vite dev server.
 */
export const game = new Phaser.Game(config);
