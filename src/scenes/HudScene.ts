import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { ART_BOXES, FRAMES, type FrameName } from '../config/frames';
import { BAR_ART, type BarArt } from '../config/hud';
import { artFrame } from '../core/animation';
import {
  cornerCounts,
  passiveTileLayout,
  risenPassives,
  samePassives,
  type HudPassiveTile,
} from '../core/hudCorner';
import {
  INITIAL_HUD,
  applyRunEvent,
  bossBarVisible,
  formatTimer,
  fraction,
  shieldBarVisible,
  slotLabel,
  slotRows,
  type HudModel,
  type SlotRow,
} from '../core/hudModel';
import { MAX_BADGE_TEXT_CSS, MAX_RANK_CSS } from '../core/maxRank';
import { PASSIVE_COLOR } from '../core/offerColors';
import { onRunEvents, type LoadoutPassiveView, type RunEvent } from '../core/runEvents';
import { SCENE } from '../core/scenePayloads';
import { hasFrameArt } from '../render/atlas';
import { barSlices } from '../render/barFrame';
import { SPELL_ICON_ART_SIZE, spellIconArt } from '../render/spellIcon';
import { CRIMSON_CSS, addBuildIcon, addPassiveTile } from './buildStrips';

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
const SLOT_ICON_SIZE = SPELL_ICON_ART_SIZE;
const SLOT_WEDGE_ALPHA = 0.65;
const SLOT_BADGE_RADIUS = 8;
/**
 * The badge straddles the rim at bottom-right, pushed a little outside it so
 * its nearest point to the icon's centre stays clear of the glyph's box.
 */
const SLOT_BADGE_OFFSET = 15;
/**
 * #326: the spell's level on a pill at the rim's top right, the mirror of the
 * cooldown badge, so the two never meet. At the top level it reads MAX on the
 * same gold as a maxed passive's badge (#324). A slot's pitch (72 across, 62
 * up) leaves room for the ~26 px MAX pill beside the next icon and the row
 * above's label.
 */
const SLOT_LEVEL_OFFSET = 15;
const SLOT_LEVEL_STYLE = {
  fontFamily: 'monospace',
  fontSize: '10px',
  fontStyle: 'bold',
  padding: { x: 4, y: 1 },
} as const;
const SLOT_LABEL_STYLE = { ...LABEL_STYLE, fontSize: '11px', strokeThickness: 3 } as const;
const SLOT_GLYPH_STYLE = { ...LABEL_STYLE, fontSize: '13px', strokeThickness: 2 } as const;
const SLOT_BADGE_STYLE = { ...LABEL_STYLE, fontSize: '10px', strokeThickness: 0 } as const;
/**
 * CO-156: the framed bars' layout. The top-left frames are indented so the
 * widest mark, the heart, hangs off their left end inside the margin, and are
 * narrower than the flat bars by that indent so every label keeps its place.
 * Each row clears the marks above it. The boss bar sits under the whole stack,
 * so the shield and XP labels never run into it.
 */
const FRAMED_X = MARGIN + 24;
const FRAMED_WIDTH = BAR_WIDTH - 24;
const FRAMED_SHIELD_Y = MARGIN + 31;
const FRAMED_XP_Y = MARGIN + 54;
const FRAMED_BOSS_Y = 96;
const BOSS_WIDTH = 400;
/**
 * CO-193: the top-right corner. With the atlas, Kills and Embers sit on a plate
 * — the boss bar's frame at `CORNER_PLATE_WIDTH`, its skull mark hanging off
 * the left end for Kills and the Ember pickup's own art beside the Embers
 * count — with the passive tiles in a block under it. `CORNER_TILES_LEFT` is
 * the first tile's centre: four tiles across at the tile pitch, the last one
 * centred on x = 922 so its MAX badge ends near 949, 11 px inside the right
 * edge. The whole block stays right of x = 736 with the largest build, clear
 * of the arena centre and of the boss bar's label, which ends near 724.
 */
