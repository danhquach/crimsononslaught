import Phaser from 'phaser';
import { CURRENCY_NAME, MILESTONES, UPGRADES, type Upgrade } from '../config/meta';
import { SAVE_REGISTRY_KEY, SCENE } from '../core/scenePayloads';
import { emptySave, isSave, serializeSave, type Save } from '../core/save';
import { buyUpgrade, canBuy, isUnlocked, nextCost, upgradeRank } from '../core/upgrades';
import { storeSaveJson } from '../storage/localSave';
import { attachMenuInput, type MenuItem } from './input';
import { addTextButton, textButtonItem } from './ui';

const ROW_TOP = 128;
const ROW_HEIGHT = 54;
const LEFT = 60;
const BUY_X = 860;

/**
 * Permanent upgrade shop (CO-101): one row per upgrade with its rank, what the
 * next rank costs and a Buy button; the balance at the top; Back and a
 * two-press "Wipe progress" at the bottom. Reached from SpellSelect, returns
 * there. Every purchase goes through `core/upgrades.ts`, is written to the
 * registry and to storage at once, and the scene restarts to redraw.
 */
export class UpgradesScene extends Phaser.Scene {
  private leaving = false;
  private wipeArmed = false;

  constructor() {
    super(SCENE.upgrades);
  }

  /** The save as this screen sees it; the browser suite reads and asserts on it. */
  get save(): Save {
    const stored: unknown = this.registry.get(SAVE_REGISTRY_KEY);
    return isSave(stored) ? stored : emptySave();
  }

  create(): void {
    this.leaving = false;
    this.wipeArmed = false;
    const { width, height } = this.scale;
    const save = this.save;

    this.add
      .text(width / 2, 44, 'Upgrades', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        color: '#dc143c',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 90, `${CURRENCY_NAME}: ${save.currency.toLocaleString('en-US')}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '22px',
        color: '#ffa040',
      })
      .setOrigin(0.5);

    const items: MenuItem[] = UPGRADES.map((upgrade, i) =>
      this.addRow(upgrade, save, ROW_TOP + i * ROW_HEIGHT),
    );

    const backButton = addTextButton(this, 140, height - 36, 'Back  (Esc)', () => this.back(), {
      fontSize: '20px',
      padding: { x: 12, y: 6 },
    });
    const wipeButton = addTextButton(
      this,
      width - 160,
      height - 36,
      'Wipe progress',
      () => this.onWipePressed(wipeButton),
      { fontSize: '20px', padding: { x: 12, y: 6 }, color: '#ff6666' },
    );
    items.push(textButtonItem(backButton, () => this.back()));
    items.push(textButtonItem(wipeButton, () => this.onWipePressed(wipeButton)));
    attachMenuInput(this, items);

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.back();
    });
  }

  /**
   * Buy one rank, or refuse for `canBuy`'s reason. Public so a browser test can
   * drive the shop without pixel-hunting; the Buy button calls this too.
   */
  buy(upgradeId: string): boolean {
    const result = buyUpgrade(this.save, upgradeId);
    if (!result.ok) return false;
    this.commit(result.save);
    return true;
  }

  /** Wipe every trace of progress and start a fresh save. The button asks twice; this does not. */
  wipe(): void {
    this.commit(emptySave());
  }

  private addRow(upgrade: Upgrade, save: Save, y: number): MenuItem {
    const owned = upgradeRank(save, upgrade.id);
    const cost = nextCost(save, upgrade.id);
    const reason = canBuy(save, upgrade.id);
    const unlocked = isUnlocked(save, upgrade);

    this.add.text(LEFT, y, `${upgrade.name}  ${owned}/${upgrade.maxRank}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: unlocked ? '#ffffff' : '#777777',
    });
    this.add.text(LEFT, y + 26, upgrade.description, {
      fontFamily: 'Georgia, serif',
      fontSize: '15px',
      color: unlocked ? '#bbbbbb' : '#666666',
    });

    let status: string;
    if (!unlocked) {
      const milestone = MILESTONES.find((m) => m.id === upgrade.requires);
      status = `Locked: ${milestone?.description ?? upgrade.requires}`;
    } else if (cost === undefined) {
      status = 'MAX';
    } else {
      status = `${cost.toLocaleString('en-US')} ${CURRENCY_NAME}`;
    }
    this.add
      .text(BUY_X - 70, y + 12, status, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: reason === undefined ? '#ffa040' : '#888888',
      })
      .setOrigin(1, 0.5);

    const canAfford = reason === undefined;
    const button = addTextButton(this, BUY_X, y + 12, 'Buy', () => this.buy(upgrade.id), {
      fontSize: '18px',
      padding: { x: 14, y: 4 },
      color: canAfford ? '#ffffff' : '#666666',
    });
    if (!canAfford) button.disableInteractive().setAlpha(0.5);
    return textButtonItem(button, () => this.buy(upgrade.id));
  }

  /** First press arms the wipe and relabels the button; the second wipes. Leaving the scene disarms it. */
  private onWipePressed(button: Phaser.GameObjects.Text): void {
    if (!this.wipeArmed) {
      this.wipeArmed = true;
      button.setText('Really wipe? Click again');
      return;
    }
    this.wipe();
  }

  /** Store the new save, then redraw from it. */
  private commit(save: Save): void {
    this.registry.set(SAVE_REGISTRY_KEY, save);
    if (!storeSaveJson(serializeSave(save))) console.warn('[save] could not store progress');
    if (this.leaving) return;
    this.leaving = true;
    this.scene.restart();
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(SCENE.spellSelect);
  }
}
