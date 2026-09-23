import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CollisionDebugScene } from './scenes/CollisionDebugScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { IntroScene } from './scenes/IntroScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { ProfileScene } from './scenes/ProfileScene';
import { ResultScene } from './scenes/ResultScene';
import { SettingsScene } from './scenes/SettingsScene';
import { SpellSelectScene } from './scenes/SpellSelectScene';
import { TextureDebugScene } from './scenes/TextureDebugScene';
import { UpgradesScene } from './scenes/UpgradesScene';

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
  // Flow: Boot -> Intro -> SpellSelect -> Game (+ Hud overlay, LevelUp overlay on level-up) -> Result -> SpellSelect.
  // Intro <-> Settings and Intro <-> Profile are its panels (#121); SpellSelect <-> Upgrades is the meta loop (CO-101).
  scene: [
    BootScene,
    IntroScene,
    SettingsScene,
    ProfileScene,
    SpellSelectScene,
    UpgradesScene,
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
