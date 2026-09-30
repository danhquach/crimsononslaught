import Phaser from 'phaser';
import { validatePlayerName } from '../core/playerName';
import { profileRows } from '../core/resultModel';
import { SAVE_REGISTRY_KEY, SCENE } from '../core/scenePayloads';
import { emptySave, isSave, serializeSave, type Save } from '../core/save';
import { audioOf } from '../render/audio';
import { storeSaveJson } from '../storage/localSave';
import { attachMenuInput, attachPadButtons } from './input';
import {
  addHintLine,
  addMenuRow,
  addMenuTitle,
  drawMenuBackdrop,
  drawPanel,
  type MenuRow,
} from './menuUi';

const COLUMN_GAP = 40;
const ROW_HEIGHT = 34;
const NAME_Y = 96;
const MESSAGE_Y = 130;
/** The stats' panel, under the name; its rows start below its label. */
const PANEL_X = 190;
const PANEL_Y = 152;
const PANEL_WIDTH = 580;
const ROWS_TOP = PANEL_Y + 44;
const NOTE_Y = 396;
const BACK_Y = 452;
/** The name (or its field) and the Rename row sit side by side, this far apart. */
const NAME_GAP = 16;
const FIELD_WIDTH = 340;
const RENAME_WIDTH = 150;

/**
 * Profile panel (#121), reached from Intro and back to it: the player's name
 * (CO-165) above the lifetime totals the save has aggregated from every
 * finished run (CO-101), in the result screen's two-column layout. Before the
 * first run it says so instead.
 *
 * Rename swaps the name for a real `<input>` over the canvas. The field keeps
 * every keystroke to itself: a run leaves Phaser capturing Space and W/A/S/D
 * on `window` for the rest of the page, M mutes from `document`, and Esc here
 * would otherwise leave the screen. Enter saves, Esc cancels and stays.
 */
export class ProfileScene extends Phaser.Scene {
  private leaving = false;
  private editing = false;
  private nameText!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private renameRow!: MenuRow;
  private field!: Phaser.GameObjects.DOMElement;

  constructor() {
    super(SCENE.profile);
  }

  private get save(): Save {
    const stored: unknown = this.registry.get(SAVE_REGISTRY_KEY);
    return isSave(stored) ? stored : emptySave();
  }

