import Phaser from 'phaser';
import { SPELL_CARDS, SPELL_IDS, spellIdForKey, type SpellId } from '../config/spells';
import { SCENE, SEED_REGISTRY_KEY, type GamePayload } from '../core/scenePayloads';
import { attachMenuInput, type MenuItem } from './input';

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
      .text(width / 2, 60, 'Crimson Onslaught', {
        fontFamily: 'Georgia, serif',
        fontSize: '56px',
        color: '#dc143c',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 112, 'Choose a spell  ·  click a card, press 1–4, or use a gamepad', {
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
    attachMenuInput(this, items);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const spellId = spellIdForKey(event.key);
      if (spellId) this.startGame(spellId);
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
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => highlight(true));
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => highlight(false));
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.startGame(spellId));

    return { setSelected: highlight, confirm: () => this.startGame(spellId) };
  }

  /** Idempotent: a click and a key press in the same frame start exactly one run. */
  private startGame(spellId: SpellId): void {
    if (this.started) return;
    this.started = true;
    const payload: GamePayload = { spellId, seed: this.seed };
    this.scene.start(SCENE.game, payload);
  }
}
