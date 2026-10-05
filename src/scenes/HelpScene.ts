import Phaser from 'phaser';
import { CHANGELOG } from '../config/changelog';
import { bindingLabel, defaultControls } from '../core/controls';
import {
  FEEDBACK_URL,
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  feedbackAvailable,
  feedbackCooldownLeftMs,
  feedbackPayload,
  validateFeedback,
} from '../core/feedback';
import {
  clampHelpPage,
  controlHelpRows,
  groupChangelog,
  helpShoulderStep,
  passiveHelpPages,
  pickupHelpRows,
  spellHelpPages,
  type PagedHelpView,
} from '../core/helpModel';
import { SCENE, isHelpPayload, type HelpView } from '../core/scenePayloads';
import { MAX_RANK_CSS } from '../core/maxRank';
import { audioOf } from '../render/audio';
import { addBuildCardIcon, addSpellIcon } from '../render/spellIcon';
import { CRIMSON_CSS, SERIF } from './buildStrips';
import { controlsOf } from './controls';
import { attachBoundPadButtons, attachMenuInput, attachPadButtons, type MenuItem } from './input';
import {
  addHintLine,
  addMenuRow,
  addMenuTitle,
  drawMenuBackdrop,
  drawPanel,
  type MenuRow,
} from './menuUi';

const TAB_Y = 92;
const TAB_WIDTH = 160;
const BACK_Y = 478;

/**
 * Every list tab is a table (CO-238): a header naming the columns, a rule, then
 * one line per item, every other line shaded, in a panel between the tabs and
 * Back. A cell too long for its column wraps inside it.
 */
const PANEL_TOP = 112;
const PANEL_PADDING = 8;
const TABLE_HEADER_Y = PANEL_TOP + PANEL_PADDING + 12;
const TABLE_RULE_Y = TABLE_HEADER_Y + 14;
const TABLE_ROW_TOP = TABLE_RULE_Y + 4;
/** The rule and the shading span the panel inside its padding. */
const TABLE_WIDTH = 884;
/** The table's right edge: a wrapped cell in the last column wraps here. */
const TABLE_RIGHT = 480 + TABLE_WIDTH / 2;
const ICON_X = 60;
/** The box every pickup icon is scaled to fit: the relic's art is 3x the Ember's. */
const ICON_BOX = 32;
const NAME_X = 92;

/** Pickups: a 40 px line per pickup; Found and Effect wrap to two lines at most. */
const PICKUP_ROW_PITCH = 40;
const PICKUP_SOURCE_X = 196;
const PICKUP_EFFECT_X = 466;

/** Passives: a 36 px line per passive, eight to a page; Per rank starts right of "Regeneration". */
const PASSIVE_ROW_PITCH = 36;
const PASSIVE_TEXT_X = 236;
/** The Max rank column's centre. */
const PASSIVE_CAP_X = 870;

/**
 * Spells (#327): a 56 px line per spell, five to a page, so the panel ends
 * above Back. The name column holds "Lightning Companion" (#329); each level
 * column wraps the level-up card's text to two lines.
 */
const SPELL_ROW_PITCH = 56;
const SPELL_LV2_X = 282;
const SPELL_LV3_X = 596;

/** Controls (#384): a 44 px line per action, six of them since CO-226. */
const CONTROL_ROW_PITCH = 44;
const CONTROL_KEYBOARD_X = 180;
const CONTROL_PAD_X = 370;
const CONTROL_NOTE_X = 596;

/**
 * The pager (#328) shares Back's row: Back spans 220 px and each pager button
 * 160, so buttons centred 206 px either side leave 16 px between them.
 */
const PAGER_WIDTH = 160;
const PAGER_OFFSET = 206;

/** About tab's changelog rows (#377): a heading per version, then its lines. */
const ABOUT_ROW_TOP = 214;
const ABOUT_ROW_PITCH = 22;

/** The feedback form's fields, in game pixels. */
const FORM_WIDTH = 600;
const FORM_TOP = 90;
const FIELD_BORDER = '#5a1620';

/** Set by the last successful send, for the session: reopening the form keeps the cooldown. */
let lastSentAt: number | null = null;

