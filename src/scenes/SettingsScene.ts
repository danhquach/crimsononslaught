import Phaser from 'phaser';
import { type FeedbackSettings } from '../config/hitFeedback';
import { type MinimapSettings } from '../config/minimap';
import {
  ACTION_LABEL,
  CONTROL_ACTIONS,
  PAD_LABELS,
  type ControlAction,
  type ControlDevice,
} from '../config/controls';
import { stepVolume } from '../core/audioMix';
import {
  bindingLabel,
  defaultControls,
  isKeyCode,
  menuSafe,
  rebind,
  resetAll,
  resetDevice,
} from '../core/controls';
import { readFeedbackSettings, writeFeedbackSettings } from '../core/hitFeedback';
import { readMinimapSettings, writeMinimapSettings } from '../core/minimap';
import {
  SAVE_REGISTRY_KEY,
  SCENE,
  controlsConfirm,
  controlsDevice,
  controlsNotice,
  focusesControls,
  focusesKinds,
  isControlsPage,
  isPickupsPage,
  isSettingsPayload,
  type ControlsReset,
  type PausePayload,
  type SettingsPayload,
} from '../core/scenePayloads';
import { emptySave, isSave, serializeSave, type Save } from '../core/save';
import { audioOf } from '../render/audio';
import { storeSaveJson } from '../storage/localSave';
import { PAD_BUTTON } from '../core/input';
import { SERIF, WINE } from './buildStrips';
import { controlsOf, setCapturing, storeControls } from './controls';
import {
  attachMenuInput,
  attachPadButtons,
  watchPadButton,
  type MenuItem,
  type StartButtonWatch,
} from './input';
import { addSwitchIcon } from './minimapHud';
import {
  addHintLine,
  addMenuRow,
  addMenuTitle,
  drawMenuBackdrop,
  drawPanel,
  type MenuRow,
} from './menuUi';

/**
 * The three framed groups (CO-191, CO-207): Volume and Feedback stacked on the
 * left, Minimap beside them, each row laid out the same way.
 */
const LEFT_PANEL_X = 24;
const RIGHT_PANEL_X = 496;
const PANEL_WIDTH = 440;
const PANEL_HEIGHT = 172;
const VOLUME_PANEL_Y = 76;
const FEEDBACK_PANEL_Y = 264;
const MINIMAP_PANEL_HEIGHT = 310;
/** The pickup kinds page (#383): one centred panel of seven switches, a row every 42 px. */
const KINDS_PANEL_X = (960 - PANEL_WIDTH) / 2;
const KINDS_PANEL_HEIGHT = 330;
const KINDS_ROW_PITCH = 42;
const PANEL_ROW_TOP = 50;
const PANEL_ROW_PITCH = 46;
const PANEL_PADDING = 24;
/** The −, value and + of a volume row are centred here, right of its label. */
const VOLUME_CONTROL_X = LEFT_PANEL_X + PANEL_WIDTH - 120;
const STEP_WIDTH = 44;
/** A list row's label starts this far in from its left edge, after the ▶ marker. */
const LIST_INDENT = 32;
const BACK_Y = 470;
/** The main page's Controls row sits in the right column, under the Minimap panel. */
const CONTROLS_ROW_Y = 416;
/** A Minimap row's icon is this wide and sits after the ▶ marker; its label starts after it, with slack for taller fonts. */
const SWITCH_ICON_SIZE = 16;
const SWITCH_ICON_INDENT = SWITCH_ICON_SIZE + 8;