const CORNER_PLATE_X = 788;
const CORNER_PLATE_WIDTH = 156;
const CORNER_KILLS_X = 802;
const CORNER_EMBER_ICON_X = 866;
const CORNER_EMBER_ICON_Y = 18;
const CORNER_EMBERS_X = 881;
/** The counts' centre line: the middle of the plate's trough. */
const CORNER_COUNT_Y = 30;
const CORNER_TILES_LEFT = 778;
const CORNER_TILES_TOP = 72;
/** Without the atlas the two text lines are all that is above the tiles. */
const CORNER_FLAT_TILES_TOP = 80;
/** A picked or ranked-up tile is ringed by a white pulse this long, then it is gone. */
const TILE_FLASH_RADIUS = 20;
const TILE_FLASH_MS = 250;
/** How far toward white the glint row along the top of a framed fill is, 0 to 1. */
const FILL_GLINT = 0.4;

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
 * CO-156: a bar in its pixel-art frame. Draw order: the dark trough, the fill
 * sized to it, then the frame, whose hollow inside is clear so the fill shows
 * through, then the end mark and the label. The caps are drawn at native size
 * and only the plain middle is tiled to `width`, so neither end ever stretches.
 * `set` and `setVisible` behave as `Bar`'s do, so `render` drives both alike.
 *
 * `x`, `y` and `width` are the frame's art box on screen. The mark hangs off
 * the left end, its right edge on the trough's left, so it never covers the
 * fill; it is centred on the trough's height.
 */
class FramedBar {
  private readonly parts: (Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject)[];
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly glint: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  /** The frame's pieces and its mark: what shows of the bar with an empty fill. */
  readonly solid: readonly Phaser.GameObjects.GameObject[];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    art: BarArt,
    color: number,
  ) {
    const box = artBox(art.frame);
    const { left, top, right, bottom } = art.trough;
    const troughX = x + left;
    const troughY = y + top;
    const troughW = width - left - right;
    const troughH = box.h - top - bottom;
    const bg = scene.add.rectangle(troughX, troughY, troughW, troughH, BAR_BG).setOrigin(0, 0);
    this.fill = scene.add.rectangle(troughX, troughY, troughW, troughH, color).setOrigin(0, 0);
    // The concept's glass tube: one lighter row along the top of what is filled.
    this.glint = scene.add
      .rectangle(troughX, troughY, troughW, 1, towardWhite(color, FILL_GLINT))
      .setOrigin(0, 0);

    const slices = barSlices(scene, art);
    const middleW = width - art.capLeft - art.capRight;
    const frame = [
      scene.add.image(x, y, slices.page, slices.left),
      scene.add.tileSprite(x + art.capLeft, y, middleW, box.h, slices.page, slices.middle),
      scene.add.image(x + width - art.capRight, y, slices.page, slices.right),
    ].map((piece) => piece.setOrigin(0, 0));

    const markBox = artBox(art.mark);
    const mark = scene.add
      .image(
        troughX - markBox.w,
        troughY + Math.round((troughH - markBox.h) / 2),
        FRAMES[art.mark].page,
        artFrame(art.mark),
      )
      .setOrigin(0, 0);

    this.label = scene.add.text(x + width + 8, y + box.h / 2, '', LABEL_STYLE).setOrigin(0, 0.5);
    this.parts = [bg, this.fill, this.glint, ...frame, mark, this.label];
    this.solid = [...frame, mark];
  }

  set(fraction01: number, text: string): void {
    this.fill.setScale(fraction01, 1);
    this.glint.setScale(fraction01, 1);
    this.label.setText(text);
  }

  setVisible(visible: boolean): void {
    for (const part of this.parts) part.setVisible(visible);
  }
}

