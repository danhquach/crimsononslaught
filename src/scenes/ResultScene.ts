import Phaser from 'phaser';
import { PASSIVE_COLOR, RELIC_COLOR } from '../core/offerColors';
import type { PauseItem } from '../core/pauseModel';
import {
  RESULT_EMPTY_TEXT,
  RESULT_LAYOUT,
  SPELL_PITCH,
  isConfirmKey,
  resultView,
  spellSlots,
  tileGrid,
  type Box,
  type ResultView,
} from '../core/resultModel';
import { saveNotice } from '../core/save';
import { SCENE, isResultPayload, type ResultPayload } from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import {
  CRIMSON,
  CRIMSON_CSS,
  SERIF,
  SPELL_ICON_SIZE,
  WINE,
  addBuildIcon,
  addPassiveTile,
  addRelicGem,
  addSpellDisc,
  drawHeroStand,
  drawStrip,
} from './buildStrips';
import { saveStoreFailed } from '../storage/localSave';
import { attachMenuInput } from './input';

const HINT = 'click, press Enter, or gamepad A';
const BUTTON_REST_ALPHA = 0.6;
const BUTTON_REST_TEXT = '#dddddd';

/** On-screen bounds of the button and its hint, for the browser suite. */
export interface ResultControls {
  button: Box;
  hint: Box;
}

/**
 * Result screen (#290): the outcome's headline and subtitle on top; the hero
 * on its stand with the run level and a stats card on the left (greyed on a
 * loss); the run's spells, passives with ranks and relic buffs with stacks
 * (icon art, or lettered tiles without it) in the pause screen's framed strips
 * on the right; and "Play again" with its hint at a fixed place at the bottom. Every area is fixed (`RESULT_LAYOUT`),
 * so no build moves the button. Click, Enter or pad A start SpellSelect,
 * exactly once. Started without a valid payload it falls back to SpellSelect
 * (spec §7).
 */
export class ResultScene extends Phaser.Scene {
  private payload: ResultPayload | null = null;
  private restarted = false;
  private placed: ResultControls | null = null;

  constructor() {
    super(SCENE.result);
  }

  /** The run this screen shows, read-only; the browser full-run test (CO-061) asserts on it. */
  get summary(): Readonly<ResultPayload> | null {
    return this.payload;
  }

