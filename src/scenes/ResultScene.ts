import Phaser from 'phaser';
import { PASSIVE_COLOR, RELIC_COLOR, offerColor } from '../core/offerColors';
import { INFO_HINT, itemInfo, type PauseItem } from '../core/pauseModel';
import type { NavDirection, PauseFocus } from '../core/pauseNav';
import {
  RESULT_EMPTY_TEXT,
  RESULT_LAYOUT,
  SPELL_PITCH,
  resultView,
  spellSlots,
  tileGrid,
  tilesPerRow,
  type Box,
  type ResultView,
} from '../core/resultModel';
import { stepResultFocus } from '../core/resultNav';
import { saveNotice } from '../core/save';
import { SCENE, isResultPayload, type ResultPayload } from '../core/scenePayloads';
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
import { saveStoreFailed } from '../storage/localSave';
import { addInspectable, infoLook, type BuildSlot } from './buildInspect';
import { focusable } from './focusRing';
import { attachNavInput, attachPadButtons, type MenuItem } from './input';

const HINT = 'click, press Enter, or gamepad A · Esc or B for the main menu';
const BUTTON_REST_ALPHA = 0.6;
const BUTTON_REST_TEXT = '#dddddd';
/** A spell's name starts this far right of its icon's centre: clear of the icon and its level badge. */
const NAME_INSET = SPELL_ICON_SIZE / 2 + 12;
const NAV_DIRECTIONS: readonly NavDirection[] = ['up', 'down', 'left', 'right'];

/** On-screen bounds of the buttons and their hint, for the browser suite. */
export interface ResultControls {
  /** "Play again". */
  button: Box;
  /** "Main menu" (CO-218). */
  menuButton: Box;
  hint: Box;
}

/**
 * Result screen (#290): the outcome's headline and subtitle on top; the hero
 * on its stand with the run level and a stats card on the left (greyed on a
 * loss); the run's spells, passives with ranks and relic buffs with stacks
 * (icon art, or lettered tiles without it) in the pause screen's framed strips
 * on the right; an info line under them; and "Play again" and "Main menu"
 * with their hint at a fixed place at the bottom. Every area is fixed
 * (`RESULT_LAYOUT`), so no build moves the buttons. Pointing at a spell,
 * passive or relic, or reaching it with the arrows or a pad (CO-198), reads it
 * out on the info line as the pause screen does. Click, Enter or pad A on
 * "Play again" start SpellSelect, and on "Main menu" open Intro, as do Esc and
 * pad B (CO-218); whichever comes first leaves, exactly once. A or Enter on a
 * strip item does nothing. Started without a valid payload it falls back to
 * SpellSelect (spec §7).
 */