/** `color` mixed `amount` of the way toward white, channel by channel. */
function towardWhite(color: number, amount: number): number {
  const channel = (shift: number): number => {
    const c = (color >> shift) & 0xff;
    return Math.round(c + (255 - c) * amount) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/** The art box of `frame`'s clip: where its art sits inside the frame's clear margin. */
function artBox(frame: FrameName): Readonly<{ w: number; h: number }> {
  return ART_BOXES[frame.slice(0, frame.lastIndexOf('.')) as keyof typeof ART_BOXES];
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
 * seconds left in a badge on the rim, the spell's level (#326) on a pill opposite it,
 * and a short name underneath. Ready brightens the ring. An
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
  private readonly levelPill: Phaser.GameObjects.Graphics;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;
  private x = 0;
  private y = 0;
  /** What the level pill was last drawn for, so a redraw waits for a change. */
  private pillKey = '';

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
    this.levelPill = scene.add.graphics();
    this.levelText = scene.add.text(0, 0, '', SLOT_LEVEL_STYLE).setOrigin(0.5).setVisible(false);
    this.label = scene.add.text(0, 0, '', SLOT_LABEL_STYLE).setOrigin(0.5, 0);
  }

  /** Centre of the circle. */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.disc.setPosition(x, y);
    this.icon.setPosition(x, y);
    this.wedge.setPosition(x, y);
    this.locked.setPosition(x, y);
    this.glyph.setPosition(x, y);
    this.badgeDisc.setPosition(x + SLOT_BADGE_OFFSET, y + SLOT_BADGE_OFFSET);
    this.badge.setPosition(x + SLOT_BADGE_OFFSET, y + SLOT_BADGE_OFFSET);
    this.label.setPosition(x, y + SLOT_RADIUS + 3);
    this.levelText.setPosition(x + SLOT_LEVEL_OFFSET, y - SLOT_LEVEL_OFFSET);
    this.drawLevelPill();
  }

  /** The level pill as drawn now, or `null` on a slot with no spell: what the browser suite reads. */
  get levelBadge(): { text: string; fill: string } | null {
    if (!this.levelText.visible) return null;
    return { text: this.levelText.text, fill: String(this.levelText.getData('badgeFill')) };
  }

  set(row: Readonly<SlotRow>): void {
    const spell = row.kind === 'spell' ? row : null;
    const art = spell ? spellIconArt(this.icon.scene, spell.id) : null;
    this.showIcon(art);
    this.label.setText(slotLabel(row));
    this.glyph.setText(art ? '' : (spell?.glyph ?? ''));
    this.badge.setText(spell?.badge ?? '');
    this.badgeDisc.setVisible(spell?.badge != null);
    this.locked.setVisible(row.kind === 'locked');
    this.setLevel(spell);

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

  /** Show the spell's level on its pill, redrawing the pill only when the badge changes (#326). */
  private setLevel(spell: Extract<SlotRow, { kind: 'spell' }> | null): void {
    this.levelText.setVisible(spell !== null);
    if (!spell) {
      this.levelPill.clear();
      this.pillKey = '';
      return;
    }
    const fill = spell.maxed ? MAX_RANK_CSS : CRIMSON_CSS;
    // `set` runs every frame and `setColor` re-renders the text's texture even
    // when the colour is the same, so only a change reaches it.
    if (this.levelText.getData('badgeFill') !== fill) {
      this.levelText
        .setColor(spell.maxed ? MAX_BADGE_TEXT_CSS : '#ffffff')
        .setData('badgeFill', fill);
    }
    this.levelText.setText(spell.levelBadge);
    this.drawLevelPill();
  }

  /** The pill under the level text, sized to its padded box; skipped while nothing about it changed. */
  private drawLevelPill(): void {
    if (!this.levelText.visible) return;
    const fill = String(this.levelText.getData('badgeFill'));
    const key = `${this.levelText.text}|${fill}|${this.x}|${this.y}`;
    if (key === this.pillKey) return;
    this.pillKey = key;
    const { width, height } = this.levelText;
    this.levelPill
      .clear()
      .fillStyle(Phaser.Display.Color.HexStringToColor(fill).color)
      .fillRoundedRect(
        this.x + SLOT_LEVEL_OFFSET - width / 2,
        this.y - SLOT_LEVEL_OFFSET - height / 2,
        width,
        height,
        height / 2,
      );
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
 * HUD overlay: timer, HP bar, shield bar, XP bar + level, kill and Ember
 * counts, boss HP bar, the loadout's slot icons and the passives held.
 *
 * The shield bar (#134) sits under HP and is drawn only while the run has a
 * shield equipped, so a run without one reads exactly as it did before. The
 * slot icons (#144, #213) run along the bottom-left corner, one per spell
 * casting and one per slot still empty. The top-right corner (CO-193) is a
 * plate with the Kills and Embers counts and, under it, one tile per passive
 * held with its rank on a badge, wrapping four across. Both corners stay in
 * the margins so the arena centre is clear.
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
  private hpBar!: Bar | FramedBar;
  private shieldBar!: Bar | FramedBar;
  private xpBar!: Bar | FramedBar;
  private bossBar!: Bar | FramedBar;
  private look: 'art' | 'flat' = 'flat';
  private slotIcons: SlotIcon[] = [];
  /** CO-193: whether the corner wears its art (the plate and icons) or is plain text. */
  private iconed = false;
  /** The corner's fixed pieces; the tiles come and go in `passiveParts`. */
  private cornerParts: Phaser.GameObjects.GameObject[] = [];
  private cornerPlate: FramedBar | null = null;
  private passiveParts: Phaser.GameObjects.GameObject[] = [];
  private shownPassives: readonly LoadoutPassiveView[] = [];
  private shownTiles: readonly HudPassiveTile[] = [];

  constructor() {
    super(SCENE.hud);
  }

  /** What the HUD currently shows, read-only; the browser smoke suite (CO-060) asserts on it. */
  get view(): Readonly<HudModel> {
    return this.model;
  }

  /**
   * Whether the bars are drawn in their pixel-art frames (CO-156) or, with no
   * atlas, as the flat placeholder bars; read by the browser suite.
   */
  get barLook(): 'art' | 'flat' {
    return this.look;
  }

  /**
   * Test hook (#326): the level pill on every slot casting a spell, in slot
   * order — the level, whether it is the top one, the text on the pill and the
   * colour under it.
   */
  get slotLevels(): { id: string; level: number; maxed: boolean; text: string; fill: string }[] {
    return slotRows(this.model).flatMap((row, index) => {
      const pill = this.slotIcons[index]?.levelBadge;
      if (row.kind !== 'spell' || !pill) return [];
      return [{ id: row.id, level: row.level, maxed: row.maxed, ...pill }];
    });
  }

  /** The passive tiles on screen, in the order taken; the browser suite reads them. */
  get passiveTiles(): readonly HudPassiveTile[] {
    return this.shownTiles;
  }

  /** The box round everything in the top-right corner; the browser suite checks it stays in the margin. */
  get cornerBounds(): { left: number; top: number; right: number; bottom: number } {
    const parts = [...this.cornerParts, ...this.passiveParts];
    if (this.cornerPlate) parts.push(...this.cornerPlate.solid);
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const part of parts) {
      // A badge's pill (Graphics) has no bounds; its Text is the same box.
      if (part.type === 'Graphics') continue;
      const box = (
        part as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.GetBounds
      ).getBounds();
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
    return { left, top, right, bottom };
  }

  create(): void {
    this.model = INITIAL_HUD;
    const { width } = this.scale;

    // The atlas installs every page or none, so one bar's art stands for all four.
    const art = Object.values(BAR_ART).every(
      (bar) => hasFrameArt(this, bar.frame) && hasFrameArt(this, bar.mark),
    );
    this.look = art ? 'art' : 'flat';
    if (art) {
      this.hpBar = new FramedBar(this, FRAMED_X, MARGIN, FRAMED_WIDTH, BAR_ART.hp, HP_COLOR);
      this.shieldBar = new FramedBar(
        this,
        FRAMED_X,
        FRAMED_SHIELD_Y,
        FRAMED_WIDTH,
        BAR_ART.shield,
        SHIELD_COLOR,
      );
      this.xpBar = new FramedBar(this, FRAMED_X, FRAMED_XP_Y, FRAMED_WIDTH, BAR_ART.xp, XP_COLOR);
      this.bossBar = new FramedBar(
        this,
        width / 2 - BOSS_WIDTH / 2,
        FRAMED_BOSS_Y,
        BOSS_WIDTH,
        BAR_ART.boss,
        BOSS_COLOR,
      );
    } else {
      this.hpBar = new Bar(this, MARGIN, MARGIN, BAR_WIDTH, 18, HP_COLOR);
      this.shieldBar = new Bar(this, MARGIN, MARGIN + 22, BAR_WIDTH, 8, SHIELD_COLOR);
      this.xpBar = new Bar(this, MARGIN, MARGIN + 34, BAR_WIDTH, 10, XP_COLOR);
      this.bossBar = new Bar(this, width / 2 - 200, 56, 400, 14, BOSS_COLOR);
    }
    this.timerText = this.add
      .text(width / 2, MARGIN - 4, '', { ...LABEL_STYLE, fontSize: '28px' })
      .setOrigin(0.5, 0);
    this.createCorner(width);
    this.slotIcons = [];
    this.render();

    this.subscribe();
  }

  /**
   * The top-right corner. Iconed, it reuses the boss bar's frame and its skull
   * as the plate — the bar itself is drawn only in the boss phase, and it sits
   * elsewhere — with the numbers beside the skull and the Ember pickup's art.
   * Flat, it is the two text lines it always was.
   */
  private createCorner(width: number): void {
    // The atlas installs every page or none, so the ember's art is there
    // whenever the bars' is; the check is for a build that ships one without the other.
    this.iconed = this.look === 'art' && hasFrameArt(this, 'pickupEmber.idle.0');
    this.cornerParts = [];
    this.cornerPlate = null;
    this.passiveParts = [];
    this.shownPassives = [];
    this.shownTiles = [];
    if (this.iconed) {
      // The plate is the boss bar's frame at rest: an empty fill and no label
      // leave the hollow tube, and the frame's own mark is the skull.
      this.cornerPlate = new FramedBar(
        this,
        CORNER_PLATE_X,
        MARGIN,
        CORNER_PLATE_WIDTH,
        BAR_ART.boss,
        BAR_BG,
      );
      this.cornerPlate.set(0, '');
      this.killsText = this.add
        .text(CORNER_KILLS_X, CORNER_COUNT_Y, '', LABEL_STYLE)
        .setOrigin(0, 0.5);
      const ember = this.add
        .image(
          CORNER_EMBER_ICON_X,
          CORNER_EMBER_ICON_Y,
          FRAMES['pickupEmber.idle.0'].page,
          artFrame('pickupEmber.idle.0'),
        )
        .setOrigin(0, 0);
      this.embersText = this.add
        .text(CORNER_EMBERS_X, CORNER_COUNT_Y, '', { ...LABEL_STYLE, color: EMBERS_COLOR })
        .setOrigin(0, 0.5);
      this.cornerParts = [this.killsText, ember, this.embersText];
    } else {
      this.killsText = this.add.text(width - MARGIN, MARGIN, '', LABEL_STYLE).setOrigin(1, 0);
      this.embersText = this.add
        .text(width - MARGIN, MARGIN + 20, '', { ...LABEL_STYLE, color: EMBERS_COLOR })
        .setOrigin(1, 0);
      this.cornerParts = [this.killsText, this.embersText];
    }
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
    const counts = cornerCounts(m, this.iconed);
    this.killsText.setText(counts.kills);
    this.embersText.setText(counts.embers);
    this.bossBar.setVisible(bossBarVisible(m));
    this.bossBar.set(fraction(m.bossHp, m.bossMaxHp), 'Boss');
    this.renderSlots(slotRows(m));
    this.renderPassives(m.passives);
  }

  /**
   * CO-193: the passive tiles. The Game scene publishes a new array every
   * frame, so compare contents and rebuild only when a passive is taken or
   * ranked up; the tiles that changed get a short white pulse.
   */
  private renderPassives(next: readonly LoadoutPassiveView[]): void {
    if (samePassives(this.shownPassives, next)) return;
    const risen = risenPassives(this.shownPassives, next);
    for (const part of this.passiveParts) part.destroy();
    this.passiveParts = [];
    this.shownPassives = next;
    this.shownTiles = passiveTileLayout(
      next,
      CORNER_TILES_LEFT,
      this.iconed ? CORNER_TILES_TOP : CORNER_FLAT_TILES_TOP,
    );
    for (const tile of this.shownTiles) {
      // The pause screen's tiles: the icon on its mint rim, or letters with no art.
      if (!addBuildIcon(this, tile.x, tile.y, tile, PASSIVE_COLOR, this.passiveParts)) {
        addPassiveTile(this, tile.x, tile.y, tile, this.passiveParts);
      }
      if (risen.includes(tile.id)) this.flash(tile.x, tile.y);
    }
  }

  /** A ring that fades out over `TILE_FLASH_MS` on a tile just picked or ranked up. */
  private flash(x: number, y: number): void {
    const ring = this.add.circle(x, y, TILE_FLASH_RADIUS).setStrokeStyle(2, 0xffffff);
    this.tweens.add({
      targets: ring,
      alpha: { from: 1, to: 0 },
      duration: TILE_FLASH_MS,
      onComplete: () => ring.destroy(),
    });
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
