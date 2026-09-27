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
import { pickupHelpRows } from '../core/helpModel';
import { SCENE, isHelpPayload, type HelpView } from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import { attachMenuInput, type MenuItem } from './input';
import { addTextButton, textButtonItem } from './ui';

const SERIF = 'Georgia, serif';
const CRIMSON_CSS = '#dc143c';
const TAB_Y = 96;
const TAB_WIDTH = 140;
const TAB_ACTIVE = '#ffd700';
const SMALL_BUTTON = { fontSize: '22px', padding: { x: 14, y: 6 } } as const;

/** Pickups tab: one 44 px row per pickup between the tabs and Back. */
const ROW_TOP = 142;
const ROW_PITCH = 44;
const ICON_X = 56;
/** The box every icon is scaled to fit: the relic's art is 3x the Ember's. */
const ICON_BOX = 32;
const NAME_X = 92;
const TEXT_X = 196;

/** The feedback form's fields, in game pixels. */
const FORM_WIDTH = 600;
const FORM_TOP = 90;
const FIELD_BORDER = '#5a1620';

/** Set by the last successful send, for the session: reopening the form keeps the cooldown. */
let lastSentAt: number | null = null;

const FEEDBACK_KEY = import.meta.env.VITE_FEEDBACK_ACCESS_KEY;

/**
 * Help screen (#226), reached from Intro and back to it. Two tabs: Pickups,
 * a row per thing on the floor with its art and what it does
 * (`core/helpModel.ts`), and About, the build's version, what's new
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
  private leaving = false;
  /** Bumped on every create, so a send that resolves after the form closed changes nothing. */
  private generation = 0;
  private sending = false;
  private sendLabel: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SCENE.help);
  }

  /** The view on screen, read-only; the browser suite asserts on it. */
  get view(): HelpView {
    return this.current;
  }

  init(data: unknown): void {
    this.current = isHelpPayload(data) ? data.view : 'pickups';
    // Phaser replays the last start payload on a payload-less start; clear it.
    this.scene.settings.data = {};
  }

  create(): void {
    // The menu track carries across every menu screen (CO-157); asking again is a no-op.
    audioOf(this).playMusic('music.menu');
    this.leaving = false;
    this.sending = false;
    this.sendLabel = null;
    this.generation += 1;
    const { width, height } = this.scale;

    this.add
      .text(width / 2, 40, this.current === 'feedback' ? 'Send feedback' : 'Help', {
        fontFamily: SERIF,
        fontSize: '40px',
        color: CRIMSON_CSS,
      })
      .setOrigin(0.5);

    if (this.current === 'feedback') {
      this.drawForm();
    } else {
      const items = this.drawTabs();
      if (this.current === 'pickups') this.drawPickups();
      else items.push(...this.drawAbout());
      const back = addTextButton(this, width / 2, height - 46, 'Back  (Esc)', () => this.back(), {
        ...SMALL_BUTTON,
      });
      items.push(textButtonItem(back, () => this.back()));
      attachMenuInput(this, items, { keyboard: true });
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
    if (!this.sendLabel) return;
    const left = feedbackCooldownLeftMs(lastSentAt, Date.now());
    const label = this.sending
      ? 'Sending…'
      : left > 0
        ? `Send (${Math.ceil(left / 1000)} s)`
        : 'Send';
    this.sendLabel.setText(label);
    this.sendLabel.setAlpha(this.sending || left > 0 ? 0.5 : 1);
  }

  private drawTabs(): MenuItem[] {
    const { width } = this.scale;
    const tabs: readonly (readonly [label: string, view: HelpView])[] = [
      ['Pickups', 'pickups'],
      ['About', 'about'],
    ];
    return tabs.map(([label, view], i) => {
      const open = (): void => this.show(view);
      const x = width / 2 + (i - 0.5) * (TAB_WIDTH + 16);
      const tab = addTextButton(this, x, TAB_Y, label, open, {
        ...SMALL_BUTTON,
        fixedWidth: TAB_WIDTH,
        align: 'center',
        color: view === this.current ? TAB_ACTIVE : '#bbbbbb',
      });
      return textButtonItem(tab, open);
    });
  }

  private drawPickups(): void {
    pickupHelpRows().forEach((row, i) => {
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

  private drawAbout(): MenuItem[] {
    const { width } = this.scale;
    this.add
      .text(width / 2, 156, `Crimson Onslaught  v${__APP_VERSION__}`, {
        fontFamily: SERIF,
        fontSize: '24px',
        color: '#eeeeee',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 202, "What's new", {
        fontFamily: SERIF,
        fontSize: '20px',
        color: CRIMSON_CSS,
      })
      .setOrigin(0.5);
    CHANGELOG.forEach(({ version, line }, i) => {
      this.add
        .text(width / 2, 236 + i * 28, `v${version}  ${line}`, {
          fontFamily: SERIF,
          fontSize: '17px',
          color: '#cccccc',
        })
        .setOrigin(0.5);
    });

    const y = 406;
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
    const button = addTextButton(this, width / 2, y, 'Send feedback', open, SMALL_BUTTON);
    return [textButtonItem(button, open)];
  }

  private drawForm(): void {
    const { width, height } = this.scale;
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

    const sendButton = addTextButton(this, width / 2 - 90, 446, 'Send', sendNow, {
      ...SMALL_BUTTON,
      fixedWidth: 150,
      align: 'center',
    });
    this.sendLabel = sendButton;
    const cancelButton = addTextButton(this, width / 2 + 90, 446, 'Cancel  (Esc)', cancel, {
      ...SMALL_BUTTON,
      fixedWidth: 150,
      align: 'center',
    });
    attachMenuInput(
      this,
      [textButtonItem(sendButton, sendNow), textButtonItem(cancelButton, cancel)],
      {
        keyboard: true,
      },
    );

    this.add
      .text(
        width / 2,
        height - 30,
        'Typing needs a keyboard; a gamepad can reach Send and Cancel.',
        {
          fontFamily: SERIF,
          fontSize: '15px',
          color: '#888888',
        },
      )
      .setOrigin(0.5);

    subject.focus();
  }

  /** Idempotent, like `back`: a click and a key in the same frame switch once. */
  private show(view: HelpView): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.restart({ view });
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(SCENE.intro);
  }
}