  create(): void {
    // The menu track carries across every menu screen (CO-157); asking again is a no-op.
    audioOf(this).playMusic('music.menu');
    this.leaving = false;
    this.editing = false;
    const { width } = this.scale;
    const save = this.save;

    drawMenuBackdrop(this, 'quiet');
    addMenuTitle(this, width / 2, 44, 'Profile');

    // The name (or its field) and the Rename row are one group, centred as a whole.
    const groupLeft = (width - (FIELD_WIDTH + NAME_GAP + RENAME_WIDTH)) / 2;
    this.nameText = this.add
      .text(groupLeft + FIELD_WIDTH / 2, NAME_Y, save.profile.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '26px',
        color: '#eeeeee',
      })
      .setOrigin(0.5);
    this.fitName();
    this.renameRow = addMenuRow(this, {
      kind: 'bar',
      label: 'Rename',
      x: groupLeft + FIELD_WIDTH + NAME_GAP + RENAME_WIDTH / 2,
      y: NAME_Y,
      width: RENAME_WIDTH,
      onConfirm: () => this.onRename(),
    });
    this.field = this.createField(groupLeft + FIELD_WIDTH / 2);
    this.message = this.add
      .text(width / 2, MESSAGE_Y, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#ff6666',
      })
      .setOrigin(0.5);

    const rows = profileRows(save.profile);
    drawPanel(
      this,
      PANEL_X,
      PANEL_Y,
      PANEL_WIDTH,
      44 + Math.max(rows.length, 1) * ROW_HEIGHT + 8,
      'Lifetime',
    );
    if (rows.length === 0) {
      this.add
        .text(width / 2, ROWS_TOP + ROW_HEIGHT / 2, 'No runs recorded yet.', {
          fontFamily: 'Georgia, serif',
          fontSize: '22px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
    }
    rows.forEach(([label, value], i) => {
      const y = ROWS_TOP + i * ROW_HEIGHT;
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

    this.add
      .text(width / 2, NOTE_Y, 'Progress is saved in this browser only.', {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#a89f94',
      })
      .setOrigin(0.5);

    const back = addMenuRow(this, {
      kind: 'bar',
      label: 'Back  (Esc)',
      x: width / 2,
      y: BACK_Y,
      width: 220,
      onConfirm: () => this.onBack(),
    });
    // Enter with nothing highlighted still means Back, as before Rename existed.
    attachMenuInput(this, [this.renameRow, back], { keyboard: true, enterDefault: 1 });
    addHintLine(this);

    // Only reached while the field does not have focus: its own keys stop there.
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.onBack();
    });
    attachPadButtons(this, { B: () => this.onBack() });
  }

  /** The widest valid name (16 W) is wider than its slot, so it shrinks to fit rather than run into Rename. */
  private fitName(): void {
    this.nameText.setScale(Math.min(1, FIELD_WIDTH / this.nameText.width));
  }

  private createField(x: number): Phaser.GameObjects.DOMElement {
    const field = this.add.dom(
      x,
      NAME_Y,
      'input',
      `width: ${FIELD_WIDTH}px; box-sizing: border-box; padding: 4px 8px;` +
        ' font: 22px Georgia, serif; color: #eeeeee; background: #222222;' +
        ' border: 1px solid #888888; outline: none;',
    );
    const input = field.node as HTMLInputElement;
    input.type = 'text';
    input.setAttribute('aria-label', 'Player name');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.enterKeyHint = 'done';
    // No `maxLength`: the length rule is the validator's, so its message can show.
    const keep = (event: KeyboardEvent): void => event.stopPropagation();
    input.addEventListener('keyup', keep);
    input.addEventListener('keydown', (event) => {
      keep(event);
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.cancel();
      }
    });
    // Focus leaving the field (another window, a click outside the canvas) is a cancel.
    // A click on the canvas keeps it: Phaser prevents the mousedown default there.
    input.addEventListener('blur', () => this.cancel());
    return field.setVisible(false);
  }

  private get fieldInput(): HTMLInputElement {
    return this.field.node as HTMLInputElement;
  }

  /** The Rename button: opens the field, or saves it while it is open (a pad's A). */
  private onRename(): void {
    if (this.leaving) return;
    if (this.editing) {
      this.commit();
      return;
    }
    this.editing = true;
    audioOf(this).play('ui.confirm');
    this.message.setText('');
    this.nameText.setVisible(false);
    this.renameRow.setLabel('Save');
    this.field.setVisible(true);
    const input = this.fieldInput;
    input.value = this.save.profile.name;
    // The renderer only shows the node on the next frame; focus needs it now.
    input.style.display = 'block';
    input.focus();
    input.select();
  }

  private commit(): void {
    if (!this.editing) return;
    const result = validatePlayerName(this.fieldInput.value);
    if (!result.ok) {
      audioOf(this).play('ui.back');
      this.message.setText(result.reason);
      this.fieldInput.focus();
      return;
    }
    const save = this.save;
    const updated: Save = { ...save, profile: { ...save.profile, name: result.name } };
    this.registry.set(SAVE_REGISTRY_KEY, updated);
    const stored = storeSaveJson(serializeSave(updated));
    if (!stored) console.warn('[save] could not store the player name');
    audioOf(this).play('ui.confirm');
    this.nameText.setText(result.name);
    this.fitName();
    this.closeField();
    this.message.setText(stored ? '' : 'Could not save the name.');
  }

  private cancel(): void {
    if (!this.editing) return;
    audioOf(this).play('ui.back');
    this.closeField();
    this.message.setText('');
  }

  private closeField(): void {
    // Cleared first: the blur below fires the field's blur listener, which cancels.
    this.editing = false;
    this.fieldInput.blur();
    this.field.setVisible(false);
    this.nameText.setVisible(true);
    this.renameRow.setLabel('Rename');
  }

  /** Back and Esc: close an open field without leaving, or leave. */
  private onBack(): void {
    if (this.editing) {
      this.cancel();
      return;
    }
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.intro);
  }
}
