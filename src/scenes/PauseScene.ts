import Phaser from 'phaser';
import { FRAMES } from '../config/frames';
import { spellIconFrame } from '../config/spellIcons';
import { artFrame } from '../core/animation';
import {
  CONFIRM_PROMPTS,
  EMPTY_STRIP_TEXT,
  PAUSE_ACTIONS,
  PAUSE_EVENT,
  PAUSE_LABELS,
  abbreviate,
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
import { hasFrameArt } from '../render/atlas';
import { audioOf } from '../render/audio';
import { attachMenuInput, watchStartButton, type MenuItem } from './input';

const CRIMSON = 0xdc143c;
const CRIMSON_CSS = '#dc143c';
const WINE = 0x5a1620;
const BACKDROP_ALPHA = 0.8;
const SERIF = 'Georgia, serif';

/** The left column: the hero on a stand, the level badge and the menu under it. */
const STAND_X = 170;
const HERO_CLIP = 'hero.idle.down';
const HERO_SCALE = 3;
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
const TILE = 32;
const TILE_PITCH = 40;
const TILES_PER_ROW = Math.floor((STRIP_X + STRIP_WIDTH - STRIP_CONTENT_X) / TILE_PITCH);
const SPELL_ICON_SIZE = 40;
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
    this.drawTiles('Passives', view.passives, 136, (x, y, tile) => this.addTile(x, y, tile, show));
    this.drawTiles('Relics', view.relics, 268, (x, y, tile) => this.addGem(x, y, tile, show));
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
    this.add.ellipse(STAND_X, PEDESTAL_Y, 130, 30, 0x2a0a10).setStrokeStyle(2, CRIMSON);
    if (this.anims.exists(HERO_CLIP)) {
      this.add
        .sprite(STAND_X, PEDESTAL_Y + 4, '__DEFAULT')
        .setOrigin(0.5, 1)
        .setScale(HERO_SCALE)
        .play(HERO_CLIP);
    } else {
      // No atlas: a plain marker keeps the stand from looking empty.
      this.add.circle(STAND_X, PEDESTAL_Y - 40, 28, 0x2a0a10).setStrokeStyle(2, CRIMSON);
    }
    this.add.rectangle(STAND_X, PEDESTAL_Y + 30, 64, 22, CRIMSON);
    this.add
      .text(STAND_X, PEDESTAL_Y + 30, `LV ${level}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  /** A framed strip with its label; the caller fills it. */
  private drawStrip(label: string, y: number, stripHeight: number): void {
    this.add
      .rectangle(STRIP_X - 4, y - 4, STRIP_WIDTH + 8, stripHeight + 8)
      .setOrigin(0)
      .setStrokeStyle(1, 0x2a0a10);
    this.add
      .rectangle(STRIP_X, y, STRIP_WIDTH, stripHeight, 0x17110f)
      .setOrigin(0)
      .setStrokeStyle(2, WINE);
    this.add.text(STRIP_X + 14, y + 12, label.toUpperCase(), {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: CRIMSON_CSS,
    });
  }

  private drawSpells(spells: PauseView['spells'], y: number): void {
    this.drawStrip('Spells', y, 96);
    const cy = y + 38;
    // A `?loadout=` run can carry more spells than a real one; squeeze them
    // into the strip rather than past it, and drop the names that would collide.
    const room = STRIP_X + STRIP_WIDTH - STRIP_CONTENT_X - 8;
    const pitch = Math.min(SPELL_PITCH, room / Math.max(1, spells.length));
    const named = pitch === SPELL_PITCH;
    spells.forEach(({ id, name }, i) => {
      const x = STRIP_CONTENT_X + SPELL_ICON_SIZE / 2 + i * pitch;
      this.add.circle(x, cy, SPELL_ICON_SIZE / 2 + 3, 0x000000).setStrokeStyle(2, 0xc9b48a);
      const frame = spellIconFrame(id);
      if (frame && hasFrameArt(this, frame)) {
        const icon = this.add.image(x, cy, FRAMES[frame].page, artFrame(frame));
        icon.setScale(SPELL_ICON_SIZE / Math.max(icon.width, icon.height));
      } else {
        // No icon art for this spell: its initials, as the HUD's slots fall back to.
        this.add
          .text(x, cy, abbreviate(name), { fontFamily: 'monospace', fontSize: '14px' })
          .setOrigin(0.5);
      }
      if (!named) return;
      this.add
        .text(x, cy + SPELL_ICON_SIZE / 2 + 12, name, {
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
    this.drawStrip(label, y, 120);
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

  /** A passive: a square tile with its letters and its rank on a badge. */
  private addTile(
    x: number,
    y: number,
    tile: PauseItem,
    show: (t: PauseItem | null) => void,
  ): void {
    const face = this.add.rectangle(x, y, TILE, TILE, 0x241a14).setStrokeStyle(1, 0x6b4a2a);
    this.add
      .text(x, y, tile.abbr, { fontFamily: 'monospace', fontSize: '13px', color: '#e8d8b0' })
      .setOrigin(0.5);
    this.addBadge(x + TILE / 2, y + TILE / 2, tile.count);
    this.hoverable(face, tile, show, () => face.setStrokeStyle(1, 0x6b4a2a));
  }

  /** A relic buff: a gem (a square on its point) with its letters and its stacks. */
  private addGem(x: number, y: number, tile: PauseItem, show: (t: PauseItem | null) => void): void {
    const face = this.add
      .rectangle(x, y, 24, 24, 0x4a1030)
      .setAngle(45)
      .setStrokeStyle(1, 0xc9b48a);
    this.add
      .text(x, y, tile.abbr, { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff' })
      .setOrigin(0.5);
    this.addBadge(x + 14, y + 12, tile.count);
    this.hoverable(face, tile, show, () => face.setStrokeStyle(1, 0xc9b48a));
  }

  private addBadge(x: number, y: number, count: number): void {
    this.add
      .text(x, y, `${count}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: CRIMSON_CSS,
        padding: { x: 3, y: 0 },
      })
      .setOrigin(0.5);
  }

  /** Pointing at a tile brightens its rim and reads it on the info line. */
  private hoverable(
    face: Phaser.GameObjects.Rectangle,
    tile: PauseItem,
    show: (t: PauseItem | null) => void,
    unlight: () => void,
  ): void {
    face.setInteractive();
    face.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      face.setStrokeStyle(2, CRIMSON);
      show(tile);
    });
    face.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      unlight();
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
