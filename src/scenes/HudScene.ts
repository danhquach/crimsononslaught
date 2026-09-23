import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { CURRENCY_NAME } from '../config/meta';
import {
  INITIAL_HUD,
  applyRunEvent,
  bossBarVisible,
  formatTimer,
  fraction,
  passiveLines,
  shieldBarVisible,
  slotLabel,
  slotRows,
  type HudModel,
  type SlotRow,
} from '../core/hudModel';
import { onRunEvents, type RunEvent } from '../core/runEvents';
import { SCENE } from '../core/scenePayloads';

const MARGIN = 16;
const BAR_WIDTH = 240;
const BAR_BG = 0x222222;
const HP_COLOR = 0xdc143c;
const SHIELD_COLOR = PLACEHOLDERS.shield_ice.color;
const XP_COLOR = PLACEHOLDERS.gem.color;
const BOSS_COLOR = PLACEHOLDERS.boss.color;
/** The Embers count in the Ember pickup's own amber, so the two read as one thing (#195). */
const EMBERS_COLOR = `#${PLACEHOLDERS.pickup_ember.color.toString(16).padStart(6, '0')}`;
/**
 * The outline keeps a label legible over a full arena (#144): nothing sits
 * behind HUD text, so without it a label crossing the gems or the crowd breaks up.
 */
const LABEL_STYLE = {
  fontFamily: 'monospace',
  fontSize: '14px',
  color: '#eeeeee',
  stroke: '#000000',
  strokeThickness: 3,
} as const;
const SLOT_ROW_HEIGHT = 20;
const SLOT_SWATCH = 12;
const SLOT_BAR_WIDTH = 100;
/** An empty slot's swatch and bar: no spell, so no colour of its own. */
const SLOT_EMPTY_COLOR = 0x555555;

/** Background + fill + label; `set` drives the fill by fraction so callers never touch pixels. */
class Bar {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
  ) {
    this.bg = scene.add
      .rectangle(x, y, width, height, BAR_BG)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x555555);
    this.fill = scene.add.rectangle(x, y, width, height, color).setOrigin(0, 0);
    this.label = scene.add.text(x + width + 8, y + height / 2, '', LABEL_STYLE).setOrigin(0, 0.5);
  }

  setFillColor(color: number): void {
    this.fill.setFillStyle(color);
  }

  setY(y: number): void {
    this.bg.setY(y);
    this.fill.setY(y);
    this.label.setY(y + this.bg.height / 2);
  }

  set(fraction01: number, text: string): void {
    this.fill.setScale(fraction01, 1);
    this.label.setText(text);
  }

  setVisible(visible: boolean): void {
    this.bg.setVisible(visible);
    this.fill.setVisible(visible);
    this.label.setVisible(visible);
  }
}

/**
 * One slot box (#144): the spell's colour, its cooldown filling up beside it,
 * and its name — or, for an empty slot, whether it is open or which level
 * unlocks it. A spell with no cooldown (an orbit, a shield) reads as full.
 */
class SlotBox {
  private readonly swatch: Phaser.GameObjects.Rectangle;
  private readonly bar: Bar;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.swatch = scene.add
      .rectangle(x, y, SLOT_SWATCH, SLOT_SWATCH, SLOT_EMPTY_COLOR)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x555555);
    this.bar = new Bar(scene, x + SLOT_SWATCH + 6, y + 1, SLOT_BAR_WIDTH, 10, SLOT_EMPTY_COLOR);
  }

  setY(y: number): void {
    this.swatch.setY(y);
    this.bar.setY(y + 1);
  }

  set(row: Readonly<SlotRow>): void {
    const color = row.kind === 'spell' ? row.color : SLOT_EMPTY_COLOR;
    this.swatch.setFillStyle(color);
    this.bar.setFillColor(color);
    const progress = row.kind === 'spell' ? (row.progress ?? 1) : 0;
    this.bar.set(progress, slotLabel(row));
  }
}