const FEEDBACK_KEY = import.meta.env.VITE_FEEDBACK_ACCESS_KEY;

/**
 * Help screen (#226), reached from Intro and back to it. Five tabs: Pickups,
 * a row per thing on the floor with its art and what it does
 * (`core/helpModel.ts`); Spells (#327), a row per spell with its icon and what
 * its two upgrades add, the level-up card's own text; Passives (CO-238), a row
 * per passive with its icon, what a rank does and its cap, as a table; Controls (#384)
 * lists the keys and pad buttons; and About, the build's version, what's new
 * (`config/changelog.ts`) and a feedback form. Like Pause, a tab switch or the
 * form restarts the scene on that view, so every view builds its own menu.
 *
 * The form is DOM (Phaser's DOM layer): a subject and a message, posted to the
 * form-to-email service. Keys typed into a field stop at the form, so neither
 * the menu nor the page-wide mute key sees them; Esc there closes the form.
 * Send and Cancel are canvas buttons, so a gamepad reaches them — it cannot
 * type, and the form says so. A build with no service key shows that on About
 * instead of a button.
 */
export class HelpScene extends Phaser.Scene {
  private current: HelpView = 'pickups';
  /** The Spells page on screen (0-based), already clamped to the pages there are. */
  private spellPage = 0;
  /** The Passives page on screen (0-based), already clamped to the pages there are. */
  private passivePage = 0;
  private leaving = false;
  /** Bumped on every create, so a send that resolves after the form closed changes nothing. */
  private generation = 0;
  private sending = false;
  private sendRow: MenuRow | null = null;
  /** The rebindable controls (CO-226), read as the screen opens. */
  private controls = defaultControls();

  constructor() {
    super(SCENE.help);
  }

  /** The view on screen, read-only; the browser suite asserts on it. */
  get view(): HelpView {
    return this.current;
  }

  init(data: unknown): void {
    this.current = isHelpPayload(data) ? data.view : 'pickups';
    // Clamped against the pages again in `drawSpells`, once the table is read.
    this.spellPage = isHelpPayload(data) ? (data.spellPage ?? 0) : 0;
    this.passivePage = isHelpPayload(data) ? (data.passivePage ?? 0) : 0;
    // Phaser replays the last start payload on a payload-less start; clear it.
    this.scene.settings.data = {};
  }

