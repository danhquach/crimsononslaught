import Phaser from 'phaser';
import {
  LEVEL_UP_EVENT,
  perkIndexForKey,
  type LevelUpPickPayload,
  type PerkCard,
} from '../core/levelUp';
import { SCENE, isLevelUpPayload } from '../core/scenePayloads';
import { attachMenuInput, type MenuItem } from './input';

const CARD_WIDTH = 220;
const CARD_HEIGHT = 260;
const CARD_GAP = 28;
const CARD_PADDING = 14;
const CARD_FILL = 0x1a1a1a;
const CARD_FILL_HOVER = 0x2a2a2a;
const CARD_STROKE = 0xdc143c;
const BACKDROP_ALPHA = 0.65;

/**
 * Level-up overlay: launched by Game over its own paused scene with 1–3 perk
 * cards (name, branch, rank x/y, description). Click a card or press its number
 * key (1–3) to pick; the pick is emitted as `LEVEL_UP_EVENT.pick` on the Game
 * scene's emitter, then Game is resumed and this scene stops. The HUD is a
 * separate parallel scene and stays visible throughout. A gamepad moves the
 * selection with the D-pad or left stick and picks with A.
 */
export class LevelUpScene extends Phaser.Scene {
  private cards: readonly PerkCard[] = [];
  private picked = false;

  constructor() {
    super(SCENE.levelUp);
  }

  init(data: unknown): void {
    this.cards = isLevelUpPayload(data) ? data.offer : [];
    // Phaser replays the last launch payload on a payload-less launch; clear it.
    this.scene.settings.data = {};
  }

  create(): void {
    this.picked = false;
    if (this.cards.length === 0) {
      // Game never launches us with an empty offer (see `resolveLevelUp`); if
      // something else does, never leave the run frozen behind an empty overlay.
      console.warn('[LevelUp] launched without a valid offer; resuming Game');
      this.close();
      return;
    }
    const { width, height } = this.scale;

    // Full-screen backdrop; interactive so clicks never reach Game objects underneath.
    this.add.rectangle(0, 0, width, height, 0x000000, BACKDROP_ALPHA).setOrigin(0).setInteractive();

    this.add
      .text(width / 2, 70, 'Level up!', {
        fontFamily: 'Georgia, serif',
        fontSize: '48px',
        color: '#dc143c',
      })
      .setOrigin(0.5);
    const keys = this.cards.length === 1 ? '1' : `1–${this.cards.length}`;
    this.add
      .text(width / 2, 118, `Choose a perk  ·  click a card, press ${keys}, or use a gamepad`, {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    const n = this.cards.length;
    const rowWidth = n * CARD_WIDTH + (n - 1) * CARD_GAP;
    const firstX = (width - rowWidth) / 2 + CARD_WIDTH / 2;
    const cardY = 160 + CARD_HEIGHT / 2;
    const items = this.cards.map((card, i) =>
      this.addCard(firstX + i * (CARD_WIDTH + CARD_GAP), cardY, card, i + 1),
    );
    attachMenuInput(this, items);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const index = perkIndexForKey(event.key, this.cards.length);
      const card = index === undefined ? undefined : this.cards[index];
      if (card) this.pick(card);
    });
  }

  private addCard(x: number, y: number, card: PerkCard, hotkey: number): MenuItem {
    const innerWidth = CARD_WIDTH - CARD_PADDING * 2;
    const left = -CARD_WIDTH / 2 + CARD_PADDING;
    const top = -CARD_HEIGHT / 2 + CARD_PADDING;

    const frame = this.add
      .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_FILL)
      .setStrokeStyle(2, CARD_STROKE);
    const key = this.add.text(left, top, `${hotkey}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#888888',
    });
    const rank = this.add
      .text(left + innerWidth, top, `Rank ${card.rank}/${card.maxRank}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(1, 0);
    const name = this.add.text(left, top + 30, card.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#ffffff',
      wordWrap: { width: innerWidth },
    });
    const branch = this.add.text(left, top + 92, card.branch, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#dc143c',
    });
    const description = this.add.text(left, top + 120, card.description, {
      fontFamily: 'Georgia, serif',
      fontSize: '15px',
      color: '#dddddd',
      wordWrap: { width: innerWidth },
      lineSpacing: 3,
    });

    this.add.container(x, y, [frame, key, rank, name, branch, description]);

    // Gamepad selection reuses the hover look, so a card reads the same however
    // it was reached.
    const highlight = (on: boolean): void => {
      frame.setFillStyle(on ? CARD_FILL_HOVER : CARD_FILL).setStrokeStyle(on ? 4 : 2, CARD_STROKE);
    };

    frame.setInteractive({ useHandCursor: true });
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => highlight(true));
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => highlight(false));
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.pick(card));

    return { setSelected: highlight, confirm: () => this.pick(card) };
  }

  /** Idempotent: a click and a key press in the same frame pick exactly one perk. */
  private pick(card: PerkCard): void {
    if (this.picked) return;
    this.picked = true;
    const payload: LevelUpPickPayload = { perkId: card.id };
    this.scene.get(SCENE.game).events.emit(LEVEL_UP_EVENT.pick, payload);
    this.close();
  }

  private close(): void {
    this.scene.resume(SCENE.game);
    this.scene.stop();
  }
}
