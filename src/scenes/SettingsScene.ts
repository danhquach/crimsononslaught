import Phaser from 'phaser';
import { type FeedbackSettings } from '../config/hitFeedback';
import { stepVolume } from '../core/audioMix';
import { readFeedbackSettings, writeFeedbackSettings } from '../core/hitFeedback';
import { SAVE_REGISTRY_KEY, SCENE } from '../core/scenePayloads';
import { emptySave, isSave, serializeSave, type Save } from '../core/save';
import { audioOf } from '../render/audio';
import { storeSaveJson } from '../storage/localSave';
import { attachMenuInput, type MenuItem } from './input';
import { addTextButton, textButtonItem } from './ui';

const ROW_TOP = 140;
const ROW_HEIGHT = 58;
const TOGGLE_WIDTH = 120;
const SMALL_BUTTON = { fontSize: '22px', padding: { x: 12, y: 6 } } as const;

type FeedbackToggle = 'numbers' | 'hitStop' | 'shake';

/**
 * Settings panel (#121), reached from Intro and back to it. Master volume and
 * mute go through the game's `Audio`, which Boot already persists on every
 * change; the hit-feedback switches (#125) are written into the save here,
 * registry and storage at once. So every change holds for the rest of the
 * session and the next one, and a run started after it plays with it.
 *
 * Hit-stop and shake are stored as strengths in [0, 1]; the panel switches
 * them fully on or off, and shows any strength above 0 as on.
 */
export class SettingsScene extends Phaser.Scene {
  private leaving = false;
  private readonly labels: (() => void)[] = [];

  constructor() {
    super(SCENE.settings);
  }

  private get save(): Save {
    const stored: unknown = this.registry.get(SAVE_REGISTRY_KEY);
    return isSave(stored) ? stored : emptySave();
  }

  create(): void {
    this.leaving = false;
    this.labels.length = 0;
    const { width, height } = this.scale;
    const audio = audioOf(this);

    this.add
      .text(width / 2, 60, 'Settings', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        color: '#dc143c',
      })
      .setOrigin(0.5);

    const items: MenuItem[] = [];
    const controlX = width / 2 + 120;

    // Master volume: − value +.
    const volumeY = ROW_TOP;
    this.addLabel(width / 2, volumeY, 'Master volume');
    const nudge = (direction: 1 | -1): void => {
      audio.setSettings({ master: stepVolume(audio.settings.master, direction) });
      audio.play('ui.move');
      this.refresh();
    };
    const down = addTextButton(this, controlX - 70, volumeY, '−', () => nudge(-1), SMALL_BUTTON);
    const volume = this.add
      .text(controlX, volumeY, '', { fontFamily: 'monospace', fontSize: '22px', color: '#eeeeee' })
      .setOrigin(0.5);
    const up = addTextButton(this, controlX + 70, volumeY, '+', () => nudge(1), SMALL_BUTTON);
    this.labels.push(() => volume.setText(`${Math.round(audio.settings.master * 100)}%`));
    items.push(
      textButtonItem(down, () => nudge(-1)),
      textButtonItem(up, () => nudge(1)),
    );

    // Mute: the same switch as `M`, so the label follows a key press too.
    items.push(
      this.addToggle(
        width / 2,
        ROW_TOP + ROW_HEIGHT,
        'Sound',
        () => !audio.settings.muted,
        () => audio.toggleMute(),
      ),
    );

    const feedbackRows: readonly (readonly [FeedbackToggle, string])[] = [
      ['numbers', 'Damage numbers'],
      ['hitStop', 'Hit-stop'],
      ['shake', 'Screen shake'],
    ];
    feedbackRows.forEach(([key, label], i) => {
      items.push(
        this.addToggle(
          width / 2,
          ROW_TOP + (i + 2) * ROW_HEIGHT,
          label,
          () => isOn(readFeedbackSettings(this.save.settings), key),
          () => this.toggleFeedback(key),
        ),
      );
    });

    const back = addTextButton(this, width / 2, height - 60, 'Back  (Esc)', () => this.back(), {
      fontSize: '22px',
      padding: { x: 14, y: 6 },
    });
    items.push(textButtonItem(back, () => this.back()));
    attachMenuInput(this, items, { keyboard: true });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.back();
    });
    this.refresh();
  }

  /** Redrawn every frame as well, so a mute from `M` shows at once; unchanged text is a no-op. */
  update(): void {
    this.refresh();
  }

  private refresh(): void {
    for (const label of this.labels) label();
  }

  private addLabel(x: number, y: number, text: string): void {
    this.add
      .text(x, y, text, { fontFamily: 'Georgia, serif', fontSize: '24px', color: '#dddddd' })
      .setOrigin(1, 0.5);
  }

  private addToggle(
    x: number,
    y: number,
    label: string,
    read: () => boolean,
    flip: () => void,
  ): MenuItem {
    this.addLabel(x, y, label);
    const toggle = (): void => {
      flip();
      audioOf(this).play('ui.confirm');
      this.refresh();
    };
    const button = addTextButton(this, x + 120, y, '', toggle, {
      ...SMALL_BUTTON,
      fixedWidth: TOGGLE_WIDTH,
      align: 'center',
    });
    this.labels.push(() => {
      const on = read();
      button.setText(on ? 'On' : 'Off').setColor(on ? '#ffffff' : '#888888');
    });
    return textButtonItem(button, toggle);
  }

  private toggleFeedback(key: FeedbackToggle): void {
    const save = this.save;
    const current = readFeedbackSettings(save.settings);
    const on = isOn(current, key);
    const next: FeedbackSettings =
      key === 'numbers' ? { ...current, numbers: !on } : { ...current, [key]: on ? 0 : 1 };
    const updated: Save = { ...save, settings: writeFeedbackSettings(save.settings, next) };
    this.registry.set(SAVE_REGISTRY_KEY, updated);
    if (!storeSaveJson(serializeSave(updated))) console.warn('[save] could not store settings');
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.intro);
  }
}

function isOn(feedback: Readonly<FeedbackSettings>, key: FeedbackToggle): boolean {
  return key === 'numbers' ? feedback.numbers : feedback[key] > 0;
}