  create(): void {
    // The menu track carries across every menu screen (CO-157); asking again is a no-op.
    audioOf(this).playMusic('music.menu');
    this.leaving = false;
    this.sending = false;
    this.sendRow = null;
    this.generation += 1;
    this.controls = controlsOf(this);
    const { width } = this.scale;

    drawMenuBackdrop(this, 'quiet');
    addMenuTitle(this, width / 2, 40, this.current === 'feedback' ? 'Send feedback' : 'Help');

    if (this.current === 'feedback') {
      this.drawForm();
    } else {
      const items: MenuItem[] = this.drawTabs();
      if (this.current === 'pickups') this.drawPickups();
      else if (this.current === 'spells') items.push(...this.drawSpells());
      else if (this.current === 'passives') items.push(...this.drawPassives());
      else if (this.current === 'controls') this.drawControls();
      else items.push(...this.drawAbout());
      items.push(
        addMenuRow(this, {
          kind: 'bar',
          label: 'Back  (Esc)',
          x: width / 2,
          y: BACK_Y,
          width: 220,
          onConfirm: () => this.back(),
        }),
      );
      attachMenuInput(this, items, { keyboard: true });
      const tabKeys = `${bindingLabel(this.controls, 'keyboard', 'helpPrev')}/${bindingLabel(this.controls, 'keyboard', 'helpNext')}`;
      const tabButtons = `${bindingLabel(this.controls, 'pad', 'helpPrev')}/${bindingLabel(this.controls, 'pad', 'helpNext')}`;
      addHintLine(
        this,
        `click, arrows + Enter, ${tabKeys} tabs, or a gamepad (A select, B back, ${tabButtons} tabs)`,
      );
    }

    // Phaser applies a restart or a start on its next step and empties the key
    // queue at the end of it, so the Esc acted on here never reaches the view
    // it hands over to (see PauseScene).
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) return;
      // The bound tab keys (Q and E) walk the tabs like LB and RB.
      if (event.code === this.controls.keyboard.helpPrev) this.shoulder(-1);
      else if (event.code === this.controls.keyboard.helpNext) this.shoulder(1);
      if (event.key !== 'Escape') return;
      if (this.current === 'feedback') this.show('about');
      else this.back();
    });
    // Pad (#377): B is Esc; the bound tab buttons (LB and RB) walk the tabs, turning Spells pages first.
    attachPadButtons(this, {
      B: () => (this.current === 'feedback' ? this.show('about') : this.back()),
    });
    attachBoundPadButtons(this, [
      { button: this.controls.pad.helpPrev, handler: () => this.shoulder(-1) },
      { button: this.controls.pad.helpNext, handler: () => this.shoulder(1) },
    ]);
  }

  private shoulder(dir: -1 | 1): void {
    const page = this.current === 'passives' ? this.passivePage : this.spellPage;
    const counts = { spells: spellHelpPages().length, passives: passiveHelpPages().length };
    const step = helpShoulderStep(this.current, page, counts, dir);
    if (!step) return;
    this.show(step.view, step.page);
  }

  /** Redraws Send's label as a send or its cooldown ends; unchanged text is a no-op. */
  update(): void {
    if (!this.sendRow) return;
    const left = feedbackCooldownLeftMs(lastSentAt, Date.now());
    const label = this.sending
      ? 'Sending…'
      : left > 0
        ? `Send (${Math.ceil(left / 1000)} s)`
        : 'Send';
    this.sendRow.setLabel(label);
    this.sendRow.setEnabled(!this.sending && left <= 0);
  }

  private drawTabs(): MenuRow[] {
    const { width } = this.scale;
    const tabs: readonly (readonly [label: string, view: HelpView])[] = [
      ['Pickups', 'pickups'],
      ['Spells', 'spells'],
      ['Passives', 'passives'],
      ['Controls', 'controls'],
      ['About', 'about'],
    ];
    return tabs.map(([label, view], i) => {
      const open = (): void => this.show(view);
      const tab = addMenuRow(this, {
        kind: 'bar',
        label,
        x: width / 2 + (i - (tabs.length - 1) / 2) * (TAB_WIDTH + 16),
        y: TAB_Y,
        width: TAB_WIDTH,
        onConfirm: open,
      });
      tab.setActive(view === this.current);
      return tab;
    });
  }

  /**
   * A table (CO-238): the panel sized to `count` lines, the column headers and
   * a rule, and a shade on every other line. Returns each line's centre; the
   * caller draws the cells.
   */
  private drawTable(
    count: number,
    pitch: number,
    headers: readonly (readonly [text: string, x: number, centred?: boolean])[],
  ): number[] {
    const left = 480 - TABLE_WIDTH / 2;
    drawPanel(this, 30, PANEL_TOP, 900, TABLE_ROW_TOP - PANEL_TOP + count * pitch + PANEL_PADDING);
    for (const [text, x, centred] of headers) {
      this.add
        .text(x, TABLE_HEADER_Y, text, { fontFamily: SERIF, fontSize: '15px', color: '#999999' })
        .setOrigin(centred ? 0.5 : 0, 0.5);
    }
    this.add.rectangle(left, TABLE_RULE_Y, TABLE_WIDTH, 1, 0x5a1620).setOrigin(0, 0.5);
    return Array.from({ length: count }, (_, i) => {
      const y = TABLE_ROW_TOP + pitch / 2 + i * pitch;
      // Every other line is shaded, so the eye can follow a row across the columns.
      // The first line stays plain so no shade sits against the header rule.
      if (i % 2 === 1) {
        this.add.rectangle(left, y, TABLE_WIDTH, pitch, 0xffffff, 0.04).setOrigin(0, 0.5);
      }
      return y;
    });
  }

  /** One table cell, left-aligned on its line and wrapped at `width` when given. */
  private addCell(
    x: number,
    y: number,
    text: string,
    size: number,
    color: string,
    width?: number,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: SERIF,
        fontSize: `${size}px`,
        color,
        ...(width === undefined ? {} : { wordWrap: { width } }),
      })
      .setOrigin(0, 0.5);
  }

  /** Pickups tab: icon | pickup | found | effect. */
  private drawPickups(): void {
    const rows = pickupHelpRows();
    const ys = this.drawTable(rows.length, PICKUP_ROW_PITCH, [
      ['Pickup', NAME_X],
      ['Found', PICKUP_SOURCE_X],
      ['Effect', PICKUP_EFFECT_X],
    ]);
    rows.forEach((row, i) => {
      const y = ys[i]!;
      const icon = this.add.sprite(ICON_X, y, row.texture);
      // The clips are the game's; each sprite still has to start its own.
      if (this.anims.exists(row.clip)) icon.play(row.clip);
      icon.setScale(ICON_BOX / Math.max(icon.width, icon.height));
      this.addCell(NAME_X, y, row.name, 18, '#eeeeee');
      this.addCell(
        PICKUP_SOURCE_X,
        y,
        row.source,
        14,
        '#999999',
        PICKUP_EFFECT_X - PICKUP_SOURCE_X - 16,
      );
      this.addCell(PICKUP_EFFECT_X, y, row.effect, 15, '#dddddd', TABLE_RIGHT - PICKUP_EFFECT_X);
    });
  }

  /** Controls tab (#384): action | keyboard | gamepad | note, with the player's own bindings. */
  private drawControls(): void {
    const rows = controlHelpRows(undefined, this.controls);
    const ys = this.drawTable(rows.length, CONTROL_ROW_PITCH, [
      ['Action', ICON_X],
      ['Keyboard', CONTROL_KEYBOARD_X],
      ['Gamepad', CONTROL_PAD_X],
      ['Note', CONTROL_NOTE_X],
    ]);
    rows.forEach((row, i) => {
      const y = ys[i]!;
      this.addCell(ICON_X, y, row.action, 18, '#eeeeee');
      this.addCell(
        CONTROL_KEYBOARD_X,
        y,
        row.keyboard,
        16,
        '#f0c674',
        CONTROL_PAD_X - CONTROL_KEYBOARD_X - 16,
      );
      this.addCell(
        CONTROL_PAD_X,
        y,
        row.gamepad,
        16,
        '#f0c674',
        CONTROL_NOTE_X - CONTROL_PAD_X - 16,
      );
      this.addCell(CONTROL_NOTE_X, y, row.note, 14, '#cccccc', TABLE_RIGHT - CONTROL_NOTE_X);
    });
  }

  /** Spells tab (#327): icon | spell | Lv 2 | Lv 3 (max), an element to a page. */
  private drawSpells(): MenuItem[] {
    const pages = spellHelpPages();
    this.spellPage = clampHelpPage(this.spellPage, pages.length);
    const rows = pages[this.spellPage]?.rows ?? [];
    const ys = this.drawTable(rows.length, SPELL_ROW_PITCH, [
      ['Spell', NAME_X],
      ['Lv 2', SPELL_LV2_X],
      ['Lv 3 (max)', SPELL_LV3_X],
    ]);
    rows.forEach((row, i) => {
      const y = ys[i]!;
      // The HUD slot's own art, or its colour and letters when the run has no atlas.
      addSpellIcon(this, ICON_X, y, row, 1);
      this.addCell(NAME_X, y, row.name, 18, '#eeeeee');
      this.addCell(SPELL_LV2_X, y, row.lv2, 14, '#dddddd', SPELL_LV3_X - SPELL_LV2_X - 16);
      this.addCell(SPELL_LV3_X, y, row.lv3, 14, '#f0c674', TABLE_RIGHT - SPELL_LV3_X);
    });
    return this.drawPager('spells', this.spellPage, pages);
  }

  /** Passives tab (CO-238): icon | passive | per rank | max rank, eight to a page. */
  private drawPassives(): MenuItem[] {
    const pages = passiveHelpPages();
    this.passivePage = clampHelpPage(this.passivePage, pages.length);
    const rows = pages[this.passivePage]?.rows ?? [];
    const ys = this.drawTable(rows.length, PASSIVE_ROW_PITCH, [
      ['Passive', NAME_X],
      ['Per rank', PASSIVE_TEXT_X],
      ['Max rank', PASSIVE_CAP_X, true],
    ]);
    rows.forEach((row, i) => {
      const y = ys[i]!;
      // The level-up card's own art; a passive with none shows text alone.
      addBuildCardIcon(this, ICON_X, y, row.id, 1);
      this.addCell(NAME_X, y, row.name, 18, '#eeeeee');
      this.addCell(PASSIVE_TEXT_X, y, row.effect, 16, '#dddddd');
      this.addCell(PASSIVE_CAP_X, y, row.cap, 18, MAX_RANK_CSS).setOrigin(0.5);
    });
    return this.drawPager('passives', this.passivePage, pages);
  }

  /** A button only where that neighbour page exists; each names the page it goes to. */
  private drawPager(
    view: PagedHelpView,
    page: number,
    pages: readonly { title: string }[],
  ): MenuItem[] {
    const { width } = this.scale;
    const pager: MenuItem[] = [];
    const prev = pages[page - 1];
    const next = pages[page + 1];
    if (prev) {
      pager.push(
        addMenuRow(this, {
          kind: 'bar',
          label: `< ${prev.title}`,
          x: width / 2 - PAGER_OFFSET,
          y: BACK_Y,
          width: PAGER_WIDTH,
          onConfirm: () => this.show(view, page - 1),
        }),
      );
    }
    if (next) {
      pager.push(
        addMenuRow(this, {
          kind: 'bar',
          label: `${next.title} >`,
          x: width / 2 + PAGER_OFFSET,
          y: BACK_Y,
          width: PAGER_WIDTH,
          onConfirm: () => this.show(view, page + 1),
        }),
      );
    }
    return pager;
  }

  private drawAbout(): MenuItem[] {
    const { width } = this.scale;
    drawPanel(this, 130, PANEL_TOP, 700, 262);
    this.add
      .text(width / 2, 146, `Crimson Onslaught  v${__APP_VERSION__}  Pre-alpha`, {
        fontFamily: SERIF,
        fontSize: '24px',
        color: '#eeeeee',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 188, "What's new", {
        fontFamily: SERIF,
        fontSize: '20px',
        color: CRIMSON_CSS,
      })
      .setOrigin(0.5);
    // One heading per version, its lines under it (#377); `MAX_ABOUT_ROWS` rows fit the panel.
    let row = 0;
    for (const { version, lines } of groupChangelog(CHANGELOG)) {
      const rows = [`v${version}`, ...lines.map((line) => `• ${line}`)];
      rows.forEach((text, i) => {
        this.add
          .text(width / 2, ABOUT_ROW_TOP + row * ABOUT_ROW_PITCH, text, {
            fontFamily: SERIF,
            fontSize: '17px',
            color: i === 0 ? '#eeeeee' : '#cccccc',
          })
          .setOrigin(0.5);
        row += 1;
      });
    }

    const y = 410;
    if (!feedbackAvailable(FEEDBACK_KEY)) {
      this.add
        .text(width / 2, y, 'Feedback unavailable in this build', {
          fontFamily: SERIF,
          fontSize: '18px',
          color: '#888888',
        })
        .setOrigin(0.5);
      return [];
    }
    const open = (): void => this.show('feedback');
    return [
      addMenuRow(this, {
        kind: 'bar',
        label: 'Send feedback',
        x: width / 2,
        y,
        width: 240,
        onConfirm: open,
      }),
    ];
  }

  private drawForm(): void {
    const { width } = this.scale;
    const generation = this.generation;
    const field = (tag: 'input' | 'textarea'): HTMLInputElement | HTMLTextAreaElement => {
      const el = document.createElement(tag);
      el.style.cssText = [
        `width: ${FORM_WIDTH}px`,
        'box-sizing: border-box',
        'display: block',
        'margin: 0 0 12px',
        'padding: 8px 10px',
        'font: 18px Georgia, serif',
        'color: #eeeeee',
        'background: #1a1a1a',
        `border: 2px solid ${FIELD_BORDER}`,
        'outline: none',
        'resize: none',
      ].join(';');
      // The browser's outline is off, so the field being typed in shows by its border.
      el.addEventListener('focus', () => (el.style.borderColor = CRIMSON_CSS));
      el.addEventListener('blur', () => (el.style.borderColor = FIELD_BORDER));
      return el;
    };
    const subject = field('input') as HTMLInputElement;
    subject.type = 'text';
    subject.name = 'subject';
    subject.placeholder = 'Subject';
    subject.maxLength = MAX_SUBJECT_LENGTH;
    const message = field('textarea') as HTMLTextAreaElement;
    message.name = 'message';
    message.placeholder = 'Message';
    message.rows = 10;
    message.maxLength = MAX_MESSAGE_LENGTH;
    // The service's honeypot: off screen and out of the tab order, so only a bot fills it in.
    const honeypot = document.createElement('input');
    honeypot.type = 'checkbox';
    honeypot.name = 'botcheck';
    honeypot.tabIndex = -1;
    honeypot.style.cssText = 'position: absolute; left: -9999px';

    const form = document.createElement('div');
    form.append(subject, message, honeypot);
    // Typed keys belong to the fields: the menu and the page-wide mute key
    // listen further up, on the window and the document.
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      form.addEventListener(type, (event) => {
        event.stopPropagation();
        if (type === 'keydown' && (event as KeyboardEvent).key === 'Escape') this.show('about');
      });
    }
    this.add.dom(width / 2, FORM_TOP, form).setOrigin(0.5, 0);

    const status = this.add
      .text(width / 2, 404, '', { fontFamily: SERIF, fontSize: '18px', color: '#dddddd' })
      .setOrigin(0.5);
    const say = (text: string, color: string): void => {
      status.setText(text).setColor(color);
    };

    const send = async (): Promise<void> => {
      if (this.sending || feedbackCooldownLeftMs(lastSentAt, Date.now()) > 0) return;
      if (!feedbackAvailable(FEEDBACK_KEY)) return;
      const input = { subject: subject.value, message: message.value };
      const problem = validateFeedback(input);
      if (problem) {
        say(problem, '#ff6666');
        return;
      }
      this.sending = true;
      audioOf(this).play('ui.confirm');
      say('Sending…', '#dddddd');
      let sent: boolean;
      try {
        const response = await fetch(FEEDBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(
            feedbackPayload(input, __APP_VERSION__, FEEDBACK_KEY, honeypot.checked ? 'on' : ''),
          ),
        });
        const body: unknown = await response.json().catch(() => null);
        sent = response.ok && (body as { success?: unknown } | null)?.success !== false;
      } catch {
        sent = false;
      }
      // Closed or restarted while the request was out: nothing here is on screen any more.
      if (generation !== this.generation || !this.scene.isActive()) return;
      this.sending = false;
      if (sent) {
        lastSentAt = Date.now();
        subject.value = '';
        message.value = '';
        say('Thanks, feedback sent', '#7ddc7d');
      } else {
        say("Couldn't send, try again", '#ff6666');
      }
    };
    const sendNow = (): void => void send();
    const cancel = (): void => this.show('about');

    const sendRow = addMenuRow(this, {
      kind: 'bar',
      label: 'Send',
      x: width / 2 - 110,
      y: 446,
      width: 200,
      onConfirm: sendNow,
    });
    this.sendRow = sendRow;
    const cancelRow = addMenuRow(this, {
      kind: 'bar',
      label: 'Cancel  (Esc)',
      x: width / 2 + 110,
      y: 446,
      width: 200,
      onConfirm: cancel,
    });
    attachMenuInput(this, [sendRow, cancelRow], { keyboard: true });
    addHintLine(this, 'Typing needs a keyboard; a gamepad can reach Send and Cancel.');

    subject.focus();
  }

  /** Idempotent, like `back`: a click and a key in the same frame switch once. `page` is for a paged view. */
  private show(view: HelpView, page?: number): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.restart({
      view,
      spellPage: view === 'spells' ? page : undefined,
      passivePage: view === 'passives' ? page : undefined,
    });
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.intro);
  }
}
