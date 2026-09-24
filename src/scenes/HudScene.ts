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
/** #213: slot icons, left to right along the bottom, wrapping upward past `SLOT_PER_ROW`. */
const SLOT_RADIUS = 18;
/** Wide enough for a `SLOT_LABEL_MAX` label at `SLOT_LABEL_STYLE`'s size. */
const SLOT_PITCH_X = 72;
const SLOT_PITCH_Y = 62;
const SLOT_PER_ROW = 6;
const SLOT_EMPTY_COLOR = 0x555555;
const SLOT_WEDGE_ALPHA = 0.65;
const SLOT_BADGE_RADIUS = 8;
/**
 * The badge straddles the rim at bottom-right, pushed a little outside it so
 * its nearest point to the icon's centre stays clear of the glyph's box.
 */
const SLOT_BADGE_OFFSET = 15;
const SLOT_LABEL_STYLE = { ...LABEL_STYLE, fontSize: '11px', strokeThickness: 3 } as const;
const SLOT_GLYPH_STYLE = { ...LABEL_STYLE, fontSize: '13px', strokeThickness: 2 } as const;
const SLOT_BADGE_STYLE = { ...LABEL_STYLE, fontSize: '10px', strokeThickness: 0 } as const;

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
 * One slot icon (#213): the spell's icon in a circle — until icon art exists,
 * its colour and its initials — with the cooldown still to run drawn as a dark
 * wedge that shrinks clockwise from 12 o'clock, the whole seconds left in a
 * badge on the rim, and a short name underneath. Ready brightens the ring. An
 * open slot is an empty circle; a locked one is dashed, with a lock and the
 * level that opens it.
 */
class SlotIcon {
  private readonly disc: Phaser.GameObjects.Graphics;
  private readonly glyph: Phaser.GameObjects.Text;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly badge: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;
  private x = 0;
  private y = 0;
  /** What was last drawn, so a slot that has not changed is not redrawn every frame. */
  private drawn = '';

  constructor(scene: Phaser.Scene) {
    this.disc = scene.add.graphics();
    this.glyph = scene.add.text(0, 0, '', SLOT_GLYPH_STYLE).setOrigin(0.5);
    this.overlay = scene.add.graphics();
    this.badge = scene.add.text(0, 0, '', SLOT_BADGE_STYLE).setOrigin(0.5);
    this.label = scene.add.text(0, 0, '', SLOT_LABEL_STYLE).setOrigin(0.5, 0);
  }

  /** Centre of the circle. */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.drawn = '';
    this.glyph.setPosition(x, y);
    this.badge.setPosition(x + SLOT_BADGE_OFFSET, y + SLOT_BADGE_OFFSET);
    this.label.setPosition(x, y + SLOT_RADIUS + 3);
  }

  set(row: Readonly<SlotRow>): void {
    // A sweep step finer than a thousandth of a turn is under a pixel of rim.
    const key =
      row.kind === 'spell'
        ? `${row.name}|${row.color}|${row.ready}|${row.badge}|${Math.round(row.waiting * 1000)}`
        : `${row.kind}|${row.kind === 'locked' ? row.unlockLevel : ''}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const { disc, overlay, x, y } = this;
    disc.clear();
    overlay.clear();
    this.label.setText(slotLabel(row));
    this.glyph.setText(row.kind === 'spell' ? row.glyph : '');
    this.badge.setText(row.kind === 'spell' && row.badge !== null ? row.badge : '');

    if (row.kind === 'spell') {
      disc.fillStyle(row.color, 1).fillCircle(x, y, SLOT_RADIUS);
      if (row.waiting > 0) {
        // The clear part grows clockwise from 12 o'clock; the wedge is the rest.
        // It darkens the disc but not the glyph, so the icon stays readable.
        const start = -Math.PI / 2 + (1 - row.waiting) * Math.PI * 2;
        disc
          .fillStyle(0x000000, SLOT_WEDGE_ALPHA)
          .slice(x, y, SLOT_RADIUS, start, Math.PI * 1.5, false)
          .fillPath();
      }
      overlay
        .lineStyle(row.ready ? 3 : 2, row.ready ? 0xffffff : 0x777777, 1)
        .strokeCircle(x, y, SLOT_RADIUS);
      if (row.badge !== null) {
        overlay
          .fillStyle(0x111111, 1)
          .fillCircle(x + SLOT_BADGE_OFFSET, y + SLOT_BADGE_OFFSET, SLOT_BADGE_RADIUS)
          .lineStyle(1, 0xaaaaaa, 1)
          .strokeCircle(x + SLOT_BADGE_OFFSET, y + SLOT_BADGE_OFFSET, SLOT_BADGE_RADIUS);
      }
      return;
    }
    disc.fillStyle(0x000000, 0.35).fillCircle(x, y, SLOT_RADIUS);
    if (row.kind === 'open') {
      overlay.lineStyle(2, SLOT_EMPTY_COLOR, 1).strokeCircle(x, y, SLOT_RADIUS);
      return;
    }
    // Locked: a dashed ring and a padlock.
    overlay.lineStyle(2, SLOT_EMPTY_COLOR, 1);
    const dashes = 12;
    for (let i = 0; i < dashes; i++) {
      const a = (i / dashes) * Math.PI * 2;
      overlay
        .beginPath()
        .arc(x, y, SLOT_RADIUS, a, a + Math.PI / dashes)
        .strokePath();
    }
    overlay
      .fillStyle(0x888888, 1)
      .fillRect(x - 6, y - 1, 12, 9)
      .lineStyle(2, 0x888888, 1)
      .beginPath()
      .arc(x, y - 1, 4, Math.PI, 0)
      .strokePath();
  }
}

/**
 * HUD overlay: timer, HP bar, shield bar, XP bar + level, kill count, boss HP
 * bar, the loadout's slot icons and the passives held.
 *
 * The shield bar (#134) sits under HP and is drawn only while the run has a
 * shield equipped, so a run without one reads exactly as it did before. The
 * slot icons (#144, #213) run along the bottom-left corner, one per spell
 * casting and one per slot still empty; the passives list runs down the right
 * edge under the kill count. Both stay in the margins so the arena centre is clear.
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
  private slotIcons: SlotIcon[] = [];
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
    this.slotIcons = [];
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
   * Bottom-anchored in the left corner, left to right, a row of
   * `SLOT_PER_ROW` and then the next row up; an icon is added the first time a
   * row needs one and never removed.
   */
  private renderSlots(rows: readonly SlotRow[]): void {
    const grew = rows.length > this.slotIcons.length;
    while (this.slotIcons.length < rows.length) this.slotIcons.push(new SlotIcon(this));
    if (grew) {
      const lines = Math.ceil(this.slotIcons.length / SLOT_PER_ROW);
      // The bottom line's labels sit on the bottom margin.
      const bottomY = this.scale.height - MARGIN - 14 - SLOT_RADIUS - 3;
      this.slotIcons.forEach((icon, index) => {
        const line = Math.floor(index / SLOT_PER_ROW);
        icon.setPosition(
          MARGIN + SLOT_PITCH_X / 2 + (index % SLOT_PER_ROW) * SLOT_PITCH_X,
          bottomY - (lines - 1 - line) * SLOT_PITCH_Y,
        );
      });
    }
    rows.forEach((row, index) => this.slotIcons[index]?.set(row));
  }
}
