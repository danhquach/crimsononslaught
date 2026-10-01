import Phaser from 'phaser';
import { defaultControls, joinLabels, keyLabel, menuSafe, padLabel } from '../core/controls';
import { PASSIVE_COLOR, RELIC_COLOR, offerColor } from '../core/offerColors';
import {
  CONFIRM_PROMPTS,
  EMPTY_STRIP_TEXT,
  INFO_HINT,
  PAUSE_ACTIONS,
  PAUSE_EVENT,
  PAUSE_LABELS,
  itemInfo,
  needsConfirm,
  statsLine,
  type ConfirmAction,
  type PauseAction,
  type PauseChoosePayload,
  type PauseItem,
  type PauseSpell,
  type PauseView,
} from '../core/pauseModel';
import { stepPauseFocus, type NavDirection, type PauseFocus } from '../core/pauseNav';
import {
  SCENE,
  isPausePayload,
  type PausePayload,
  type SettingsPayload,
} from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import { addInspectable, infoLook, type BuildSlot } from './buildInspect';
import {
  CRIMSON_CSS,
  SERIF,
  SPELL_ICON_SIZE,
  TILE,
  WINE,
  addBuildIcon,
  addPassiveTile,
  addRelicGem,
  addSpellDisc,
  drawHeroStand,
  drawStrip,
} from './buildStrips';
import {
  attachMenuInput,
  attachNavInput,
  attachPadButtons,
  watchPadButton,
  type MenuItem,
} from './input';
import { controlsOf } from './controls';
import { addMenuRow } from './menuUi';

const BACKDROP_ALPHA = 0.8;

/** The left column: the hero on a stand, the level badge and the menu under it. */
const STAND_X = 170;
const PEDESTAL_Y = 180;
const MENU_TOP = 250;
const MENU_PITCH = 42;
const ROW_WIDTH = 220;

/** The right column: three framed strips, the run's stats and an info line. */
const STRIP_X = 330;
const STRIP_WIDTH = 600;
/** Where a strip's contents start, right of its label. */
const STRIP_CONTENT_X = STRIP_X + 104;
const TILE_PITCH = 48;
const TILES_PER_ROW = Math.floor((STRIP_X + STRIP_WIDTH - STRIP_CONTENT_X) / TILE_PITCH);
/** Four spells fill the strip at this pitch, room enough for the roster's longest name (CO-179). */
const SPELL_PITCH = 120;
const SPELL_STRIP_HEIGHT = 96;
/** A spell name's font sizes, tried in order until it fits. */
const NAME_SIZES = [12, 11, 10] as const;
const NAV_DIRECTIONS: readonly NavDirection[] = ['up', 'down', 'left', 'right'];

/**
 * Pause screen (#252): launched by Game over its own paused scene with the
 * run's build. The hero idles on a stand with the run level on a badge and the
 * menu under it; beside it, framed strips hold the spells' icons, the passives
 * as tiles with their ranks and the relic buffs as gems with their stacks, and
 * pointing at one, or reaching it with the arrows or a pad (CO-179), reads it
 * out. Resume, Settings, Restart, End run and Main menu by mouse, arrows +
 * Enter or a gamepad; Esc or pad Start resumes. Settings (CO-192) opens the
 * Settings scene over the still-paused Game, straight away, and its Back
 * returns here with the same view. The last three ask first: the scene
 * restarts itself with `confirm` set, which shows Yes / No (No is Enter's
 * default) and goes back to the menu on No, Esc or Start. A confirmed choice is emitted as `PAUSE_EVENT.choose` on Game's emitter; Game
 * stops this scene as it leaves. The HUD keeps running underneath, and holds
 * still because Game sends it nothing while paused.
 */