export class ResultScene extends Phaser.Scene {
  private payload: ResultPayload | null = null;
  private leaving = false;
  private placed: ResultControls | null = null;
  /** Where the pad or the arrows have the highlight; `null` until the first press. */
  private focus: PauseFocus | null = null;
  /** The strip item the pad has lit, if the focus is in the strips. */
  private padSlot: BuildSlot | null = null;
  private info: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SCENE.result);
  }

  /** The run this screen shows, read-only; the browser full-run test (CO-061) asserts on it. */
  get summary(): Readonly<ResultPayload> | null {
    return this.payload;
  }

  /** Where the buttons and their hint were drawn; `null` before the screen is up. */
  get controls(): Readonly<ResultControls> | null {
    return this.placed;
  }

  /** The pad's focus and the info line, read-only, for the browser suite (CO-198). */
  get nav(): {
    focus: PauseFocus | null;
    info: string;
    /** The centre of the strip item the pad has lit; `null` while the focus is on a button. */
    cursor: { x: number; y: number } | null;
  } {
    const slot = this.padSlot;
    return {
      focus: this.focus,
      info: this.info?.text ?? '',
      cursor: slot ? { x: slot.x, y: slot.y } : null,
    };
  }

  init(data: unknown): void {
    this.payload = isResultPayload(data) ? data : null;
    // Phaser keeps the last `start(key, data)` payload in settings.data and
    // replays it when the scene is later started with no data. Clear it so
    // a payload-less start is seen as missing every time, not just the first.
    this.scene.settings.data = {};
  }

  create(): void {
    this.leaving = false;
    this.placed = null;
    this.focus = null;
    this.padSlot = null;
    this.info = null;
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
    this.drawInfo();
    // Icon art as the pause screen draws it (CO-179), or its lettered tile without the art.
    const rows = [
      this.drawSpells(view.spells),
      ...this.drawTiles(
        'Passives',
        view.passives,
        RESULT_LAYOUT.passives,
        PASSIVE_COLOR,
        (scene, x, y, tile) =>
          addBuildIcon(scene, x, y, tile, PASSIVE_COLOR) ?? addPassiveTile(scene, x, y, tile),
      ),
      ...this.drawTiles(
        'Relics',
        view.relics,
        RESULT_LAYOUT.relics,
        RELIC_COLOR,
        (scene, x, y, tile) =>
          addBuildIcon(scene, x, y, tile, RELIC_COLOR) ?? addRelicGem(scene, x, y, tile),
      ),
    ].filter((row) => row.length > 0);
    const { button, menuButton } = RESULT_LAYOUT;
    const playAgain = this.drawButton(button, 'Play again', () => this.playAgain());
    const mainMenu = this.drawButton(menuButton, 'Main menu', () => this.mainMenu('ui.confirm'));
    const hint = this.add
      .text(width / 2, RESULT_LAYOUT.hintY, HINT, {
        fontFamily: SERIF,
        fontSize: '14px',
        color: '#888888',
      })
      .setOrigin(0.5);
    this.placed = { button: playAgain.box, menuButton: mainMenu.box, hint: boxOf(hint) };
    this.attachFocus([playAgain.item, mainMenu.item], rows);
    // Esc and pad B go back to the main menu, as back does on the other menu screens (CO-218).
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.repeat) this.mainMenu('ui.back');
    });
    attachPadButtons(this, { B: () => this.mainMenu('ui.back') });
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

  /** The info line under the strips: the hint, or the pointed-at or selected item. */
  private drawInfo(): void {
    const { info } = RESULT_LAYOUT;
    this.info = this.add
      .text(info.x + info.width / 2, info.y, INFO_HINT, {
        fontFamily: SERIF,
        fontSize: '14px',
        color: '#888888',
        align: 'center',
        wordWrap: { width: info.width },
      })
      .setOrigin(0.5, 0);
    this.placeInfo();
  }

  /** The info line: the pointed-at slot, else the pad's, else the hint. */
  private showInfo(pointed: BuildSlot | null): void {
    const { text, color } = infoLook(pointed ?? this.padSlot);
    this.info?.setText(text).setColor(color);
    this.placeInfo();
  }

  /**
   * Centres the info line in its box; a line taller than the box hangs from
   * its top instead, so it never rises into the strips.
   */
  private placeInfo(): void {
    const { info } = RESULT_LAYOUT;
    if (!this.info) return;
    this.info.setY(info.y + Math.max(0, (info.height - this.info.height) / 2));
  }

  /**
   * The spells' icons with their names beside them; a crowded strip drops the
   * names. Returns the icons as one row.
   */
  private drawSpells(spells: ResultView['spells']): BuildSlot[] {
    const strip = RESULT_LAYOUT.spells;
    drawStrip(this, strip.x, strip.y, strip.width, strip.height, 'Spells');
    const { xs, y, named } = spellSlots(spells.length);
    return spells.map((spell, i) => {
      const x = xs[i] ?? 0;
      const slot = addInspectable(
        this,
        () => addSpellDisc(this, x, y, spell),
        {
          x,
          y,
          size: SPELL_ICON_SIZE + 6,
          info: itemInfo(spell),
          rim: offerColor('active', spell.id),
          restWidth: 2,
        },
        (s) => this.showInfo(s),
      );
      if (named) {
        this.add
          .text(x + NAME_INSET, y, spell.name, {
            fontFamily: SERIF,
            fontSize: '14px',
            color: '#dddddd',
            wordWrap: { width: SPELL_PITCH - NAME_INSET - SPELL_ICON_SIZE / 2 - 12 },
          })
          .setOrigin(0, 0.5);
      }
      return slot;
    });
  }

  /**
   * A strip of tiles in fixed rows; a build too big for them ends on "+N".
   * Returns the tiles row by row (the "+N" marker is not one).
   */
  private drawTiles(
    label: string,
    tiles: readonly PauseItem[],
    strip: Box,
    rim: number,
    face: (scene: Phaser.Scene, x: number, y: number, tile: PauseItem) => Phaser.GameObjects.Shape,
  ): BuildSlot[][] {
    drawStrip(this, strip.x, strip.y, strip.width, strip.height, label);
    if (tiles.length === 0) {
      this.add.text(strip.x + RESULT_LAYOUT.contentInset, strip.y + 12, RESULT_EMPTY_TEXT, {
        fontFamily: SERIF,
        fontSize: '14px',
        color: '#777777',
      });
      return [];
    }
    const { slots, overflow } = tileGrid(tiles.length, strip);
    const perRow = tilesPerRow(strip);
    const rows: BuildSlot[][] = [];
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
      } else if (tile) {
        const slot = addInspectable(
          this,
          () => face(this, x, y, tile),
          { x, y, size: TILE + 4, info: itemInfo(tile), rim },
          (s) => this.showInfo(s),
        );
        (rows[Math.floor(i / perRow)] ??= []).push(slot);
      }
    });
    return rows;
  }

  /**
   * CO-198: the pad and the arrows walk the buttons and the strips as one
   * layout (`core/resultNav.ts`). Nothing is lit until the first press, which
   * wakes the highlight on "Play again"; Enter with nothing lit starts a new
   * run at once, as before. A or Enter confirms on a button and does nothing
   * on a strip item.
   */
  private attachFocus(items: readonly MenuItem[], rows: readonly BuildSlot[][]): void {
    const { button, menuButton } = RESULT_LAYOUT;
    const layout = {
      buildRows: rows.map((row) => row.map((s) => s.x)),
      buttonXs: [button, menuButton].map((box) => box.x + box.width / 2),
    };
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
          focusOn(stepResultFocus(this.focus, dir, layout));
          return;
        }
        if (!pressed.confirm) return;
        const focus = this.focus;
        if (focus?.zone === 'menu') items[focus.index]?.confirm();
        else if (focus === null && source === 'keyboard') items[0]?.confirm();
        else if (focus === null) focusOn(stepResultFocus(null, 'down', layout));
      },
      { keyboard: true },
    );
  }

  /**
   * A result button as the pause screen's Yes / No buttons look: a wine bar
   * that lights up, with a crimson edge and a ▶ marker, under a pointer or
   * once a pad has woken the highlight on it.
   */
  private drawButton(box: Box, text: string, act: () => void): { item: MenuItem; box: Box } {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // The bar is the click target, so it fades by its fill: Phaser never
    // hit-tests an object at alpha 0.
    const bar = this.add.rectangle(cx, cy, box.width, box.height, WINE, BUTTON_REST_ALPHA);
    const edge = this.add.rectangle(box.x + 1.5, cy, 3, box.height, CRIMSON).setAlpha(0);
    const label = this.add
      .text(cx, cy, text, { fontFamily: SERIF, fontSize: '20px', color: BUTTON_REST_TEXT })
      .setOrigin(0.5);
    const marker = this.add
      .text(cx - label.width / 2 - 20, cy, '▶', {
        fontFamily: SERIF,
        fontSize: '14px',
        color: CRIMSON_CSS,
      })
      .setOrigin(0, 0.5)
      .setAlpha(0);

    // The pointer lights the bar; a pad's focus also draws the shared ring (CO-196).
    const focus = focusable(this, box, ({ raised }) => {
      bar.setFillStyle(WINE, raised ? 1 : BUTTON_REST_ALPHA);
      edge.setAlpha(raised ? 1 : 0);
      marker.setAlpha(raised ? 1 : 0);
      label.setColor(raised ? '#ffffff' : BUTTON_REST_TEXT);
    });
    bar.setInteractive({ useHandCursor: true });
    bar.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      focus.setHovered(true);
      audioOf(this).play('ui.move');
    });
    bar.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => focus.setHovered(false));
    bar.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, act);

    // Pad A lights the button on its first press and confirms it on the next.
    return { item: { setSelected: focus.setFocused, confirm: act }, box: boxOf(bar) };
  }

  /** Idempotent: a click and Enter in the same frame start exactly one SpellSelect. */
  private playAgain(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.spellSelect);
  }

  /** The main menu, guarded with `playAgain` so a click and Esc together leave exactly once. */
  private mainMenu(sound: 'ui.confirm' | 'ui.back'): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play(sound);
    this.scene.start(SCENE.intro);
  }
}

function boxOf(o: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text): Box {
  const b = o.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}
