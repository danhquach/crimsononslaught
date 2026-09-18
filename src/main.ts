import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CollisionDebugScene } from './scenes/CollisionDebugScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { LevelUpScene } from './scenes/LevelUpScene';
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
  // The atlas is pixel art at native size (CO-081): sample it nearest-neighbour
  // and draw on whole pixels, or every sprite renders soft and shimmers.
  render: {
    pixelArt: true,
    roundPixels: true,
  },
  // Phaser's Gamepad plugin is off by default; the player and the menus both
  // read a pad through `scenes/input.ts` (spec §5).
  input: {
    gamepad: true,
  },
  // Flow: Boot -> SpellSelect -> Game (+ Hud overlay, LevelUp overlay on level-up) -> Result -> SpellSelect.
  scene: [
    BootScene,
    SpellSelectScene,
    GameScene,
    HudScene,
    LevelUpScene,
    ResultScene,
    TextureDebugScene,
    CollisionDebugScene,
  ],
};

/**
 * Exported so dev tools and browser tests can reach the running game without a
 * global: `const { game } = await import('/src/main.ts')` resolves to this same
 * module instance under the Vite dev server.
 */
export const game = new Phaser.Game(config);
