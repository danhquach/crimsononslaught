import Phaser from 'phaser';
import { CHANGELOG } from '../config/changelog';
import {
  FEEDBACK_URL,
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  feedbackAvailable,
  feedbackCooldownLeftMs,
  feedbackPayload,
  validateFeedback,
} from '../core/feedback';
import { clampSpellPage, pickupHelpRows, spellHelpPages } from '../core/helpModel';
import { SCENE, isHelpPayload, type HelpView } from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import { addSpellIcon } from '../render/spellIcon';
import { CRIMSON_CSS, SERIF } from './buildStrips';
import { attachMenuInput, type MenuItem } from './input';
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

/** Pickups tab: a panel with one 40 px row per pickup between the tabs and Back. */
const PANEL_TOP = 112;
const PANEL_PADDING = 8;
const ROW_TOP = PANEL_TOP + PANEL_PADDING + 19;
const ROW_PITCH = 40;
const ICON_X = 60;
/** The box every icon is scaled to fit: the relic's art is 3x the Ember's. */
const ICON_BOX = 32;
const NAME_X = 92;
const TEXT_X = 196;

/** Spells tab (#327): a 64 px row per spell, five to a page, filling the panel down to Back. */
const SPELL_ROW_PITCH = 64;
const SPELL_ROW_TOP = PANEL_TOP + PANEL_PADDING + SPELL_ROW_PITCH / 2;
/** Room for the longest card name ("Fire Companion") at 19px, with slack for a wider font. */
const SPELL_TEXT_X = 260;
/**
 * The pager (#328) shares Back's row: Back spans 220 px and each pager button
 * 160, so buttons centred 206 px either side leave 16 px between them.
 */
const PAGER_WIDTH = 160;
const PAGER_OFFSET = 206;

/** The feedback form's fields, in game pixels. */
const FORM_WIDTH = 600;
const FORM_TOP = 90;
const FIELD_BORDER = '#5a1620';

/** Set by the last successful send, for the session: reopening the form keeps the cooldown. */
let lastSentAt: number | null = null;

const FEEDBACK_KEY = import.meta.env.VITE_FEEDBACK_ACCESS_KEY;

/**
 * Help screen (#226), reached from Intro and back to it. Three tabs: Pickups,
 * a row per thing on the floor with its art and what it does
 * (`core/helpModel.ts`); Spells (#327), a row per spell with its icon and what
 * its two upgrades add, the level-up card's own text; and About, the build's version, what's new
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
  private leaving = false;
  /** Bumped on every create, so a send that resolves after the form closed changes nothing. */
  private generation = 0;
  private sending = false;
  private sendRow: MenuRow | null = null;

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
    const { width } = this.scale;

    drawMenuBackdrop(this, 'quiet');
    addMenuTitle(this, width / 2, 40, this.current === 'feedback' ? 'Send feedback' : 'Help');

    if (this.current === 'feedback') {
      this.drawForm();
    } else {
      const items: MenuItem[] = this.drawTabs();
      if (this.current === 'pickups') this.drawPickups();
      else if (this.current === 'spells') items.push(...this.drawSpells());
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
      addHintLine(this);
    }

    // Phaser applies a restart or a start on its next step and empties the key
    // queue at the end of it, so the Esc acted on here never reaches the view
    // it hands over to (see PauseScene).
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return;
      if (this.current === 'feedback') this.show('about');
      else this.back();
    });
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

  private drawPickups(): void {
    const rows = pickupHelpRows();
    drawPanel(this, 30, PANEL_TOP, 900, rows.length * ROW_PITCH + PANEL_PADDING * 2);
    rows.forEach((row, i) => {
      const y = ROW_TOP + i * ROW_PITCH;
      const icon = this.add.sprite(ICON_X, y, row.texture);
      // The clips are the game's; each sprite still has to start its own.
      if (this.anims.exists(row.clip)) icon.play(row.clip);
      icon.setScale(ICON_BOX / Math.max(icon.width, icon.height));

      this.add
        .text(NAME_X, y, row.name, { fontFamily: SERIF, fontSize: '19px', color: '#eeeeee' })
        .setOrigin(0, 0.5);
      this.add
        .text(TEXT_X, y - 9, row.source, { fontFamily: SERIF, fontSize: '14px', color: '#999999' })
        .setOrigin(0, 0.5);
      this.add
        .text(TEXT_X, y + 10, row.effect, { fontFamily: SERIF, fontSize: '16px', color: '#dddddd' })
        .setOrigin(0, 0.5);
    });
  }

  private drawSpells(): MenuItem[] {
    const { width } = this.scale;
    const pages = spellHelpPages();
    this.spellPage = clampSpellPage(this.spellPage, pages.length);
    const rows = pages[this.spellPage]?.rows ?? [];
    drawPanel(this, 30, PANEL_TOP, 900, rows.length * SPELL_ROW_PITCH + PANEL_PADDING * 2);
    rows.forEach((row, i) => {
      const y = SPELL_ROW_TOP + i * SPELL_ROW_PITCH;
      // The HUD slot's own art, or its colour and letters when the run has no atlas.
      addSpellIcon(this, ICON_X, y, row, 1);
      this.add
        .text(NAME_X, y, row.name, { fontFamily: SERIF, fontSize: '19px', color: '#eeeeee' })
        .setOrigin(0, 0.5);
      this.add
        .text(SPELL_TEXT_X, y - 11, row.lv2, {
          fontFamily: SERIF,
          fontSize: '15px',
          color: '#dddddd',
        })
        .setOrigin(0, 0.5);
      this.add
        .text(SPELL_TEXT_X, y + 11, row.lv3, {
          fontFamily: SERIF,
          fontSize: '15px',
          color: '#f0c674',
        })
        .setOrigin(0, 0.5);
    });

    // A button only where that neighbour page exists; each names the element it goes to.
    const pager: MenuItem[] = [];
    const prev = pages[this.spellPage - 1];
    const next = pages[this.spellPage + 1];
    if (prev) {
      pager.push(
        addMenuRow(this, {
          kind: 'bar',
          label: `< ${prev.title}`,
          x: width / 2 - PAGER_OFFSET,
          y: BACK_Y,
          width: PAGER_WIDTH,
          onConfirm: () => this.showSpellPage(this.spellPage - 1),
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
          onConfirm: () => this.showSpellPage(this.spellPage + 1),
        }),
      );
    }
    return pager;
  }

  private drawAbout(): MenuItem[] {
    const { width } = this.scale;
    drawPanel(this, 130, PANEL_TOP, 700, 262);
    this.add
      .text(width / 2, 146, `Crimson Onslaught  v${__APP_VERSION__}`, {
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
    CHANGELOG.forEach(({ version, line }, i) => {
      this.add
        .text(width / 2, 222 + i * 26, `v${version}  ${line}`, {
          fontFamily: SERIF,
          fontSize: '17px',
          color: '#cccccc',
        })
        .setOrigin(0.5);
    });

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

  /** Idempotent, like `back`: a click and a key in the same frame switch once. */
  private show(view: HelpView): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.restart({ view });
  }

  /** Same guard as `show`: a click and a key in one frame turn the page once. */
  private showSpellPage(spellPage: number): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.restart({ view: 'spells', spellPage });
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.intro);
  }
}
