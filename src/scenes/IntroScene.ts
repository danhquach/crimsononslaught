import Phaser from 'phaser';
import { SAVE_RESET_REGISTRY_KEY, SCENE } from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import { attachMenuInput } from './input';
import { addTextButton, textButtonItem } from './ui';

const MENU_TOP = 280;
const MENU_GAP = 68;
const BUTTON_WIDTH = 280;

/**
 * The front door (#121): the title and a three-entry menu. Start Game goes to
 * SpellSelect, which starts the run exactly as it did when it was the first
 * screen — the seed is Boot's, read from the registry there. Settings and
 * Profile are panels that come back here.
 *
 * Click, arrow keys and Enter, or a gamepad all drive the menu; Enter with
 * nothing highlighted starts a game. A save Boot had to reset is announced
 * here, once.
 */
export class IntroScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super(SCENE.intro);
  }

  create(): void {
    this.leaving = false;
    const { width, height } = this.scale;

    this.add
      .text(width / 2, 150, 'Crimson Onslaught', {
        fontFamily: 'Georgia, serif',
        fontSize: '72px',
        color: '#dc143c',
      })
      .setOrigin(0.5);

    const entries: readonly (readonly [label: string, scene: string])[] = [
      ['Start Game', SCENE.spellSelect],
      ['Settings', SCENE.settings],
      ['Profile', SCENE.profile],
    ];
    const items = entries.map(([label, scene], i) => {
      const go = (): void => this.go(scene);
      const button = addTextButton(this, width / 2, MENU_TOP + i * MENU_GAP, label, go, {
        fixedWidth: BUTTON_WIDTH,
        align: 'center',
      });
      return textButtonItem(button, go);
    });
    attachMenuInput(this, items, { keyboard: true, enterDefault: 0 });

    this.add
      .text(width / 2, height - 40, 'click, arrow keys and Enter, or a gamepad', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#888888',
      })
      .setOrigin(0.5);

    // Said once: Boot leaves the flag up until this screen has shown it.
    if (this.registry.get(SAVE_RESET_REGISTRY_KEY) === true) {
      this.registry.set(SAVE_RESET_REGISTRY_KEY, false);
      this.add
        .text(width / 2, height - 72, 'Saved progress could not be read and was reset.', {
          fontFamily: 'Georgia, serif',
          fontSize: '16px',
          color: '#ff6666',
        })
        .setOrigin(0.5);
    }
  }

  /** Idempotent: a click and a key press in the same frame leave exactly once. */
  private go(scene: string): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(scene);
  }
}