export class PauseScene extends Phaser.Scene {
  private payload: PausePayload | null = null;
  /** Set once this screen has acted; everything after is ignored until it stops. */
  private leaving = false;
  /** Where the pad or the arrows have the highlight; `null` until the first press. */
  private focus: PauseFocus | null = null;
  /** The strip item the pad has lit, if the focus is in the strips. */
  private padSlot: BuildSlot | null = null;
  private info: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SCENE.pause);
  }

  /** What the screen shows, read-only; the browser suite asserts on it. */
  get view(): Readonly<PausePayload> | null {
    return this.payload;
  }

  /** The pad's focus and the info line, read-only, for the browser suite (CO-179). */
  get nav(): {
    focus: PauseFocus | null;
    info: string;
    /** The centre of the strip item the pad has lit; `null` while the focus is on a menu row. */
    cursor: { x: number; y: number } | null;
  } {
    const slot = this.padSlot;
    return {
      focus: this.focus,
      info: this.info?.text ?? '',
      cursor: slot ? { x: slot.x, y: slot.y } : null,
    };
  }

  /** The rebindable controls (CO-226), read as the screen opens. */
  private controls = defaultControls();

  init(data: unknown): void {
    this.payload = isPausePayload(data) ? data : null;
    // Phaser replays the last launch payload on a payload-less launch; clear it.
    this.scene.settings.data = {};
  }

  create(): void {
    this.leaving = false;
    this.focus = null;
    this.padSlot = null;
    this.info = null;
    this.controls = controlsOf(this);
    if (!this.payload) {
      console.warn('[Pause] launched without a valid payload; resuming Game');
      this.resume();
      return;
    }
    const { view, confirm } = this.payload;
    const { width, height } = this.scale;

    // The HUD would show through behind the title and the strips, and the
    // stats line says what it does; it comes back as this screen closes.
    this.scene.setVisible(false, SCENE.hud);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.setVisible(true, SCENE.hud));

    // Full-screen backdrop; interactive so clicks never reach Game objects underneath.
    this.add.rectangle(0, 0, width, height, 0x000000, BACKDROP_ALPHA).setOrigin(0).setInteractive();

    if (confirm) this.drawConfirm(view, confirm);
    else this.drawMenu(view);

    // Phaser applies a resume, stop or restart on its next step and empties
    // the key queue at the end of that step, and scenes read the queue only as
    // keys arrive, so a key this screen acts on never reaches the scene it
    // hands over to.
    const back = confirm ? () => this.backToMenu(view) : () => this.resume();
    // The bound pause key and button (CO-226) back out as well, unless they are one the
    // menus keep for themselves; Esc and B always do.
    const { keyboard, pad } = this.controls;
    const keyBacks = menuSafe('keyboard', keyboard.pause);
    const padBacks = menuSafe('pad', pad.pause);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === 'Escape' || (keyBacks && event.code === keyboard.pause)) back();
    });
    // Pad B backs out like Esc and the pause button (#377).
    attachPadButtons(this, { B: back });
    // The scene's own emitter keeps its listeners across a restart; drop this one.
    // An index no pad has when the pause button is one the menus keep for themselves.
    const start = watchPadButton(this, padBacks ? pad.pause : -1);
    const pollStart = (): void => {
      if (start.pressed()) back();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, pollStart);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, pollStart);
    });
  }

  private drawMenu(view: PauseView): void {
    this.drawStand(view.level);
    const items = PAUSE_ACTIONS.map((action, i) =>
      addMenuRow(this, {
        kind: 'bar',
        label: PAUSE_LABELS[action],
        x: STAND_X,
        y: MENU_TOP + i * MENU_PITCH,
        width: ROW_WIDTH,
        align: 'left',
        restAlpha: 0,
        onConfirm: () => this.choose(action, view),
      }),
    );
    const hintY = MENU_TOP + PAUSE_ACTIONS.length * MENU_PITCH + 12;
    this.addHint(STAND_X, hintY, `${this.leaveKeys(true)} to resume`);
    this.addHint(STAND_X, hintY + 22, 'click, arrows + Enter, or a gamepad');

    this.info = this.add.text(STRIP_X, 440, INFO_HINT, {
      fontFamily: SERIF,
      fontSize: '15px',
      color: '#888888',
      wordWrap: { width: STRIP_WIDTH },
    });

    const rows = [
      this.drawSpells(view.spells, 28),
      ...this.drawTiles('Passives', view.passives, 136, (x, y, tile) => this.addTile(x, y, tile)),
      ...this.drawTiles('Relics', view.relics, 268, (x, y, tile) => this.addGem(x, y, tile)),
    ].filter((row) => row.length > 0);
    this.add.text(STRIP_X, 408, statsLine(view), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#bbbbbb',
    });
    this.attachFocus(items, rows);
  }

  /**
   * CO-179: the pad and the arrows walk the menu and the strips as one layout
   * (`core/pauseNav.ts`). Nothing is lit until the first press, which wakes the
   * highlight on Resume; Enter with nothing lit is Resume, as before. A or
   * Enter acts on a menu row and does nothing on a strip item.
   */
  private attachFocus(items: readonly MenuItem[], rows: readonly BuildSlot[][]): void {
    const layout = { menuRows: items.length, buildRows: rows.map((row) => row.map((s) => s.x)) };
    const focusOn = (next: PauseFocus): void => {
      const before = this.focus;
      if (before && JSON.stringify(before) === JSON.stringify(next)) return;
      this.focus = next;
      audioOf(this).play('ui.move');
      items.forEach((item, i) => item.setSelected(next.zone === 'menu' && i === next.index));
      this.padSlot?.setLit(false);
      this.padSlot = next.zone === 'build' ? (rows[next.row]?.[next.col] ?? null) : null;
      this.padSlot?.setLit(true);
      this.showInfo(null);
    };
    attachNavInput(
      this,
      (pressed, source) => {
        const dir = NAV_DIRECTIONS.find((d) => pressed[d]);
        if (dir) {
          focusOn(stepPauseFocus(this.focus, dir, layout));
          return;
        }
        if (!pressed.confirm) return;
        const focus = this.focus;
        if (focus?.zone === 'menu') items[focus.index]?.confirm();
        else if (focus === null && source === 'keyboard') items[0]?.confirm();
        else if (focus === null) focusOn(stepPauseFocus(null, 'down', layout));
      },
      { keyboard: true },
    );
  }

  /** The info line: the pointed-at slot, else the pad's, else the hint. */
  private showInfo(pointed: BuildSlot | null): void {
    const { text, color } = infoLook(pointed ?? this.padSlot);
    this.info?.setText(text).setColor(color);
  }

  /** The hero idling on its pedestal, the "Paused" title over it and the level badge under it. */
  private drawStand(level: number): void {
    this.add
      .text(STAND_X, 44, 'Paused', { fontFamily: SERIF, fontSize: '42px', color: CRIMSON_CSS })
      .setOrigin(0.5);
    drawHeroStand(this, STAND_X, PEDESTAL_Y, level);
  }

  /** The spells' icons with their names under them, fitted to the strip; returns them as one row. */
  private drawSpells(spells: readonly PauseSpell[], y: number): BuildSlot[] {
    drawStrip(this, STRIP_X, y, STRIP_WIDTH, SPELL_STRIP_HEIGHT, 'Spells');
    const cy = y + 38;
    // A `?loadout=` run can carry more spells than a real one; squeeze them
    // into the strip rather than past it.
    const room = STRIP_X + STRIP_WIDTH - STRIP_CONTENT_X - 8;
    const pitch = Math.min(SPELL_PITCH, room / Math.max(1, spells.length));
    return spells.map((spell, i) => {
      const x = STRIP_CONTENT_X + pitch / 2 + i * pitch;
      const slot = addInspectable(
        this,
        () => addSpellDisc(this, x, cy, spell),
        {
          x,
          y: cy,
          size: SPELL_ICON_SIZE + 6,
          info: itemInfo(spell),
          rim: offerColor('active', spell.id),
          restWidth: 2,
        },
        (s) => this.showInfo(s),
      );
      this.addFittedName(x, cy + SPELL_ICON_SIZE / 2 + 12, spell.name, pitch - 8);
      return slot;
    });
  }

  /**
   * CO-179: a spell's name on one line under its icon, at most `maxWidth`
   * across: a size or two smaller if it must, then trimmed with an ellipsis.
   * The info line reads the whole name.
   */
  private addFittedName(x: number, y: number, name: string, maxWidth: number): void {
    const text = this.add
      .text(x, y, name, { fontFamily: SERIF, fontSize: `${NAME_SIZES[0]}px`, color: '#dddddd' })
      .setOrigin(0.5, 0);
    for (const size of NAME_SIZES.slice(1)) {
      if (text.width <= maxWidth) return;
      text.setFontSize(size);
    }
    let kept = name;
    while (text.width > maxWidth && kept.length > 1) {
      kept = kept.slice(0, -1).trimEnd();
      text.setText(`${kept}…`);
    }
  }

  /** A strip of tiles in rows of `TILES_PER_ROW`, or "None yet"; returns the tiles row by row. */
  private drawTiles(
    label: string,
    tiles: readonly PauseItem[],
    y: number,
    add: (x: number, y: number, tile: PauseItem) => BuildSlot,
  ): BuildSlot[][] {
    drawStrip(this, STRIP_X, y, STRIP_WIDTH, 120, label);
    if (tiles.length === 0) {
      this.add.text(STRIP_CONTENT_X, y + 12, EMPTY_STRIP_TEXT, {
        fontFamily: SERIF,
        fontSize: '14px',
        color: '#777777',
      });
      return [];
    }
    const rows: BuildSlot[][] = [];
    tiles.forEach((tile, i) => {
      const col = i % TILES_PER_ROW;
      const row = Math.floor(i / TILES_PER_ROW);
      (rows[row] ??= []).push(
        add(STRIP_CONTENT_X + TILE / 2 + col * TILE_PITCH, y + 34 + row * TILE_PITCH, tile),
      );
    });
    return rows;
  }

  /** A passive: its icon (CO-179) in a mint rim, or its lettered tile with no icon art. */
  private addTile(x: number, y: number, tile: PauseItem): BuildSlot {
    return addInspectable(
      this,
      () => addBuildIcon(this, x, y, tile, PASSIVE_COLOR) ?? addPassiveTile(this, x, y, tile),
      { x, y, size: TILE + 4, info: itemInfo(tile), rim: PASSIVE_COLOR },
      (s) => this.showInfo(s),
    );
  }

  /** A relic buff: its icon (CO-179) in a violet rim, or its lettered gem with no icon art. */
  private addGem(x: number, y: number, tile: PauseItem): BuildSlot {
    return addInspectable(
      this,
      () => addBuildIcon(this, x, y, tile, RELIC_COLOR) ?? addRelicGem(this, x, y, tile),
      { x, y, size: TILE + 4, info: itemInfo(tile), rim: RELIC_COLOR },
      (s) => this.showInfo(s),
    );
  }

  private drawConfirm(view: PauseView, action: ConfirmAction): void {
    const { width } = this.scale;
    const { question, detail } = CONFIRM_PROMPTS[action];
    this.add
      .text(width / 2, 120, 'Paused', { fontFamily: SERIF, fontSize: '42px', color: CRIMSON_CSS })
      .setOrigin(0.5);
    this.add.rectangle(width / 2, 280, 568, 208).setStrokeStyle(1, 0x2a0a10);
    this.add.rectangle(width / 2, 280, 560, 200, 0x17110f).setStrokeStyle(2, WINE);
    this.add
      .text(width / 2, 220, question, { fontFamily: SERIF, fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 262, detail, { fontFamily: SERIF, fontSize: '17px', color: '#cccccc' })
      .setOrigin(0.5);
    const items = [
      addMenuRow(this, {
        kind: 'bar',
        label: 'Yes',
        x: width / 2 - 80,
        y: 330,
        width: 140,
        onConfirm: () => this.confirmChoice(action),
      }),
      addMenuRow(this, {
        kind: 'bar',
        label: 'No',
        x: width / 2 + 80,
        y: 330,
        width: 140,
        onConfirm: () => this.backToMenu(view),
      }),
    ];
    attachMenuInput(this, items, { keyboard: true, enterDefault: 1 });
    this.addHint(width / 2, 410, `${this.leaveKeys(false)} to go back`);
  }

  /** The keys and buttons that leave this screen, as the hints name them: Esc, the bound pause inputs and, resuming, B. */
  private leaveKeys(withB: boolean): string {
    const { keyboard, pad } = this.controls;
    return joinLabels([
      'Esc',
      ...(menuSafe('keyboard', keyboard.pause) ? [keyLabel(keyboard.pause)] : []),
      ...(menuSafe('pad', pad.pause) ? [padLabel(pad.pause)] : []),
      ...(withB ? ['B'] : []),
    ]);
  }

  private addHint(x: number, y: number, text: string): void {
    this.add
      .text(x, y, text, { fontFamily: SERIF, fontSize: '14px', color: '#888888' })
      .setOrigin(0.5);
  }

  private choose(action: PauseAction, view: PauseView): void {
    if (action === 'settings') {
      this.openSettings(view);
      return;
    }
    if (!needsConfirm(action)) {
      this.resume();
      return;
    }
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.restart({ view, confirm: action } satisfies PausePayload);
  }

  /**
   * Game stays paused; Settings hands back the view on Back. Guarded like
   * every way out of this screen.
   */
  private openSettings(view: PauseView): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.settings, { pause: { view } } satisfies SettingsPayload);
  }

  private backToMenu(view: PauseView): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.back');
    this.scene.restart({ view } satisfies PausePayload);
  }

  /** Idempotent, like LevelUp's pick: Game handles the choice and stops this scene. */
  private confirmChoice(action: ConfirmAction): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    const payload: PauseChoosePayload = { action };
    this.scene.get(SCENE.game).events.emit(PAUSE_EVENT.choose, payload);
  }

  private resume(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.back');
    this.scene.resume(SCENE.game);
    this.scene.stop();
  }
}
