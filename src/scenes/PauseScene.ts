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
  type PauseView,
} from '../core/pauseModel';
import { SCENE, isPausePayload, type PausePayload } from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import {
  CRIMSON,
  CRIMSON_CSS,
  SERIF,
  SPELL_ICON_SIZE,
  TILE,
  WINE,
  addPassiveTile,
  addRelicGem,
  addSpellDisc,
  drawHeroStand,
  drawStrip,
} from './buildStrips';
import { attachMenuInput, watchStartButton, type MenuItem } from './input';

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
const SPELL_PITCH = 84;
const INFO_HINT = 'Point at a passive or relic to read it';

/**
 * Pause screen (#252): launched by Game over its own paused scene with the
 * run's build. The hero idles on a stand with the run level on a badge and the
 * menu under it; beside it, framed strips hold the spells' icons, the passives
 * as tiles with their ranks and the relic buffs as gems with their stacks, and
 * pointing at a tile reads it out. Resume, Restart, End run and Main menu by
 * mouse, arrows + Enter or a gamepad; Esc or pad Start resumes. The last three
 * ask first: the scene restarts itself with `confirm` set, which shows Yes / No
 * (No is Enter's default) and goes back to the menu on No, Esc or Start. A
 * confirmed choice is emitted as `PAUSE_EVENT.choose` on Game's emitter; Game
 * stops this scene as it leaves. The HUD keeps running underneath, and holds
 * still because Game sends it nothing while paused.
 */
export class PauseScene extends Phaser.Scene {
  private payload: PausePayload | null = null;
  /** Set once this screen has acted; everything after is ignored until it stops. */
  private leaving = false;

  constructor() {
    super(SCENE.pause);
  }

  /** What the screen shows, read-only; the browser suite asserts on it. */
  get view(): Readonly<PausePayload> | null {
    return this.payload;
  }

  init(data: unknown): void {
    this.payload = isPausePayload(data) ? data : null;
    // Phaser replays the last launch payload on a payload-less launch; clear it.
    this.scene.settings.data = {};
  }

  create(): void {
    this.leaving = false;
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
    attachMenuInput(this, items, { keyboard: true, enterDefault: 0 });
    const hintY = MENU_TOP + PAUSE_ACTIONS.length * MENU_PITCH + 12;
    this.addHint(STAND_X, hintY, 'Esc or Start to resume');
    this.addHint(STAND_X, hintY + 22, 'click, arrows + Enter, or a gamepad');

    const info = this.add.text(STRIP_X, 440, INFO_HINT, {
      fontFamily: SERIF,
      fontSize: '15px',
      color: '#888888',
      wordWrap: { width: STRIP_WIDTH },
    });
    const show = (tile: PauseItem | null): void => {
      info.setText(tile ? itemInfo(tile) : INFO_HINT).setColor(tile ? '#eeeeee' : '#888888');
    };

    this.drawSpells(view.spells, 28);
    this.drawTiles('Passives', view.passives, 136, (x, y, tile) =>
      this.hoverable(addPassiveTile(this, x, y, tile), tile, show, PASSIVE_COLOR),
    );
    this.drawTiles('Relics', view.relics, 268, (x, y, tile) =>
      this.hoverable(addRelicGem(this, x, y, tile), tile, show, RELIC_COLOR),
    );
    this.add.text(STRIP_X, 408, statsLine(view), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#bbbbbb',
    });
  }

  /** The hero idling on its pedestal, the "Paused" title over it and the level badge under it. */
  private drawStand(level: number): void {
    this.add
      .text(STAND_X, 44, 'Paused', { fontFamily: SERIF, fontSize: '42px', color: CRIMSON_CSS })
      .setOrigin(0.5);
    drawHeroStand(this, STAND_X, PEDESTAL_Y, level);
  }

  private drawSpells(spells: PauseView['spells'], y: number): void {
    drawStrip(this, STRIP_X, y, STRIP_WIDTH, 96, 'Spells');
    const cy = y + 38;
    // A `?loadout=` run can carry more spells than a real one; squeeze them
    // into the strip rather than past it, and drop the names that would collide.
    const room = STRIP_X + STRIP_WIDTH - STRIP_CONTENT_X - 8;
    const pitch = Math.min(SPELL_PITCH, room / Math.max(1, spells.length));
    const named = pitch === SPELL_PITCH;
    spells.forEach((spell, i) => {
      const x = STRIP_CONTENT_X + SPELL_ICON_SIZE / 2 + i * pitch;
      addSpellDisc(this, x, cy, spell);
      if (!named) return;
      this.add
        .text(x, cy + SPELL_ICON_SIZE / 2 + 12, spell.name, {
          fontFamily: SERIF,
          fontSize: '12px',
          color: '#dddddd',
          align: 'center',
          wordWrap: { width: SPELL_PITCH - 4 },
        })
        .setOrigin(0.5, 0);
    });
  }

  /** A strip of tiles in rows of `TILES_PER_ROW`, or "None yet". */
  private drawTiles(
    label: string,
    tiles: readonly PauseItem[],
    y: number,
    add: (x: number, y: number, tile: PauseItem) => void,
  ): void {
    drawStrip(this, STRIP_X, y, STRIP_WIDTH, 120, label);
    if (tiles.length === 0) {
      this.add.text(STRIP_CONTENT_X, y + 12, EMPTY_STRIP_TEXT, {
        fontFamily: SERIF,
        fontSize: '14px',
        color: '#777777',
      });
      return;
    }
    tiles.forEach((tile, i) => {
      const col = i % TILES_PER_ROW;
      const row = Math.floor(i / TILES_PER_ROW);
      add(STRIP_CONTENT_X + TILE / 2 + col * TILE_PITCH, y + 34 + row * 44, tile);
    });
  }

  /** Pointing at a tile thickens its rim, in its kind's colour, and reads it on the info line. */
  private hoverable(
    face: Phaser.GameObjects.Rectangle,
    tile: PauseItem,
    show: (t: PauseItem | null) => void,
    rim: number,
  ): void {
    face.setInteractive();
    face.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      face.setStrokeStyle(2, rim);
      show(tile);
    });
    face.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      face.setStrokeStyle(1, rim);
      show(null);
    });
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
    if (!needsConfirm(action)) {
      this.resume();
      return;
    }
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.restart({ view, confirm: action } satisfies PausePayload);
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
