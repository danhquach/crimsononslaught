import Phaser from 'phaser';
import { RESULT_HEADLINES, isConfirmKey, resultRows } from '../core/resultModel';
import { SCENE, isResultPayload, type ResultPayload } from '../core/scenePayloads';
import { attachMenuInput } from './input';
import { addTextButton, textButtonItem } from './ui';

const ROW_HEIGHT = 34;
const ROW_GAP = 8;
const COLUMN_GAP = 24;
const VALUE_WIDTH = 360;
const BUTTON_MARGIN = 40;

/**
 * Result screen: Victory / Defeat headline and the run's stats (time survived,
 * level, kills, spell, perks taken) from `ResultPayload`. "Play again" returns
 * to SpellSelect on click or Enter; both paths are idempotent within a frame.
 * A gamepad confirms with A. Started without a valid payload it falls back to
 * SpellSelect (spec §7).
 */
export class ResultScene extends Phaser.Scene {
  private payload: ResultPayload | null = null;
  private restarted = false;

  constructor() {
    super(SCENE.result);
  }

  init(data: unknown): void {
    this.payload = isResultPayload(data) ? data : null;
    // Phaser keeps the last `start(key, data)` payload in settings.data and
    // replays it when the scene is later started with no data. Clear it so
    // a payload-less start is seen as missing every time, not just the first.
    this.scene.settings.data = {};
  }

  create(): void {
    this.restarted = false;
    if (!this.payload) {
      console.warn('[Result] started without a valid payload; returning to SpellSelect');
      this.scene.start(SCENE.spellSelect);
      return;
    }
    const { outcome, stats } = this.payload;
    const { width, height } = this.scale;
    const headline = RESULT_HEADLINES[outcome];

    this.add
      .text(width / 2, height * 0.2, headline.text, {
        fontFamily: 'Georgia, serif',
        fontSize: '64px',
        color: headline.color,
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.2 + 54, headline.subtitle, {
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    // Two columns around the centre: labels right-aligned, values left-aligned.
    // Rows stack from a fixed top; the button sits below the last row so a
    // wrapped perk list (many picks) pushes it down instead of overlapping it.
    const rows = resultRows(stats);
    let y = height * 0.42;
    rows.forEach(([label, value]) => {
      this.add
        .text(width / 2 - COLUMN_GAP / 2, y, label, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#aaaaaa',
        })
        .setOrigin(1, 0);
      const valueText = this.add.text(width / 2 + COLUMN_GAP / 2, y, value, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#eeeeee',
        wordWrap: { width: VALUE_WIDTH },
      });
      y += Math.max(ROW_HEIGHT, valueText.height + ROW_GAP);
    });

    const buttonY = Math.max(height * 0.82, y + BUTTON_MARGIN);
    const button = addTextButton(this, width / 2, buttonY, 'Play again', () => this.playAgain());
    attachMenuInput(this, [textButtonItem(button, () => this.playAgain())]);
    this.add
      .text(width / 2, buttonY + 40, 'click, press Enter, or gamepad A', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#888888',
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isConfirmKey(event.key)) this.playAgain();
    });
  }

  /** Idempotent: a click and Enter in the same frame start exactly one SpellSelect. */
  private playAgain(): void {
    if (this.restarted) return;
    this.restarted = true;
    this.scene.start(SCENE.spellSelect);
  }
}
