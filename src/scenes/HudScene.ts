import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { FRAMES, type FrameName } from '../config/frames';
import { CURRENCY_NAME } from '../config/meta';
import { artFrame } from '../core/animation';
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
import { hasIconArt } from '../render/spellIcon';

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
/**
 * CO-154: the icon art's disc, drawn inside the ring so the ring (brighter when
 * ready) still shows round it. The silhouette sits in the middle ~23 px, clear
 * of the badge, whose nearest point is 15·√2 − 8 ≈ 13 px from the centre.
 */
const SLOT_ICON_SIZE = 32;
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
 * The sweep is quantised to this many steps per turn and each step baked once
 * into its own small texture (#213), so a cooling icon costs one quad a frame
 * rather than a Graphics path rebuilt every frame — the arena's fps floors are
 * tight on a slow runner. Six degrees a step is under two pixels of rim.
 */
const SLOT_WEDGE_STEPS = 60;
const SLOT_LOCKED_KEY = 'hud_slot_locked';

function wedgeKey(step: number): string {
  return `hud_slot_wedge_${step}`;
}

/** Bake the wedge steps and the locked ring once per game; a restarted HUD reuses them. */
function ensureSlotTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(SLOT_LOCKED_KEY)) return;
  const size = SLOT_RADIUS * 2 + 4;
  const c = size / 2;
  const g = scene.make.graphics({}, false);
  for (let step = 1; step <= SLOT_WEDGE_STEPS; step++) {
    // The clear part grows clockwise from 12 o'clock; the wedge is the rest.
    const start = -Math.PI / 2 + (1 - step / SLOT_WEDGE_STEPS) * Math.PI * 2;
    g.clear().fillStyle(0x000000, 1);
    if (step === SLOT_WEDGE_STEPS) g.fillCircle(c, c, SLOT_RADIUS);
    else g.slice(c, c, SLOT_RADIUS, start, Math.PI * 1.5, false).fillPath();
    g.generateTexture(wedgeKey(step), size, size);
  }
  // Locked: a dashed ring and a padlock.
  g.clear().lineStyle(2, SLOT_EMPTY_COLOR, 1);
  const dashes = 12;
  for (let i = 0; i < dashes; i++) {
    const a = (i / dashes) * Math.PI * 2;
    g.beginPath()
      .arc(c, c, SLOT_RADIUS, a, a + Math.PI / dashes)
      .strokePath();
  }
  g.fillStyle(0x888888, 1)
    .fillRect(c - 6, c - 1, 12, 9)
    .lineStyle(2, 0x888888, 1)
    .beginPath()
    .arc(c, c - 1, 4, Math.PI, 0)
    .strokePath();
  g.generateTexture(SLOT_LOCKED_KEY, size, size);
  g.destroy();
}

/**
 * One slot icon (#213): the spell's icon art in a circle (CO-154) — or, with no
 * art for it or no atlas, its colour and its initials — with the cooldown still
 * to run drawn as a dark wedge that shrinks clockwise from 12 o'clock, the whole
 * seconds left in a badge on the rim, and a short name underneath. Ready brightens the ring. An
 * open slot is an empty circle; a locked one is dashed, with a lock and the
 * level that opens it. Every part is a shape or an image whose properties
 * change; nothing is redrawn.
 */
class SlotIcon {
  private readonly disc: Phaser.GameObjects.Arc;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly wedge: Phaser.GameObjects.Image;
  private readonly locked: Phaser.GameObjects.Image;
  private readonly glyph: Phaser.GameObjects.Text;
  private readonly badgeDisc: Phaser.GameObjects.Arc;
  private readonly badge: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    ensureSlotTextures(scene);
    this.disc = scene.add.circle(0, 0, SLOT_RADIUS, 0x000000);
    // Under the wedge, so a cooling spell's art darkens like the disc does.
    this.icon = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    // Under the glyph: it darkens the disc but not the glyph, so the icon stays readable.
    this.wedge = scene.add.image(0, 0, wedgeKey(1)).setAlpha(SLOT_WEDGE_ALPHA);
    this.locked = scene.add.image(0, 0, SLOT_LOCKED_KEY);
    this.glyph = scene.add.text(0, 0, '', SLOT_GLYPH_STYLE).setOrigin(0.5);
    this.badgeDisc = scene.add
      .circle(0, 0, SLOT_BADGE_RADIUS, 0x111111)
      .setStrokeStyle(1, 0xaaaaaa);
    this.badge = scene.add.text(0, 0, '', SLOT_BADGE_STYLE).setOrigin(0.5);
    this.label = scene.add.text(0, 0, '', SLOT_LABEL_STYLE).setOrigin(0.5, 0);
  }

  /** Centre of the circle. */
  setPosition(x: number, y: number): void {
    this.disc.setPosition(x, y);
    this.icon.setPosition(x, y);
    this.wedge.setPosition(x, y);
    this.locked.setPosition(x, y);
    this.glyph.setPosition(x, y);
    this.badgeDisc.setPosition(x + SLOT_BADGE_OFFSET, y + SLOT_BADGE_OFFSET);
    this.badge.setPosition(x + SLOT_BADGE_OFFSET, y + SLOT_BADGE_OFFSET);
    this.label.setPosition(x, y + SLOT_RADIUS + 3);
  }

  set(row: Readonly<SlotRow>): void {
    const spell = row.kind === 'spell' ? row : null;
    const art = spell?.icon && hasIconArt(this.icon.scene, spell.icon) ? spell.icon : null;
    this.showIcon(art);
    this.label.setText(slotLabel(row));
    this.glyph.setText(art ? '' : (spell?.glyph ?? ''));
    this.badge.setText(spell?.badge ?? '');
    this.badgeDisc.setVisible(spell?.badge != null);
    this.locked.setVisible(row.kind === 'locked');

    // Any time still to run shows at least one step, so a spell reads ready only when it is.
    const step = spell ? Math.ceil(spell.waiting * SLOT_WEDGE_STEPS) : 0;
    this.wedge.setVisible(step > 0);
    if (step > 0) this.wedge.setTexture(wedgeKey(step));

    if (spell) {
      // Behind art the disc is only a dark backing; the art carries the colour.
      this.disc.setFillStyle(art ? 0x000000 : spell.color, 1);
      this.disc.setStrokeStyle(spell.ready ? 3 : 2, spell.ready ? 0xffffff : 0x777777);
    } else {
      this.disc.setFillStyle(0x000000, 0.35);
      // A locked slot's ring is the dashed one in its texture.
      if (row.kind === 'open') this.disc.setStrokeStyle(2, SLOT_EMPTY_COLOR);
      else this.disc.setStrokeStyle();
    }
  }

  /** Point the icon at `frame`'s art box, or hide it; unchanged frames are left alone. */
  private showIcon(frame: FrameName | null): void {
    this.icon.setVisible(frame !== null);
    if (!frame || this.icon.frame.name === artFrame(frame)) return;
    this.icon.setTexture(FRAMES[frame].page, artFrame(frame));
    this.icon.setScale(SLOT_ICON_SIZE / Math.max(this.icon.width, this.icon.height));
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
