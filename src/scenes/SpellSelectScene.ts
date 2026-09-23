import Phaser from 'phaser';
import { SPELL_CARDS, SPELL_IDS, spellIdForKey, type SpellId } from '../config/spells';
import { CURRENCY_NAME } from '../config/meta';
import {
  SAVE_REGISTRY_KEY,
  SCENE,
  SEED_REGISTRY_KEY,
  type GamePayload,
} from '../core/scenePayloads';
import { emptySave, isSave } from '../core/save';
import { audioOf } from '../render/audio';
import { attachMenuInput, type MenuItem } from './input';
import { addTextButton, textButtonItem } from './ui';

const CARD_WIDTH = 200;
const CARD_HEIGHT = 280;
const CARD_GAP = 24;
const CARD_PADDING = 14;
const CARD_FILL = 0x1a1a1a;
const CARD_FILL_HOVER = 0x2a2a2a;

/**
 * Spell select: one card per spell (name, color, one-line description, base
 * stats). Click a card, press its number key (1–4), or move the gamepad
 * selection and confirm with A, to start Game with a full `GamePayload`.
 *
 * Also the door to the permanent upgrades (CO-101): the balance and an
 * "Upgrades" button (or `U`) sit under the cards. "Menu" (or `Esc`) goes back
 * to Intro (#121).
 */
export class SpellSelectScene extends Phaser.Scene {
  private started = false;
  private seed = 0;

  constructor() {
    super(SCENE.spellSelect);
  }

  create(): void {
    this.started = false;
    const { width, height } = this.scale;
    this.seed = this.registry.get(SEED_REGISTRY_KEY) as number;

    this.add
      .text(width / 2, 60, 'Choose a spell', {
        fontFamily: 'Georgia, serif',
        fontSize: '48px',
        color: '#dc143c',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 112, 'click a card, press 1–4, or use a gamepad', {
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    const rowWidth = SPELL_IDS.length * CARD_WIDTH + (SPELL_IDS.length - 1) * CARD_GAP;
    const firstX = (width - rowWidth) / 2 + CARD_WIDTH / 2;
    const cardY = 150 + CARD_HEIGHT / 2;
    const items = SPELL_IDS.map((spellId, i) =>
      this.addCard(firstX + i * (CARD_WIDTH + CARD_GAP), cardY, spellId, i + 1),
    );
    const upgradesButton = addTextButton(
      this,
      width - 110,
      height - 32,
      'Upgrades  (U)',
      () => this.openUpgrades(),
      { fontSize: '20px', padding: { x: 12, y: 6 } },
    );
    const menuButton = addTextButton(this, 90, 32, 'Menu  (Esc)', () => this.openMenu(), {
      fontSize: '18px',
      padding: { x: 10, y: 5 },
    });
    attachMenuInput(this, [
      ...items,
      textButtonItem(upgradesButton, () => this.openUpgrades()),
      textButtonItem(menuButton, () => this.openMenu()),
    ]);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const spellId = spellIdForKey(event.key);
      if (spellId) this.startGame(spellId);
      else if (event.key === 'u' || event.key === 'U') this.openUpgrades();
      else if (event.key === 'Escape') this.openMenu();
    });

    const stored: unknown = this.registry.get(SAVE_REGISTRY_KEY);
    const save = isSave(stored) ? stored : emptySave();
    this.add.text(24, height - 44, `${CURRENCY_NAME}: ${save.currency.toLocaleString('en-US')}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#ffa040',
    });

    this.add
      .text(width / 2, height - 24, `seed ${this.seed}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#888888',
      })
      .setOrigin(0.5);
  }

  private addCard(x: number, y: number, spellId: SpellId, hotkey: number): MenuItem {
    const card = SPELL_CARDS[spellId];
    const colorHex = `#${card.color.toString(16).padStart(6, '0')}`;
    const innerWidth = CARD_WIDTH - CARD_PADDING * 2;
    const left = -CARD_WIDTH / 2 + CARD_PADDING;
    const top = -CARD_HEIGHT / 2 + CARD_PADDING;

    const frame = this.add
      .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_FILL)
      .setStrokeStyle(2, card.color);
    const swatch = this.add.rectangle(0, top + 2, innerWidth, 4, card.color).setOrigin(0.5, 0);
    const key = this.add.text(left, top + 14, `${hotkey}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#888888',
    });
    const name = this.add.text(left, top + 40, card.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: colorHex,
      wordWrap: { width: innerWidth },
    });
    const description = this.add.text(left, top + 100, card.description, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#dddddd',
      wordWrap: { width: innerWidth },
      lineSpacing: 2,
    });
    const statStyle = { fontFamily: 'monospace', fontSize: '13px', lineSpacing: 4 };
    const statLabels = this.add.text(left, top + 176, card.stats.map(([l]) => l).join('\n'), {
      ...statStyle,
      color: '#aaaaaa',
    });
    const statValues = this.add
      .text(left + innerWidth, top + 176, card.stats.map(([, v]) => v).join('\n'), {
        ...statStyle,
        color: '#eeeeee',
        align: 'right',
      })
      .setOrigin(1, 0);

    this.add.container(x, y, [frame, swatch, key, name, description, statLabels, statValues]);

    // Gamepad selection reuses the hover look, so a card reads the same however
    // it was reached.
    const highlight = (on: boolean): void => {
      frame.setFillStyle(on ? CARD_FILL_HOVER : CARD_FILL).setStrokeStyle(on ? 4 : 2, card.color);
    };

    frame.setInteractive({ useHandCursor: true });
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      highlight(true);
      audioOf(this).play('ui.move');
    });
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => highlight(false));
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.startGame(spellId));

    return { setSelected: highlight, confirm: () => this.startGame(spellId) };
  }

  /** Idempotent: a click and a key press in the same frame start exactly one run. */
  private startGame(spellId: SpellId): void {
    if (this.started) return;
    this.started = true;
    audioOf(this).play('ui.confirm');
    const payload: GamePayload = { spellId, seed: this.seed };
    this.scene.start(SCENE.game, payload);
  }

  private openUpgrades(): void {
    this.leave(SCENE.upgrades);
  }

  private openMenu(): void {
    this.leave(SCENE.intro);
  }

  private leave(scene: string): void {
    if (this.started) return;
    this.started = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(scene);
  }
}