/** The Controls page (CO-226): tabs, one panel of two columns of six actions, the resets, a note line. */
const CONTROLS_TAB_Y = 92;
const CONTROLS_TAB_WIDTH = 160;
const CONTROLS_PANEL_Y = 116;
const CONTROLS_PANEL_HEIGHT = 256;
const CONTROLS_COLUMN_X = [255, 705] as const;
const CONTROLS_ROW_WIDTH = 410;
const CONTROLS_ROW_TOP = 150;
const CONTROLS_ROW_PITCH = 40;
const CONTROLS_RESET_Y = 392;
const CONTROLS_NOTE_Y = 436;
const CONTROLS_RESET_WIDTH = 360;
/** What the note line says while nothing has happened; Enter, Esc, A, B and the movement extras never rebind. */
const CONTROLS_HELP: Readonly<Record<ControlDevice, string>> = {
  keyboard: 'Pick an action, then press its new key. Enter, Esc and the arrow keys stay fixed.',
  pad: 'Pick an action, then press its new button. A, B, the D-pad and the stick stay fixed for menus.',
};
const RESET_NOTICE: Readonly<Record<ControlsReset, string>> = {
  keyboard: 'Keyboard controls reset to default.',
  pad: 'Controller controls reset to default.',
  all: 'All controls reset to default.',
};
const RESET_QUESTION: Readonly<Record<ControlsReset, { question: string; detail: string }>> = {
  keyboard: {
    question: 'Reset keyboard controls?',
    detail: 'Every key goes back to its default.',
  },
  pad: {
    question: 'Reset controller controls?',
    detail: 'Every button goes back to its default.',
  },
  all: {
    question: 'Reset all controls?',
    detail: 'Keyboard and controller both go back to their defaults.',
  },
};