  /** Where "Play again" and its hint were drawn; `null` before the screen is up. */
  get controls(): Readonly<ResultControls> | null {
    return this.placed;
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
    this.placed = null;
    // Win, loss or an early end: the run's track fades out here (CO-157).
    audioOf(this).stopMusic();
    if (!this.payload) {
      console.warn('[Result] started without a valid payload; returning to SpellSelect');
      this.scene.start(SCENE.spellSelect);
      return;
    }
    const view = resultView(this.payload);
    const { width, height } = this.scale;
    // Nothing runs under this screen, so it lays its own ground.
    this.add.rectangle(0, 0, width, height, 0x000000).setOrigin(0);

    this.drawHeadline(view);
    this.drawCard(view);
    this.drawSpells(view.spells);
    // Icon art as the pause screen draws it (CO-179), or its lettered tile without the art.
    this.drawTiles(
      'Passives',
      view.passives,
      RESULT_LAYOUT.passives,
      (scene, x, y, tile) =>
        addBuildIcon(scene, x, y, tile, PASSIVE_COLOR) ?? addPassiveTile(scene, x, y, tile),
    );
    this.drawTiles(
      'Relics',
      view.relics,
      RESULT_LAYOUT.relics,
      (scene, x, y, tile) =>
        addBuildIcon(scene, x, y, tile, RELIC_COLOR) ?? addRelicGem(scene, x, y, tile),
    );
    this.drawPlayAgain();
    // The run's save was written just before this screen opened (#316).
    const notice = saveNotice(false, saveStoreFailed());
    if (notice !== null) {
      this.add
        .text(width / 2, RESULT_LAYOUT.saveNoticeY, notice, {
          fontFamily: SERIF,
          fontSize: '14px',
          color: '#ff6666',
        })
        .setOrigin(0.5);
    }

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (isConfirmKey(event.key)) this.playAgain();
    });
  }

  private drawHeadline({ headline }: ResultView): void {
    const cx = this.scale.width / 2;
    this.add
      .text(cx, RESULT_LAYOUT.headlineY, headline.text, {
        fontFamily: SERIF,
        fontSize: '50px',
        color: headline.color,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, RESULT_LAYOUT.subtitleY, headline.subtitle, {
        fontFamily: SERIF,
        fontSize: '17px',
        color: '#cccccc',
      })
      .setOrigin(0.5);
  }

  /** The hero on its stand with the level badge, and the stat rows under it. */
  private drawCard(view: ResultView): void {
    const { card, rows, pedestalY } = RESULT_LAYOUT;
    drawStrip(this, card.x, card.y, card.width, card.height);
    drawHeroStand(this, card.x + card.width / 2, pedestalY, view.level, view.fallen);
    view.rows.forEach(([label, value], i) => {
      const y = rows.y + i * rows.pitch;
      this.add
        .text(rows.x, y, label, { fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa' })
        .setOrigin(0, 0.5);
      this.add
        .text(rows.valueX, y, value, {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#eeeeee',
        })
        .setOrigin(1, 0.5);
    });
  }

  /** The spells' icons with their names beside them; a crowded strip drops the names. */
  private drawSpells(spells: ResultView['spells']): void {
    const strip = RESULT_LAYOUT.spells;
    drawStrip(this, strip.x, strip.y, strip.width, strip.height, 'Spells');
    const { xs, y, named } = spellSlots(spells.length);
    spells.forEach((spell, i) => {
      const x = xs[i] ?? 0;
      addSpellDisc(this, x, y, spell);
      if (!named) return;
      this.add
        .text(x + SPELL_ICON_SIZE / 2 + 8, y, spell.name, {
          fontFamily: SERIF,
          fontSize: '14px',
          color: '#dddddd',
          wordWrap: { width: SPELL_PITCH - SPELL_ICON_SIZE - 20 },
        })
        .setOrigin(0, 0.5);
    });
  }

  /** A strip of tiles in fixed rows; a build too big for them ends on "+N". */
  private drawTiles(
    label: string,
    tiles: readonly PauseItem[],
    strip: Box,
    add: (scene: Phaser.Scene, x: number, y: number, tile: PauseItem) => unknown,
  ): void {
    drawStrip(this, strip.x, strip.y, strip.width, strip.height, label);
    if (tiles.length === 0) {
      this.add.text(strip.x + RESULT_LAYOUT.contentInset, strip.y + 12, RESULT_EMPTY_TEXT, {
        fontFamily: SERIF,
        fontSize: '14px',
        color: '#777777',
      });
      return;
    }
    const { slots, overflow } = tileGrid(tiles.length, strip);
    slots.forEach(({ x, y }, i) => {
      const tile = tiles[i];
      if (overflow > 0 && i === slots.length - 1) {
        this.add
          .text(x, y, `+${overflow}`, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#e8d8b0',
          })
          .setOrigin(0.5);
      } else if (tile) add(this, x, y, tile);
    });
  }

  /**
   * "Play again" as the pause screen's Yes / No buttons look: a wine bar that
   * lights up, with a crimson edge and a ▶ marker, under a pointer or once a
   * pad has woken the highlight; its hint sits under it.
   */
  private drawPlayAgain(): void {
    const box = RESULT_LAYOUT.button;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // The bar is the click target, so it fades by its fill: Phaser never
    // hit-tests an object at alpha 0.
    const bar = this.add.rectangle(cx, cy, box.width, box.height, WINE, BUTTON_REST_ALPHA);
    const edge = this.add.rectangle(box.x + 1.5, cy, 3, box.height, CRIMSON).setAlpha(0);
    const label = this.add
      .text(cx, cy, 'Play again', { fontFamily: SERIF, fontSize: '20px', color: BUTTON_REST_TEXT })
      .setOrigin(0.5);
    const marker = this.add
      .text(cx - label.width / 2 - 20, cy, '▶', {
        fontFamily: SERIF,
        fontSize: '14px',
        color: CRIMSON_CSS,
      })
      .setOrigin(0, 0.5)
      .setAlpha(0);
    const hint = this.add
      .text(cx, RESULT_LAYOUT.hintY, HINT, {
        fontFamily: SERIF,
        fontSize: '14px',
        color: '#888888',
      })
      .setOrigin(0.5);

    let selected = false;
    let hovered = false;
    const paint = (): void => {
      const lit = selected || hovered;
      bar.setFillStyle(WINE, lit ? 1 : BUTTON_REST_ALPHA);
      edge.setAlpha(lit ? 1 : 0);
      marker.setAlpha(lit ? 1 : 0);
      label.setColor(lit ? '#ffffff' : BUTTON_REST_TEXT);
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
    bar.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.playAgain());
    // Pad A: the first press lights the button, the next one confirms it.
    // Enter is handled in `create`, so the keyboard stays off here.
    attachMenuInput(this, [
      {
        setSelected: (on) => {
          selected = on;
          paint();
        },
        confirm: () => this.playAgain(),
      },
    ]);

    const bounds = (o: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text): Box => {
      const b = o.getBounds();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    this.placed = { button: bounds(bar), hint: bounds(hint) };
  }

  /** Idempotent: a click and Enter in the same frame start exactly one SpellSelect. */
  private playAgain(): void {
    if (this.restarted) return;
    this.restarted = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.spellSelect);
  }
}
