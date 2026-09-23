import Phaser from 'phaser';
import { profileRows } from '../core/resultModel';
import { SAVE_REGISTRY_KEY, SCENE } from '../core/scenePayloads';
import { emptySave, isSave } from '../core/save';
import { audioOf } from '../render/audio';
import { attachMenuInput } from './input';
import { addTextButton, textButtonItem } from './ui';

const COLUMN_GAP = 40;
const ROW_HEIGHT = 40;

/**
 * Profile panel (#121), reached from Intro and back to it: the lifetime totals
 * the save has aggregated from every finished run (CO-101), in the result
 * screen's two-column layout. Before the first run it says so instead.
 */
export class ProfileScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super(SCENE.profile);
  }

  create(): void {
    this.leaving = false;
    const { width, height } = this.scale;
    const stored: unknown = this.registry.get(SAVE_REGISTRY_KEY);
    const save = isSave(stored) ? stored : emptySave();

    this.add
      .text(width / 2, 60, 'Profile', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        color: '#dc143c',
      })
      .setOrigin(0.5);

    const rows = profileRows(save.profile);
    if (rows.length === 0) {
      this.add
        .text(width / 2, height / 2 - 40, 'No runs recorded yet.', {
          fontFamily: 'Georgia, serif',
          fontSize: '24px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
    }
    rows.forEach(([label, value], i) => {
      const y = 150 + i * ROW_HEIGHT;
      this.add
        .text(width / 2 - COLUMN_GAP / 2, y, label, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#aaaaaa',
        })
        .setOrigin(1, 0);
      this.add.text(width / 2 + COLUMN_GAP / 2, y, value, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#eeeeee',
      });
    });

    const back = addTextButton(this, width / 2, height - 60, 'Back  (Esc)', () => this.back(), {
      fontSize: '22px',
      padding: { x: 14, y: 6 },
    });
    attachMenuInput(this, [textButtonItem(back, () => this.back())], {
      keyboard: true,
      enterDefault: 0,
    });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.back();
    });
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.intro);
  }
}
