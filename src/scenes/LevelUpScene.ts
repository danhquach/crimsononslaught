import Phaser from 'phaser';
import {
  LEVEL_UP_EVENT,
  offerIndexForKey,
  type LevelUpPickPayload,
  type OfferCard,
} from '../core/levelUp';
import { CARD_FILL, CARD_FILL_HOVER, cssColor, offerColor } from '../core/offerColors';
import { SCENE, isLevelUpPayload } from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import { addSpellIcon } from '../render/spellIcon';
import { attachMenuInput, type MenuItem } from './input';

const CARD_WIDTH = 220;
const CARD_HEIGHT = 260;
/**
 * CO-155: a spell card's icon band above its name — a 2x (64 px) icon and its
 * margins. An offer of spells grows every card by it; passive and relic cards
 * keep their height and layout.
 */
const ICON_BAND = 50;
const ICON_SCALE = 2;
const CARD_GAP = 28;
const CARD_PADDING = 14;
const BACKDROP_ALPHA = 0.65;

/**
 * Level-up overlay: launched by Game over its own paused scene with 1–3 offer
 * cards — a new spell for an open slot, or a rank of a passive (Phase 2 spec
 * §7.1). Click a card or press its number key (1–3) to pick; the pick is
 * emitted as `LEVEL_UP_EVENT.pick` on the Game scene's emitter, then Game is
 * resumed and this scene stops. The HUD is a
 * separate parallel scene and stays visible throughout. A gamepad moves the
 * selection with the D-pad or left stick and picks with A.
 *
 * A relic's offer (#227) is the same overlay with relic cards and its own
 * title, so every flow that answers a level-up answers a relic too.
 */
export class LevelUpScene extends Phaser.Scene {
  private cards: readonly OfferCard[] = [];
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

    const relic = this.cards.every((card) => card.kind === 'relic');
    this.add
      .text(width / 2, 70, relic ? 'Relic found!' : 'Level up!', {
        fontFamily: 'Georgia, serif',
        fontSize: '48px',
        color: '#dc143c',
      })
      .setOrigin(0.5);
    const keys = this.cards.length === 1 ? '1' : `1–${this.cards.length}`;
    const choose = relic ? 'Choose a buff for the rest of the run' : 'Choose an upgrade';
    this.add
      .text(width / 2, 118, `${choose}  ·  click a card, press ${keys}, or use a gamepad`, {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    const n = this.cards.length;
    const rowWidth = n * CARD_WIDTH + (n - 1) * CARD_GAP;
    const firstX = (width - rowWidth) / 2 + CARD_WIDTH / 2;
    // One offer never mixes spells and passives (spec §7.1), so the row shares one height.
    const cardHeight =
      CARD_HEIGHT + (this.cards.some((card) => card.kind === 'active') ? ICON_BAND : 0);
    const cardY = 160 + cardHeight / 2;
    const items = this.cards.map((card, i) =>
      this.addCard(firstX + i * (CARD_WIDTH + CARD_GAP), cardY, cardHeight, card, i + 1),
    );
    attachMenuInput(this, items);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const index = offerIndexForKey(event.key, this.cards.length);
      const card = index === undefined ? undefined : this.cards[index];
      if (card) this.pick(card);
    });
  }

  private addCard(x: number, y: number, height: number, card: OfferCard, hotkey: number): MenuItem {
    const innerWidth = CARD_WIDTH - CARD_PADDING * 2;
    const left = -CARD_WIDTH / 2 + CARD_PADDING;
    const top = -height / 2 + CARD_PADDING;
    // CO-164: the kind's colour (a spell's element, a passive's, a relic's) on
    // the border and the kind label, at rest and under hover alike.
    const stroke = offerColor(card.kind, card.id);
    // A spell shows its icon (CO-155) between the hotkey and its name.
    const icon =
      card.kind === 'active'
        ? addSpellIcon(
            this,
            0,
            top + 40,
            { id: card.id, name: card.name, color: card.color ?? stroke },
            ICON_SCALE,
          )
        : [];
    const band = icon.length > 0 ? ICON_BAND : 0;

    const frame = this.add.rectangle(0, 0, CARD_WIDTH, height, CARD_FILL).setStrokeStyle(2, stroke);
    const key = this.add.text(left, top, `${hotkey}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#888888',
    });
    const rank = this.add
      .text(left + innerWidth, top, rankLabel(card), {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(1, 0);
    const name = this.add.text(left, top + 30 + band, card.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#ffffff',
      wordWrap: { width: innerWidth },
    });
    const kind = this.add.text(left, top + 92 + band, KIND_LABEL[card.kind], {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: cssColor(stroke),
    });
    const description = this.add.text(left, top + 120 + band, card.description, {
      fontFamily: 'Georgia, serif',
      fontSize: '15px',
      color: '#dddddd',
      wordWrap: { width: innerWidth },
      lineSpacing: 3,
    });

    this.add.container(x, y, [frame, ...icon, key, rank, name, kind, description]);

    // Gamepad selection reuses the hover look, so a card reads the same however
    // it was reached.
    const highlight = (on: boolean): void => {
      frame.setFillStyle(on ? CARD_FILL_HOVER : CARD_FILL).setStrokeStyle(on ? 4 : 2, stroke);
    };

    frame.setInteractive({ useHandCursor: true });
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      highlight(true);
      audioOf(this).play('ui.move');
    });
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => highlight(false));
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.pick(card));

    return { setSelected: highlight, confirm: () => this.pick(card) };
  }

  /** Idempotent: a click and a key press in the same frame pick exactly one card. */
  private pick(card: OfferCard): void {
    if (this.picked) return;
    this.picked = true;
    audioOf(this).play('ui.confirm');
    const payload: LevelUpPickPayload = { offerId: card.id };
    this.scene.get(SCENE.game).events.emit(LEVEL_UP_EVENT.pick, payload);
    this.close();
  }

  private close(): void {
    this.scene.resume(SCENE.game);
    this.scene.stop();
  }
}

const KIND_LABEL: Readonly<Record<OfferCard['kind'], string>> = {
  active: 'New spell',
  passive: 'Passive',
  relic: 'Relic',
};

/** `Rank 2/5`, `Rank 2` for a passive or relic that never caps, nothing for a spell. */
function rankLabel(card: OfferCard): string {
  if (card.rank === undefined) return '';
  return card.maxRank === undefined ? `Rank ${card.rank}` : `Rank ${card.rank}/${card.maxRank}`;
}
