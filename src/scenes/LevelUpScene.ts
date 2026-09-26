import Phaser from 'phaser';
import {
  LEVEL_UP_EVENT,
  offerIndexForKey,
  type LevelUpPickPayload,
  type OfferCard,
} from '../core/levelUp';
import { SKIP_REROLL_BONUS } from '../config/offerActions';
import type { OfferActionCounts } from '../core/offerActions';
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
 * #228: Reroll, Skip and Ban sit in a row under the cards, clear of a spell
 * row's bottom edge (y 470), so the cards and their number keys never move.
 * The row is narrow enough to clear the HUD's loadout slots at bottom left.
 */
const BUTTON_Y = 504;
const BUTTON_WIDTH = 150;
const BUTTON_HEIGHT = 38;
const BUTTON_GAP = 20;
const BUTTON_LABEL_SHIFT = 8;
const BUTTON_TEXT = '#ffffff';
const BUTTON_TEXT_OFF = '#666666';
const BUTTON_STROKE = 0x888888;
const BUTTON_STROKE_OFF = 0x444444;
/** Ban mode's colour: the Ban button's rim while it waits for a card. */
const BAN_COLOR = 0xdc143c;

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
 *
 * A level-up's payload also carries the run's Reroll and Ban counts (#228),
 * which add Reroll (R), Skip (S) and Ban (B) buttons under the cards; arrows +
 * Enter reach them and the cards alike. Ban is a mode: press it, then pick the
 * card to ban; Esc or Ban again cancels. The overlay only asks — Reroll and
 * Ban are `LEVEL_UP_EVENT`s Game answers by relaunching this scene with the new
 * offer (or closing it), and Skip closes it like a pick.
 */
export class LevelUpScene extends Phaser.Scene {
  private cards: readonly OfferCard[] = [];
  private actions: OfferActionCounts | undefined;
  /** Set once this overlay has asked Game for something; everything after is ignored. */
  private acted = false;
  private banning = false;
  private setBanning: (on: boolean) => void = () => undefined;

  constructor() {
    super(SCENE.levelUp);
  }

  init(data: unknown): void {
    this.cards = isLevelUpPayload(data) ? data.offer : [];
    this.actions = isLevelUpPayload(data) ? data.actions : undefined;
    // Phaser replays the last launch payload on a payload-less launch; clear it.
    this.scene.settings.data = {};
  }

  /** What the overlay shows and whether it waits for a card to ban; the browser suite reads it. */
  get view(): {
    cards: readonly OfferCard[];
    actions: OfferActionCounts | undefined;
    banning: boolean;
  } {
    return { cards: this.cards, actions: this.actions, banning: this.banning };
  }

  create(): void {
    this.acted = false;
    this.banning = false;
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

    // A relic's offer can hold charge cards (#228) but never Reroll or Ban.
    const relic =
      this.actions === undefined &&
      this.cards.every((card) => card.kind === 'relic' || card.kind === 'charge');
    this.add
      .text(width / 2, 70, relic ? 'Relic found!' : 'Level up!', {
        fontFamily: 'Georgia, serif',
        fontSize: '48px',
        color: '#dc143c',
      })
      .setOrigin(0.5);
    const keys = this.cards.length === 1 ? '1' : `1–${this.cards.length}`;
    const choose = relic ? 'Choose a buff for the rest of the run' : 'Choose an upgrade';
    const hint = `${choose}  ·  click a card, press ${keys}, or use a gamepad`;
    const subtitle = this.add
      .text(width / 2, 118, hint, {
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
    if (this.actions) items.push(...this.addActionButtons(this.actions, subtitle, hint));
    attachMenuInput(this, items, { keyboard: true });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const index = offerIndexForKey(event.key, this.cards.length);
      const card = index === undefined ? undefined : this.cards[index];
      if (card) this.choose(card);
      else if (this.actions && !event.repeat) this.onActionKey(event.key);
    });
  }

  /** R, S and B press their buttons; Esc leaves ban mode. */
  private onActionKey(key: string): void {
    const lower = key.toLowerCase();
    if (lower === 'r') this.reroll();
    else if (lower === 's') this.skip();
    else if (lower === 'b') this.toggleBan();
    else if (key === 'Escape' && this.banning) this.setBanning(false);
  }

  /** Reroll (n), Skip and Ban (n) in a row under the cards, greyed out at 0. */
  private addActionButtons(
    actions: OfferActionCounts,
    subtitle: Phaser.GameObjects.Text,
    hint: string,
  ): MenuItem[] {
    const { width } = this.scale;
    const rowWidth = 3 * BUTTON_WIDTH + 2 * BUTTON_GAP;
    const x = (i: number): number =>
      (width - rowWidth) / 2 + BUTTON_WIDTH / 2 + i * (BUTTON_WIDTH + BUTTON_GAP);
    const reroll = this.addButton(
      x(0),
      'R',
      `Reroll (${actions.rerolls})`,
      actions.rerolls > 0,
      () => this.reroll(),
    );
    const skip = this.addButton(x(1), 'S', `Skip (+${SKIP_REROLL_BONUS} reroll)`, true, () =>
      this.skip(),
    );
    const ban = this.addButton(x(2), 'B', `Ban (${actions.bans})`, actions.bans > 0, () =>
      this.toggleBan(),
    );
    this.setBanning = (on) => {
      this.banning = on;
      ban.setBanning(on);
      subtitle
        .setText(
          on ? 'Choose a card to ban for the rest of the run  ·  Esc or Ban to cancel' : hint,
        )
        .setColor(on ? cssColor(BAN_COLOR) : '#cccccc');
    };
    return [reroll, skip, ban];
  }

  private addButton(
    x: number,
    key: string,
    label: string,
    enabled: boolean,
    confirm: () => void,
  ): MenuItem & { setBanning(on: boolean): void } {
    const stroke = enabled ? BUTTON_STROKE : BUTTON_STROKE_OFF;
    const frame = this.add
      .rectangle(x, BUTTON_Y, BUTTON_WIDTH, BUTTON_HEIGHT, CARD_FILL)
      .setStrokeStyle(2, stroke);
    const color = enabled ? BUTTON_TEXT : BUTTON_TEXT_OFF;
    this.add
      .text(x - BUTTON_WIDTH / 2 + 10, BUTTON_Y, key, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#888888',
      })
      .setOrigin(0, 0.5);
    this.add
      // Centred in the room right of the key letter, so a long label never touches it.
      .text(x + BUTTON_LABEL_SHIFT, BUTTON_Y, label, {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color,
      })
      .setOrigin(0.5);

    let selected = false;
    let banning = false;
    const draw = (): void => {
      const rim = banning ? BAN_COLOR : stroke;
      frame
        .setFillStyle(selected && enabled ? CARD_FILL_HOVER : CARD_FILL)
        .setStrokeStyle(selected || banning ? 4 : 2, rim);
    };
    if (enabled) {
      frame.setInteractive({ useHandCursor: true });
      frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
        selected = true;
        draw();
        audioOf(this).play('ui.move');
      });
      frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        selected = false;
        draw();
      });
      frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, confirm);
    }
    return {
      setSelected: (on) => {
        selected = on;
        draw();
      },
      // A greyed-out button does nothing, however it is reached.
      confirm: () => {
        if (enabled) confirm();
      },
      setBanning: (on) => {
        banning = on;
        draw();
      },
    };
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
    frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.choose(card));

    return { setSelected: highlight, confirm: () => this.choose(card) };
  }

  /** A card chosen: banned in ban mode, else picked. */
  private choose(card: OfferCard): void {
    if (this.banning) this.ask(LEVEL_UP_EVENT.ban, { offerId: card.id });
    else if (this.ask(LEVEL_UP_EVENT.pick, { offerId: card.id })) this.close();
  }

  private reroll(): void {
    if ((this.actions?.rerolls ?? 0) > 0) this.ask(LEVEL_UP_EVENT.reroll);
  }

  private skip(): void {
    if (this.actions && this.ask(LEVEL_UP_EVENT.skip)) this.close();
  }

  private toggleBan(): void {
    if (this.acted || (this.actions?.bans ?? 0) <= 0) return;
    audioOf(this).play('ui.move');
    this.setBanning(!this.banning);
  }

  /**
   * Send Game one request. Only the first counts: a click and a key press in
   * the same frame pick, reroll or ban exactly once. Returns whether it sent.
   */
  private ask(event: string, payload?: LevelUpPickPayload): boolean {
    if (this.acted) return false;
    this.acted = true;
    audioOf(this).play('ui.confirm');
    this.scene.get(SCENE.game).events.emit(event, payload);
    return true;
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
  charge: 'Charge',
};

/** `Rank 2/5`, `Rank 2` for a passive or relic that never caps, nothing for a spell. */
function rankLabel(card: OfferCard): string {
  if (card.rank === undefined) return '';
  return card.maxRank === undefined ? `Rank ${card.rank}` : `Rank ${card.rank}/${card.maxRank}`;
}
