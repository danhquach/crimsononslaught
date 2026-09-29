import Phaser from 'phaser';
import { type FeedbackSettings } from '../config/hitFeedback';
import { stepVolume } from '../core/audioMix';
import { readFeedbackSettings, writeFeedbackSettings } from '../core/hitFeedback';
import {
  SAVE_REGISTRY_KEY,
  SCENE,
  isSettingsPayload,
  type PausePayload,
} from '../core/scenePayloads';
import { emptySave, isSave, serializeSave, type Save } from '../core/save';
import { audioOf } from '../render/audio';
import { storeSaveJson } from '../storage/localSave';
import { attachMenuInput, watchStartButton, type MenuItem } from './input';
import {
  addHintLine,
  addMenuRow,
  addMenuTitle,
  drawMenuBackdrop,
  drawPanel,
  type MenuRow,
} from './menuUi';

/** The two framed groups (CO-191): where each sits and how its rows are laid out. */
const PANEL_X = 200;
const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 172;
const VOLUME_PANEL_Y = 76;
const FEEDBACK_PANEL_Y = 264;
const PANEL_ROW_TOP = 50;
const PANEL_ROW_PITCH = 46;
const PANEL_PADDING = 24;
/** The −, value and + of a volume row are centred here, right of its label. */
const VOLUME_CONTROL_X = PANEL_X + PANEL_WIDTH - 120;
const STEP_WIDTH = 44;
/** A list row's label starts this far in from its left edge, after the ▶ marker. */
const LIST_INDENT = 32;
const BACK_Y = 470;

type FeedbackToggle = 'numbers' | 'hitStop' | 'shake';
type VolumeChannel = 'master' | 'music';

/**
 * Settings panel (#121), reached from Intro and back to it, or (CO-192) from
 * the pause menu and back to that: the pause view travels in the payload and
 * Back restarts Pause with it, so the run stays frozen and its build reads as
 * before. Over a run the panel brings itself to the top, hides the HUD and
 * leaves the run's music playing. Esc or pad Start also go back. The master and
 * music volumes and mute go through the game's `Audio`, which Boot already
 * persists on every change; the hit-feedback switches (#125) are written into
 * the save here, registry and storage at once. So every change holds for the rest of the
 * session and the next one, and a run started after it plays with it.
 *
 * Hit-stop and shake are stored as strengths in [0, 1]; the panel switches
 * them fully on or off, and shows any strength above 0 as on.
 */
export class SettingsScene extends Phaser.Scene {
  private leaving = false;
  /** The pause view to go back to; `null` when opened from the main menu. */
  private returnTo: PausePayload | null = null;
  private readonly labels: (() => void)[] = [];

  constructor() {
    super(SCENE.settings);
  }

  private get save(): Save {
    const stored: unknown = this.registry.get(SAVE_REGISTRY_KEY);
    return isSave(stored) ? stored : emptySave();
  }

  init(data: unknown): void {
    this.returnTo = isSettingsPayload(data) ? data.pause : null;
    // Phaser replays the last launch payload on a payload-less start; clear it,
    // so the main menu's Settings never returns to a pause screen.
    this.scene.settings.data = {};
  }