type FeedbackToggle = 'numbers' | 'hitStop' | 'shake';
type MinimapToggle = keyof MinimapSettings;
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
  /** The pickup kinds page (#383) instead of the main one. */
  private kindsPage = false;
  /** Back from the kinds page: the main page opens with its `Pickup kinds` row highlighted. */
  private focusKinds = false;
  /** The main page's row that opens the kinds page. */
  private kindsRow: MenuRow | null = null;
  /** The Controls page (CO-226) instead of the main one, on this device's tab. */
  private controlsPage = false;
  private device: ControlDevice = 'keyboard';
  /** The reset the Controls page is asking Yes or No about. */
  private confirmReset: ControlsReset | null = null;
  /** Back from the Controls page: the main page opens with its `Controls` row highlighted. */
  private focusControls = false;
  private controlsRow: MenuRow | null = null;
  /** The bindings as the player has them now; every change goes through `rebind` and `storeControls`. */
  private controls = defaultControls();
  /** The bound pad pause as a press edge, rebuilt whenever a rebind moves it. */
  private pauseWatch: StartButtonWatch | null = null;
  /** The action waiting for a key or button, if any. */
  private waiting: ControlAction | null = null;
  /** Pad capture starts on the update after the row was confirmed, so that press is not the binding. */
  private armed = false;
  /** A key event stamped no later than this is the press that opened the capture (or older), never the binding. */
  private armedAt = 0;
  /** What the Controls page last did: what moved, why a key was refused, or a reset. */
  private note = '';
  private padWatches: StartButtonWatch[] = [];
  private readonly handledKeys = new WeakSet<KeyboardEvent>();
  private readonly labels: (() => void)[] = [];
  /** Each Minimap row's icon, for the browser suite. */
  private readonly switchIcons: {
    key: MinimapToggle;
    icon: Phaser.GameObjects.GameObject;
    bounds: { x: number; y: number; width: number; height: number };
  }[] = [];

  constructor() {
    super(SCENE.settings);
  }

  private get save(): Save {
    const stored: unknown = this.registry.get(SAVE_REGISTRY_KEY);
    return isSave(stored) ? stored : emptySave();
  }

  init(data: unknown): void {
    this.returnTo = isSettingsPayload(data) ? data.pause : null;
    this.kindsPage = isPickupsPage(data);
    this.focusKinds = focusesKinds(data);
    this.controlsPage = isControlsPage(data);
    this.device = controlsDevice(data);
    this.confirmReset = this.controlsPage ? controlsConfirm(data) : null;
    this.focusControls = focusesControls(data);
    const notice = controlsNotice(data);
    this.note = notice ? RESET_NOTICE[notice] : '';
    // Phaser replays the last launch payload on a payload-less start; clear it,
    // so the main menu's Settings never returns to a pause screen.
    this.scene.settings.data = {};
  }

  create(): void {
    this.leaving = false;
    this.labels.length = 0;
    this.switchIcons.length = 0;
    this.kindsRow = null;
    this.controlsRow = null;
    this.waiting = null;
    this.armed = false;
    this.controls = controlsOf(this);
    setCapturing(this, false);
    // A waiting rebind never outlives the scene: the flag would silence M everywhere.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => setCapturing(this, false));
    const { width, height } = this.scale;

    if (this.returnTo) this.coverPausedRun(width, height);
    // The menu track carries across every menu screen (CO-157); asking again is a
    // no-op. A paused run keeps its own music playing.
    else audioOf(this).playMusic('music.menu');

    // The same backdrop, title, panels and rows from either door (CO-191), so
    // Settings looks the same from the main menu and from the pause screen.
    drawMenuBackdrop(this, 'quiet');
    addMenuTitle(
      this,
      width / 2,
      44,
      this.kindsPage ? 'Pickups' : this.controlsPage ? 'Controls' : 'Settings',
    );
    let all: MenuItem[];
    if (this.confirmReset) all = this.drawConfirm(this.confirmReset);
    else if (this.controlsPage) all = this.drawControlsPage();
    else {
      const items = this.kindsPage ? this.drawKindsPanel() : this.drawPanels();
      all = [
        ...items,
        addMenuRow(this, {
          kind: 'bar',
          label: 'Back  (Esc)',
          x: width / 2,
          y: BACK_Y,
          width: 220,
          onConfirm: () => this.back(),
        }),
      ];
    }
    const focusRow = this.focusKinds ? this.kindsRow : this.focusControls ? this.controlsRow : null;
    const initial = focusRow ? all.indexOf(focusRow) : -1;
    attachMenuInput(this, all, {
      keyboard: true,
      initial: initial >= 0 ? initial : undefined,
      enterDefault: this.confirmReset ? 1 : undefined,
      suspended: () => this.waiting !== null,
    });
    if (this.confirmReset) addHintLine(this, 'Esc or B for No');
    else if (this.controlsPage)
      addHintLine(
        this,
        'click or arrows + Enter to pick, then press the new key or button  ·  Esc or B cancels',
      );
    else addHintLine(this);

    // One handler for every key, so a waiting rebind and the way back out never both act on an Esc.
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => this.onKey(event));
    // Pad B goes back or cancels (#377); the bound pause button does too unless the menus keep it for
    // themselves (CO-226). The scene's own emitter keeps its listeners across a restart.
    attachPadButtons(this, { B: () => this.onBack() });
    this.watchPause();
    const onUpdate = (): void => {
      // Read first, every step, so the edge never misses a poll.
      const startPressed = this.pauseWatch?.pressed() ?? false;
      if (this.waiting) this.pollCapture();
      else if (startPressed) this.back();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    });
    this.refresh();
  }

  /**
   * The Volume, Feedback and Minimap panels with their rows, drawn apart from the
   * backdrop and the title. The pause screen (CO-192) opens this same scene
   * rather than drawing its own, so both doors show these panels.
   */
  private drawPanels(): MenuItem[] {
    const audio = audioOf(this);
    const items: MenuItem[] = [];
    drawPanel(this, LEFT_PANEL_X, VOLUME_PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 'Volume');
    drawPanel(this, LEFT_PANEL_X, FEEDBACK_PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 'Feedback');
    drawPanel(this, RIGHT_PANEL_X, VOLUME_PANEL_Y, PANEL_WIDTH, MINIMAP_PANEL_HEIGHT, 'Minimap');
    const rowY = (panelY: number, i: number): number =>
      panelY + PANEL_ROW_TOP + i * PANEL_ROW_PITCH;

    // Volumes: − value +. Music (CO-157) scales only the tracks, master both.
    const volumeRows: readonly (readonly [VolumeChannel, string])[] = [
      ['master', 'Master volume'],
      ['music', 'Music volume'],
    ];
    volumeRows.forEach(([channel, label], i) => {
      const y = rowY(VOLUME_PANEL_Y, i);
      this.addLabel(LEFT_PANEL_X, y, label);
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
        LEFT_PANEL_X,
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
          LEFT_PANEL_X,
          rowY(FEEDBACK_PANEL_Y, i),
          label,
          () => isOn(readFeedbackSettings(this.save.settings), key),
          () => this.toggleFeedback(key),
        ),
      );
    });

    // The Minimap switches (CO-207): the first hides the whole map, the rest a layer each;
    // under Pickups, the row that opens the page of one switch per pickup kind (#383).
    const minimapRows: readonly (readonly [MinimapToggle | 'kinds', string])[] = [
      ['on', 'Minimap'],
      ['viewport', 'Viewport box'],
      ['boss', 'Boss'],
      ['pickups', 'Pickups'],
      ['kinds', 'Pickup kinds  ▸'],
      ['enemies', 'Enemies'],
    ];
    minimapRows.forEach(([key, label], i) => {
      const y = rowY(VOLUME_PANEL_Y, i);
      if (key === 'kinds') {
        this.kindsRow = addMenuRow(this, {
          kind: 'bar',
          label,
          x: RIGHT_PANEL_X + PANEL_WIDTH / 2,
          y,
          width: PANEL_WIDTH - PANEL_PADDING * 2,
          onConfirm: () => this.openKinds(),
          align: 'left',
          indent: SWITCH_ICON_INDENT,
        });
        items.push(this.kindsRow);
        return;
      }
      items.push(
        this.addToggle(
          RIGHT_PANEL_X,
          y,
          label,
          () => readMinimapSettings(this.save.settings)[key],
          () => this.toggleMinimap(key),
          key,
        ),
      );
    });
    // Under the Minimap panel, between it and Back: the rebindable controls (CO-226).
    this.controlsRow = addMenuRow(this, {
      kind: 'bar',
      label: 'Controls  ▸',
      x: RIGHT_PANEL_X + PANEL_WIDTH / 2,
      y: CONTROLS_ROW_Y,
      width: PANEL_WIDTH - PANEL_PADDING * 2,
      onConfirm: () => this.openControls(this.device),
    });
    items.push(this.controlsRow);
    return items;
  }

  /** The pickup kinds page: one switch per kind in a single column, all dead while Pickups is Off. */
  private drawKindsPanel(): MenuItem[] {
    drawPanel(
      this,
      KINDS_PANEL_X,
      VOLUME_PANEL_Y,
      PANEL_WIDTH,
      KINDS_PANEL_HEIGHT,
      'Minimap pickups',
    );
    const kinds: readonly (readonly [MinimapToggle, string])[] = [
      ['health', 'Health'],
      ['magnet', 'Magnet'],
      ['bomb', 'Bomb'],
      ['chest', 'Chest'],
      ['relic', 'Relic'],
      ['ember', 'Ember'],
      ['gem', 'XP gems'],
    ];
    return kinds.map(([key, label], i) =>
      this.addToggle(
        KINDS_PANEL_X,
        VOLUME_PANEL_Y + PANEL_ROW_TOP + i * KINDS_ROW_PITCH,
        label,
        () => readMinimapSettings(this.save.settings)[key],
        () => this.toggleMinimap(key),
        key,
        true,
      ),
    );
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

  private addLabel(panelX: number, y: number, text: string): void {
    this.add
      .text(panelX + PANEL_PADDING + LIST_INDENT, y, text, {
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        color: '#dddddd',
      })
      .setOrigin(0, 0.5);
  }

  /** A switch is one row across the panel reading "Label: On", so it is a single click target. */
  private addToggle(
    panelX: number,
    y: number,
    label: string,
    read: () => boolean,
    flip: () => void,
    iconFor?: MinimapToggle,
    needsPickups = false,
  ): MenuRow {
    const pickupsOn = (): boolean => readMinimapSettings(this.save.settings).pickups;
    const toggle = (): void => {
      if (needsPickups && !pickupsOn()) return;
      flip();
      audioOf(this).play('ui.confirm');
      this.refresh();
    };
    const row = addMenuRow(this, {
      kind: 'bar',
      label: `${label}: On`,
      x: panelX + PANEL_WIDTH / 2,
      y,
      width: PANEL_WIDTH - PANEL_PADDING * 2,
      onConfirm: toggle,
      align: 'left',
      indent: iconFor ? SWITCH_ICON_INDENT : 0,
    });
    const iconX = panelX + PANEL_PADDING + LIST_INDENT + SWITCH_ICON_SIZE / 2;
    const icon = iconFor ? addSwitchIcon(this, iconFor, iconX, y, SWITCH_ICON_SIZE) : null;
    if (iconFor && icon) {
      const half = SWITCH_ICON_SIZE / 2;
      const bounds = {
        x: iconX - half,
        y: y - half,
        width: SWITCH_ICON_SIZE,
        height: SWITCH_ICON_SIZE,
      };
      this.switchIcons.push({ key: iconFor, icon, bounds });
    }
    this.labels.push(() => {
      const on = read();
      row.setLabel(`${label}: ${on ? 'On' : 'Off'}`);
      const enabled = !needsPickups || pickupsOn();
      row.setEnabled(enabled);
      row.setDim(!on);
      icon?.setAlpha(on && enabled ? 1 : 0.45);
    });
    return row;
  }

  /** Where each Minimap row's icon is, and whether it is atlas art, for the browser suite. */
  get switchIconReports(): {
    key: MinimapToggle;
    art: boolean;
    bounds: { x: number; y: number; width: number; height: number };
  }[] {
    return this.switchIcons.map(({ key, icon, bounds }) => ({
      key,
      art: icon.type === 'Image',
      bounds,
    }));
  }

  private toggleFeedback(key: FeedbackToggle): void {
    const save = this.save;
    const current = readFeedbackSettings(save.settings);
    const on = isOn(current, key);
    const next: FeedbackSettings =
      key === 'numbers' ? { ...current, numbers: !on } : { ...current, [key]: on ? 0 : 1 };
    this.storeSettings(writeFeedbackSettings(save.settings, next));
  }

  private toggleMinimap(key: MinimapToggle): void {
    const settings = this.save.settings;
    const current = readMinimapSettings(settings);
    this.storeSettings(writeMinimapSettings(settings, { ...current, [key]: !current[key] }));
  }

  /** The registry's save and storage both take `settings`, so the change holds now and next launch. */
  private storeSettings(settings: Save['settings']): void {
    const updated: Save = { ...this.save, settings };
    this.registry.set(SAVE_REGISTRY_KEY, updated);
    if (!storeSaveJson(serializeSave(updated))) console.warn('[save] could not store settings');
  }

  /** The same scene again on the kinds page, carrying the pause view so Back still ends at Pause. */
  private openKinds(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.settings, {
      ...(this.returnTo ? { pause: this.returnTo } : {}),
      page: 'pickups',
    } satisfies SettingsPayload);
  }

  /** The same scene again on the Controls page (CO-226), carrying the pause view so Back still ends at Pause. */
  private openControls(device: ControlDevice, extra: SettingsPayload = {}): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.settings, {
      ...(this.returnTo ? { pause: this.returnTo } : {}),
      page: 'controls',
      device,
      ...extra,
    } satisfies SettingsPayload);
  }

  /** A click or press on a row other than an action, while a rebind waits, only cancels it. */
  private unlessWaiting(act: () => void): () => void {
    return () => {
      if (this.waiting) this.cancelCapture();
      else act();
    };
  }

  /**
   * The Controls page (CO-226): the Keyboard and Controller tabs, a panel with a
   * row per action reading `Move up: W`, the device's reset, Reset all and Back.
   * Picking an action waits for the next key or button; a controller alone
   * reaches every row through the menu input.
   */
  private drawControlsPage(): MenuItem[] {
    const { width } = this.scale;
    const tabs: readonly (readonly [string, ControlDevice])[] = [
      ['Keyboard', 'keyboard'],
      ['Controller', 'pad'],
    ];
    const tabRows = tabs.map(([label, device], i) => {
      const tab = addMenuRow(this, {
        kind: 'bar',
        label,
        x: width / 2 + (i - (tabs.length - 1) / 2) * (CONTROLS_TAB_WIDTH + 16),
        y: CONTROLS_TAB_Y,
        width: CONTROLS_TAB_WIDTH,
        onConfirm: this.unlessWaiting(() => {
          if (device !== this.device) this.openControls(device);
        }),
      });
      tab.setActive(device === this.device);
      return tab;
    });

    drawPanel(this, 30, CONTROLS_PANEL_Y, 900, CONTROLS_PANEL_HEIGHT);
    const perColumn = CONTROL_ACTIONS.length / 2;
    const actionRows = CONTROL_ACTIONS.map((action, i) => {
      const row = addMenuRow(this, {
        kind: 'bar',
        label: this.rowLabel(action),
        x: CONTROLS_COLUMN_X[Math.floor(i / perColumn)] ?? 0,
        y: CONTROLS_ROW_TOP + (i % perColumn) * CONTROLS_ROW_PITCH,
        width: CONTROLS_ROW_WIDTH,
        align: 'left',
        onConfirm: () => this.pick(action),
      });
      this.labels.push(() => {
        row.setLabel(this.rowLabel(action));
        row.setActive(this.waiting === action);
      });
      return row;
    });

    const resetDeviceRow = addMenuRow(this, {
      kind: 'bar',
      label: `Reset ${this.device === 'pad' ? 'controller' : 'keyboard'} to default`,
      x: width / 2,
      y: CONTROLS_RESET_Y,
      width: CONTROLS_RESET_WIDTH,
      onConfirm: this.unlessWaiting(() => this.openControls(this.device, { confirm: this.device })),
    });
    const note = this.add
      .text(width / 2, CONTROLS_NOTE_Y, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#a89f94',
      })
      .setOrigin(0.5);
    let shownColor = '';
    this.labels.push(() => {
      note.setText(this.note || CONTROLS_HELP[this.device]);
      const color = this.note ? '#f0c674' : '#a89f94';
      if (color === shownColor) return;
      shownColor = color;
      note.setColor(color);
    });
    const resetAllRow = addMenuRow(this, {
      kind: 'bar',
      label: 'Reset all',
      x: 360,
      y: BACK_Y,
      width: 220,
      onConfirm: this.unlessWaiting(() => this.openControls(this.device, { confirm: 'all' })),
    });
    const back = addMenuRow(this, {
      kind: 'bar',
      label: 'Back  (Esc)',
      x: 600,
      y: BACK_Y,
      width: 220,
      onConfirm: this.unlessWaiting(() => this.back()),
    });
    return [...tabRows, ...actionRows, resetDeviceRow, resetAllRow, back];
  }

  /** The Yes / No box before a reset (the pause screen's pattern); No is the default and Esc or B mean No. */
  private drawConfirm(reset: ControlsReset): MenuItem[] {
    const { width } = this.scale;
    const { question, detail } = RESET_QUESTION[reset];
    this.add.rectangle(width / 2, 280, 568, 208).setStrokeStyle(1, 0x2a0a10);
    this.add.rectangle(width / 2, 280, 560, 200, 0x17110f).setStrokeStyle(2, WINE);
    this.add
      .text(width / 2, 220, question, { fontFamily: SERIF, fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 262, detail, { fontFamily: SERIF, fontSize: '17px', color: '#cccccc' })
      .setOrigin(0.5);
    return [
      addMenuRow(this, {
        kind: 'bar',
        label: 'Yes',
        x: width / 2 - 80,
        y: 330,
        width: 140,
        onConfirm: () => {
          if (this.confirmReset) this.applyReset(this.confirmReset);
        },
      }),
      addMenuRow(this, {
        kind: 'bar',
        label: 'No',
        x: width / 2 + 80,
        y: 330,
        width: 140,
        onConfirm: () => this.back(),
      }),
    ];
  }

  private applyReset(reset: ControlsReset): void {
    if (this.leaving) return;
    this.controls = reset === 'all' ? resetAll() : resetDevice(this.controls, reset);
    storeControls(this, this.controls);
    this.openControls(this.device, { notice: reset });
  }

  private rowLabel(action: ControlAction): string {
    const value =
      this.waiting === action
        ? this.device === 'pad'
          ? 'press a button…'
          : 'press a key…'
        : bindingLabel(this.controls, this.device, action);
    return `${ACTION_LABEL[action]}: ${value}`;
  }

  /** An action row was confirmed: wait for its new key or button; on the row already waiting, give up. */
  private pick(action: ControlAction): void {
    if (this.leaving) return;
    const again = this.waiting === action;
    if (this.waiting) this.cancelCapture();
    if (again) return;
    this.waiting = action;
    this.armed = false;
    this.armedAt = performance.now();
    this.note = '';
    // Reset, so a button still down from the press that picked the row is no binding.
    this.padWatches = PAD_LABELS.map((_, index) => {
      const watch = watchPadButton(this, index);
      watch.reset();
      return watch;
    });
    setCapturing(this, true);
    audioOf(this).play('ui.confirm');
    this.refresh();
  }

  private endCapture(): void {
    this.waiting = null;
    setCapturing(this, false);
    this.refresh();
  }

  private cancelCapture(): void {
    audioOf(this).play('ui.back');
    this.endCapture();
  }

  /** Keys: one handler, each event once. While a rebind waits it is the only thing a key can do. */
  private onKey(event: KeyboardEvent): void {
    if (this.handledKeys.has(event)) return;
    this.handledKeys.add(event);
    if (event.repeat) return;
    if (this.waiting) {
      // The press that confirmed the row, or older, is not the new key.
      if (event.timeStamp <= this.armedAt) return;
      if (isKeyCode(event.code) || event.code === 'Tab') event.preventDefault();
      if (event.key === 'Escape') this.cancelCapture();
      else if (this.device === 'keyboard') this.applyInput(event.code);
      return;
    }
    if (event.key === 'Escape') this.back();
  }

  /** Pad B and Esc alike: cancel a waiting rebind, else go back. */
  private onBack(): void {
    if (this.waiting) this.cancelCapture();
    else this.back();
  }

  /** Controller capture, one step: the first fresh button but B. Every button is read each step to keep its edge. */
  private pollCapture(): void {
    if (!this.armed) {
      this.armed = true;
      return;
    }
    let pressed: number | undefined;
    this.padWatches.forEach((watch, index) => {
      if (watch.pressed() && index !== PAD_BUTTON.B && pressed === undefined) pressed = index;
    });
    if (this.device === 'pad' && pressed !== undefined) this.applyInput(pressed);
  }

  /** Watch the bound pad pause, which backs out of Settings unless the menus keep that button. */
  private watchPause(): void {
    const button = this.controls.pad.pause;
    this.pauseWatch = watchPadButton(this, menuSafe('pad', button) ? button : -1);
    this.pauseWatch.reset();
  }

  private applyInput(input: string | number): void {
    const action = this.waiting;
    if (!action) return;
    const result = rebind(this.controls, this.device, action, input);
    if (result.ok) {
      this.controls = result.controls;
      storeControls(this, this.controls);
      // A rebind or swap may have moved Pause, which also backs out of here.
      this.watchPause();
      this.note = result.note;
      audioOf(this).play('ui.confirm');
    } else {
      this.note = result.note;
      audioOf(this).play('ui.back');
    }
    this.endCapture();
  }

  /** The Controls page's state, for the browser suite. */
  get controlsReport(): {
    device: ControlDevice;
    waiting: ControlAction | null;
    note: string;
    confirm: ControlsReset | null;
  } {
    return {
      device: this.device,
      waiting: this.waiting,
      note: this.note,
      confirm: this.confirmReset,
    };
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    if (this.confirmReset) {
      this.scene.start(SCENE.settings, {
        ...(this.returnTo ? { pause: this.returnTo } : {}),
        page: 'controls',
        device: this.device,
      } satisfies SettingsPayload);
    } else if (this.controlsPage) {
      this.scene.start(SCENE.settings, {
        ...(this.returnTo ? { pause: this.returnTo } : {}),
        focus: 'controls',
      } satisfies SettingsPayload);
    } else if (this.kindsPage) {
      this.scene.start(SCENE.settings, {
        ...(this.returnTo ? { pause: this.returnTo } : {}),
        focus: 'kinds',
      } satisfies SettingsPayload);
    } else if (this.returnTo) this.scene.start(SCENE.pause, this.returnTo);
    else this.scene.start(SCENE.intro);
  }
}

function isOn(feedback: Readonly<FeedbackSettings>, key: FeedbackToggle): boolean {
  return key === 'numbers' ? feedback.numbers : feedback[key] > 0;
}
