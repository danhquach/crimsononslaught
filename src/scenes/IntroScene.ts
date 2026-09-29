import Phaser from 'phaser';
import { saveNotice } from '../core/save';
import { SAVE_RESET_REGISTRY_KEY, SCENE } from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import { saveStoreFailed } from '../storage/localSave';
import { attachMenuInput } from './input';
import { addTextButton, textButtonItem } from './ui';

// Four entries (#226) end above the save-reset notice at `height - 72`.
const MENU_TOP = 240;
const MENU_GAP = 58;
const BUTTON_WIDTH = 280;

/**
 * The front door (#121): the title and a four-entry menu. Start Game goes to
 * SpellSelect, which starts the run exactly as it did when it was the first
 * screen — the seed is Boot's, read from the registry there. Settings,
 * Profile and Help (#226) are panels that come back here.
 *
 * Click, arrow keys and Enter, or a gamepad all drive the menu; Enter with
 * nothing highlighted starts a game. A save Boot had to reset is announced
 * here, once; a browser that will not keep the save (#316) is announced every
 * time this screen opens.
 */
export class IntroScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super(SCENE.intro);
  }

  create(): void {
    // The menu track carries across every menu screen (CO-157); asking again is a no-op.
    audioOf(this).playMusic('music.menu');
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
      ['Help', SCENE.help],
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

    // The reset is said once: Boot leaves the flag up until this screen has
    // shown it. A failed write is said every time, while it holds.
    const reset = this.registry.get(SAVE_RESET_REGISTRY_KEY) === true;
    if (reset) this.registry.set(SAVE_RESET_REGISTRY_KEY, false);
    const notice = saveNotice(reset, saveStoreFailed());
    if (notice !== null) {
      this.add
        .text(width / 2, height - 72, notice, {
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