/**
 * HUD overlay: timer, HP bar, shield bar, XP bar + level, kill count, boss HP
 * bar, the loadout's slot boxes and the passives held.
 *
 * The shield bar (#134) sits under HP and is drawn only while the run has a
 * shield equipped, so a run without one reads exactly as it did before. The
 * slot boxes (#144) stack in the bottom-left corner, one per spell casting and
 * one per slot still empty; the passives list runs down the right edge under
 * the kill count. Both stay in the margins so the arena centre is clear.
 *
 * Runs as a parallel scene launched by Game, so it keeps rendering while Game
 * is paused (level-up overlay). It is driven purely by `RunEvent`s on the Game
 * scene's emitter (see `core/runEvents.ts`); it never reads GameScene fields.
 */
export class HudScene extends Phaser.Scene {
  private model: HudModel = INITIAL_HUD;
  private timerText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private embersText!: Phaser.GameObjects.Text;
  private hpBar!: Bar;
  private shieldBar!: Bar;
  private xpBar!: Bar;
  private bossBar!: Bar;
  private slotBoxes: SlotBox[] = [];
  private passivesText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE.hud);
  }

  /** What the HUD currently shows, read-only; the browser smoke suite (CO-060) asserts on it. */
  get view(): Readonly<HudModel> {
    return this.model;
  }

  create(): void {
    this.model = INITIAL_HUD;
    const { width } = this.scale;

    this.hpBar = new Bar(this, MARGIN, MARGIN, BAR_WIDTH, 18, HP_COLOR);
    this.shieldBar = new Bar(this, MARGIN, MARGIN + 22, BAR_WIDTH, 8, SHIELD_COLOR);
    this.xpBar = new Bar(this, MARGIN, MARGIN + 34, BAR_WIDTH, 10, XP_COLOR);
    this.timerText = this.add
      .text(width / 2, MARGIN - 4, '', { ...LABEL_STYLE, fontSize: '28px' })
      .setOrigin(0.5, 0);
    this.killsText = this.add.text(width - MARGIN, MARGIN, '', LABEL_STYLE).setOrigin(1, 0);
    this.embersText = this.add
      .text(width - MARGIN, MARGIN + 20, '', { ...LABEL_STYLE, color: EMBERS_COLOR })
      .setOrigin(1, 0);
    this.bossBar = new Bar(this, width / 2 - 200, 56, 400, 14, BOSS_COLOR);
    this.slotBoxes = [];
    this.passivesText = this.add
      .text(width - MARGIN, MARGIN + 44, '', { ...LABEL_STYLE, align: 'right' })
      .setOrigin(1, 0);
    this.render();

    this.subscribe();
  }

  /** Listen to every run event on the Game emitter; detach on our own shutdown. */
  private subscribe(): void {
    const unsubscribe = onRunEvents(this.scene.get(SCENE.game).events, (e) => this.apply(e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private apply(event: RunEvent): void {
    this.model = applyRunEvent(this.model, event);
    this.render();
  }

  private render(): void {
    const m = this.model;
    this.timerText.setText(formatTimer(m.elapsedMs));
    this.hpBar.set(fraction(m.hp, m.maxHp), `HP ${Math.ceil(m.hp)} / ${m.maxHp}`);
    this.shieldBar.setVisible(shieldBarVisible(m));
    this.shieldBar.set(fraction(m.shield, m.shieldMax), `Shield ${Math.ceil(m.shield)}`);
    this.xpBar.set(fraction(m.xp, m.xpToNext), `Lv ${m.level}`);
    this.killsText.setText(`Kills ${m.kills}`);
    this.embersText.setText(`${CURRENCY_NAME} ${m.embers}`);
    this.bossBar.setVisible(bossBarVisible(m));
    this.bossBar.set(fraction(m.bossHp, m.bossMaxHp), 'Boss');
    this.renderSlots(slotRows(m));
    this.passivesText.setText(passiveLines(m).join('\n'));
  }

  /**
   * Bottom-anchored, so the last box sits on the bottom margin however many
   * there are; a box is added the first time a row needs one and never removed.
   */
  private renderSlots(rows: readonly SlotRow[]): void {
    const grew = rows.length > this.slotBoxes.length;
    while (this.slotBoxes.length < rows.length) {
      this.slotBoxes.push(new SlotBox(this, MARGIN, 0));
    }
    if (grew) {
      const bottom = this.scale.height - MARGIN;
      this.slotBoxes.forEach((box, index) =>
        box.setY(bottom - (this.slotBoxes.length - index) * SLOT_ROW_HEIGHT),
      );
    }
    rows.forEach((row, index) => this.slotBoxes[index]?.set(row));
  }
}