  create(): void {
    this.leaving = false;
    this.labels.length = 0;
    const { width, height } = this.scale;

    if (this.returnTo) this.coverPausedRun(width, height);
    // The menu track carries across every menu screen (CO-157); asking again is a
    // no-op. A paused run keeps its own music playing.
    else audioOf(this).playMusic('music.menu');

    // The same backdrop, title, panels and rows from either door (CO-191), so
    // Settings looks the same from the main menu and from the pause screen.
    drawMenuBackdrop(this, 'quiet');
    addMenuTitle(this, width / 2, 44, 'Settings');
    const items = this.drawPanels();
    const back = addMenuRow(this, {
      kind: 'bar',
      label: 'Back  (Esc)',
      x: width / 2,
      y: BACK_Y,
      width: 220,
      onConfirm: () => this.back(),
    });
    attachMenuInput(this, [...items, back], { keyboard: true });
    addHintLine(this);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.repeat) this.back();
    });
    // Start goes back as well; the scene's own emitter keeps its listeners across a restart.
    const start = watchStartButton(this);
    const pollStart = (): void => {
      if (start.pressed()) this.back();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, pollStart);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, pollStart);
    });
    this.refresh();
  }

  /**
   * The Volume and Feedback panels with their rows, drawn apart from the
   * backdrop and the title. The pause screen (CO-192) opens this same scene
   * rather than drawing its own, so both doors show these panels.
   */
  private drawPanels(): MenuItem[] {
    const audio = audioOf(this);
    const items: MenuItem[] = [];
    drawPanel(this, PANEL_X, VOLUME_PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 'Volume');
    drawPanel(this, PANEL_X, FEEDBACK_PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 'Feedback');
    const rowY = (panelY: number, i: number): number =>
      panelY + PANEL_ROW_TOP + i * PANEL_ROW_PITCH;

    // Volumes: − value +. Music (CO-157) scales only the tracks, master both.
    const volumeRows: readonly (readonly [VolumeChannel, string])[] = [
      ['master', 'Master volume'],
      ['music', 'Music volume'],
    ];
    volumeRows.forEach(([channel, label], i) => {
      const y = rowY(VOLUME_PANEL_Y, i);
      this.addLabel(y, label);
      const nudge = (direction: 1 | -1): void => {
        audio.setSettings({ [channel]: stepVolume(audio.settings[channel], direction) });
        audio.play('ui.move');
        this.refresh();
      };
      const step = (x: number, label: string, direction: 1 | -1): MenuRow =>
        addMenuRow(this, {
          kind: 'bar',
          label,
          x,
          y,
          width: STEP_WIDTH,
          onConfirm: () => nudge(direction),
        });
      const down = step(VOLUME_CONTROL_X - 70, '−', -1);
      const volume = this.add
        .text(VOLUME_CONTROL_X, y, '', {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#eeeeee',
        })
        .setOrigin(0.5);
      const up = step(VOLUME_CONTROL_X + 70, '+', 1);
      this.labels.push(() => volume.setText(`${Math.round(audio.settings[channel] * 100)}%`));
      items.push(down, up);
    });

    // Mute: the same switch as `M`, so the label follows a key press too.
    items.push(
      this.addToggle(
        rowY(VOLUME_PANEL_Y, volumeRows.length),
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
          rowY(FEEDBACK_PANEL_Y, i),
          label,
          () => isOn(readFeedbackSettings(this.save.settings), key),
          () => this.toggleFeedback(key),
        ),
      );
    });
    return items;
  }

  /**
   * Over a paused run (CO-192): on top of Game and its HUD, which would show
   * through and cannot be told apart from the rows; the HUD comes back as this
   * panel closes, and Pause hides it again if that is where it goes. A solid
   * black plate that takes the pointer sits under the menu backdrop, so
   * clicks never reach the run and a menu backdrop that failed to load still
   * leaves the arena hidden.
   */
  private coverPausedRun(width: number, height: number): void {
    this.scene.bringToTop();
    this.scene.setVisible(false, SCENE.hud);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.setVisible(true, SCENE.hud));
    this.add.rectangle(0, 0, width, height, 0x000000).setOrigin(0).setInteractive();
  }

  /** Redrawn every frame as well, so a mute from `M` shows at once; unchanged text is a no-op. */
  update(): void {
    this.refresh();
  }

  private refresh(): void {
    for (const label of this.labels) label();
  }

  private addLabel(y: number, text: string): void {
    this.add
      .text(PANEL_X + PANEL_PADDING + LIST_INDENT, y, text, {
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        color: '#dddddd',
      })
      .setOrigin(0, 0.5);
  }

  /** A switch is one row across the panel reading "Label: On", so it is a single click target. */
  private addToggle(y: number, label: string, read: () => boolean, flip: () => void): MenuRow {
    const toggle = (): void => {
      flip();
      audioOf(this).play('ui.confirm');
      this.refresh();
    };
    const row = addMenuRow(this, {
      kind: 'bar',
      label: `${label}: On`,
      x: PANEL_X + PANEL_WIDTH / 2,
      y,
      width: PANEL_WIDTH - PANEL_PADDING * 2,
      onConfirm: toggle,
      align: 'left',
    });
    this.labels.push(() => {
      const on = read();
      row.setLabel(`${label}: ${on ? 'On' : 'Off'}`);
      row.setDim(!on);
    });
    return row;
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
    if (this.returnTo) this.scene.start(SCENE.pause, this.returnTo);
    else this.scene.start(SCENE.intro);
  }
}

function isOn(feedback: Readonly<FeedbackSettings>, key: FeedbackToggle): boolean {
  return key === 'numbers' ? feedback.numbers : feedback[key] > 0;
}
