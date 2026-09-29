import Phaser from 'phaser';
import { PASSIVE_COLOR, RELIC_COLOR } from '../core/offerColors';
import {
  CONFIRM_PROMPTS,
  EMPTY_STRIP_TEXT,
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
import {
  CRIMSON,
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
import { attachMenuInput, attachNavInput, watchStartButton, type MenuItem } from './input';

const BACKDROP_ALPHA = 0.8;

/** The left column: the hero on a stand, the level badge and the menu under it. */
const STAND_X = 170;
const PEDESTAL_Y = 180;
const MENU_TOP = 250;
const MENU_PITCH = 42;
const ROW_WIDTH = 220;
const ROW_HEIGHT = 34;

/** The right column: three framed strips, the run's stats and an info line. */
const STRIP_X = 330;
const STRIP_WIDTH = 600;
/** Where a strip's contents start, right of its label. */
const STRIP_CONTENT_X = STRIP_X + 104;
const TILE_PITCH = 40;
const TILES_PER_ROW = Math.floor((STRIP_X + STRIP_WIDTH - STRIP_CONTENT_X) / TILE_PITCH);
/** Four spells fill the strip at this pitch, room enough for the roster's longest name (CO-179). */
const SPELL_PITCH = 120;
const SPELL_STRIP_HEIGHT = 96;
/** A spell name's font sizes, tried in order until it fits. */
const NAME_SIZES = [12, 11, 10] as const;
const INFO_HINT = 'Point at a spell, passive or relic, or reach it with the arrows or a pad';
/** The pad's highlight round the selected strip item. */
const CURSOR_COLOR = 0xffffff;
const NAV_DIRECTIONS: readonly NavDirection[] = ['up', 'down', 'left', 'right'];

/** One readable item in a strip, for the pointer and the pad alike. */
interface BuildSlot {
  x: number;
  y: number;
  /** Its face's size, for the pad's highlight. */
  size: number;
  /** What the info line reads for it. */
  info: string;
  setLit(on: boolean): void;
}

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
  private cursor: Phaser.GameObjects.Rectangle | null = null;

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
    /** The pad's highlight, where it sits over a strip item; `null` while hidden. */
    cursor: { x: number; y: number } | null;
  } {
    const cursor = this.cursor?.visible ? { x: this.cursor.x, y: this.cursor.y } : null;
    return { focus: this.focus, info: this.info?.text ?? '', cursor };
  }

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
    this.cursor = null;
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
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.repeat) back();
    });
    // The scene's own emitter keeps its listeners across a restart; drop this one.
    const start = watchStartButton(this);
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
      this.addRow(STAND_X, MENU_TOP + i * MENU_PITCH, ROW_WIDTH, PAUSE_LABELS[action], () =>
        this.choose(action, view),
      ),
    );
    const hintY = MENU_TOP + PAUSE_ACTIONS.length * MENU_PITCH + 12;
    this.addHint(STAND_X, hintY, 'Esc or Start to resume');
    this.addHint(STAND_X, hintY + 22, 'click, arrows + Enter, or a gamepad');

    this.info = this.add.text(STRIP_X, 440, INFO_HINT, {
      fontFamily: SERIF,
      fontSize: '15px',
      color: '#888888',
      wordWrap: { width: STRIP_WIDTH },
    });
    this.cursor = this.add
      .rectangle(0, 0, TILE, TILE)
      .setStrokeStyle(2, CURSOR_COLOR)
      .setVisible(false);

    const rows = [
      this.drawSpells(view.spells, 28),
      ...this.drawTiles('Passives', view.passives, 136, (x, y, tile) => this.addTile(x, y, tile)),
      ...this.drawTiles('Relics', view.relics, 268, (x, y, tile) => this.addGem(x, y, tile)),
    ].filter((row) => row.length > 0);
    this.children.bringToTop(this.cursor);
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
      const slot = this.padSlot;
      this.cursor?.setVisible(slot !== null);
      if (slot) this.cursor?.setPosition(slot.x, slot.y).setSize(slot.size + 8, slot.size + 8);
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
    const slot = pointed ?? this.padSlot;
    this.info?.setText(slot ? slot.info : INFO_HINT).setColor(slot ? '#eeeeee' : '#888888');
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
      const rim = addSpellDisc(this, x, cy, spell);
      this.addFittedName(x, cy + SPELL_ICON_SIZE / 2 + 12, spell.name, pitch - 8);
      return this.slot(rim, x, cy, SPELL_ICON_SIZE + 6, itemInfo(spell), rim.strokeColor, 2);
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
        add(STRIP_CONTENT_X + TILE / 2 + col * TILE_PITCH, y + 34 + row * 44, tile),
      );
    });
    return rows;
  }

  /** A passive: its icon (CO-179) in a mint rim, or its lettered tile with no icon art. */
  private addTile(x: number, y: number, tile: PauseItem): BuildSlot {
    const face = addBuildIcon(this, x, y, tile, PASSIVE_COLOR) ?? addPassiveTile(this, x, y, tile);
    return this.slot(face, x, y, TILE + 4, itemInfo(tile), PASSIVE_COLOR);
  }

  /** A relic buff: its icon (CO-179) in a violet rim, or its lettered gem with no icon art. */
  private addGem(x: number, y: number, tile: PauseItem): BuildSlot {
    const face = addBuildIcon(this, x, y, tile, RELIC_COLOR) ?? addRelicGem(this, x, y, tile);
    return this.slot(face, x, y, TILE + 4, itemInfo(tile), RELIC_COLOR);
  }

  /**
   * One readable item in a strip. Pointing at it, or the pad selecting it,
   * thickens its rim in its kind's colour and reads it on the info line.
   */
  private slot(
    face: Phaser.GameObjects.Shape,
    x: number,
    y: number,
    size: number,
    info: string,
    rim: number,
    restWidth = 1,
  ): BuildSlot {
    let hovered = false;
    let lit = false;
    const paint = (): void => {
      face.setStrokeStyle(hovered || lit ? restWidth + 1 : restWidth, rim);
    };
    const slot: BuildSlot = {
      x,
      y,
      size,
      info,
      setLit: (on) => {
        lit = on;
        paint();
      },
    };
    face.setInteractive();
    face.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      hovered = true;
      paint();
      this.showInfo(slot);
    });
    face.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      hovered = false;
      paint();
      this.showInfo(null);
    });
    return slot;
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
      this.addRow(width / 2 - 80, 330, 140, 'Yes', () => this.confirmChoice(action), true),
      this.addRow(width / 2 + 80, 330, 140, 'No', () => this.backToMenu(view), true),
    ];
    attachMenuInput(this, items, { keyboard: true, enterDefault: 1 });
    this.addHint(width / 2, 410, 'Esc or Start to go back');
  }

  /**
   * One menu row: a ▶ marker, its label and, when selected, a wine bar with a
   * crimson edge. A pointer lights it too, as a pad or the arrows do. A
   * `button` row (Yes / No) centres its label and shows its bar faintly at
   * rest, so it reads as a button.
   */
  private addRow(
    x: number,
    y: number,
    rowWidth: number,
    label: string,
    act: () => void,
    button = false,
  ): MenuItem {
    const left = x - rowWidth / 2;
    const restAlpha = button ? 0.35 : 0;
    // The bar is the click target, so it fades by its fill: Phaser never
    // hit-tests an object at alpha 0.
    const bar = this.add.rectangle(x, y, rowWidth, ROW_HEIGHT, WINE, restAlpha);
    const edge = this.add.rectangle(left + 1.5, y, 3, ROW_HEIGHT, CRIMSON).setAlpha(0);
    const text = this.add
      .text(button ? x : left + 32, y, label, {
        fontFamily: SERIF,
        fontSize: '20px',
        color: '#bdb3a8',
      })
      .setOrigin(button ? 0.5 : 0, 0.5);
    // Just left of a centred label; at the row's left for a menu row.
    const markerX = button ? x - text.width / 2 - 20 : left + 12;
    const marker = this.add
      .text(markerX, y, '▶', { fontFamily: SERIF, fontSize: '14px', color: CRIMSON_CSS })
      .setOrigin(0, 0.5)
      .setAlpha(0);

    let selected = false;
    let hovered = false;
    const paint = (): void => {
      const lit = selected || hovered;
      bar.setFillStyle(WINE, selected ? 1 : hovered ? 0.6 : restAlpha);
      edge.setAlpha(lit ? 1 : 0);
      marker.setAlpha(lit ? 1 : 0);
      text.setColor(lit ? '#ffffff' : '#bdb3a8');
    };
    bar.setInteractive({ useHandCursor: true });
    bar.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      hovered = true;
      paint();
      audioOf(this).play('ui.move');
    });
    bar.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      hovered = false;
      paint();
    });
    bar.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, act);
    return {
      setSelected: (on) => {
        selected = on;
        paint();
      },
      confirm: act,
    };
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
