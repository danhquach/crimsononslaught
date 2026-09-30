import Phaser from 'phaser';
import { CURRENCY_NAME, MILESTONES, UPGRADES, type Upgrade } from '../config/meta';
import { SAVE_REGISTRY_KEY, SCENE } from '../core/scenePayloads';
import { emptySave, isSave, serializeSave, type Save } from '../core/save';
import { buyUpgrade, canBuy, isUnlocked, nextCost, upgradeRank } from '../core/upgrades';
import { storeSaveJson } from '../storage/localSave';
import { audioOf } from '../render/audio';
import { attachMenuInput, attachPadButtons, type MenuItem } from './input';
import {
  addHintLine,
  addMenuRow,
  addMenuTitle,
  drawMenuBackdrop,
  drawPanel,
  type MenuRow,
} from './menuUi';

const PANEL_X = 40;
const PANEL_Y = 108;
const ROW_TOP = 122;
const ROW_HEIGHT = 54;
const LEFT = 64;
const BUY_X = 860;
const BUTTONS_Y = 476;

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
    // The menu track carries across every menu screen (CO-157); asking again is a no-op.
    audioOf(this).playMusic('music.menu');
    this.leaving = false;
    this.wipeArmed = false;
    const { width } = this.scale;
    const save = this.save;

    drawMenuBackdrop(this, 'quiet');
    addMenuTitle(this, width / 2, 40, 'Upgrades');
    this.add
      .text(width / 2, 84, `${CURRENCY_NAME}: ${save.currency.toLocaleString('en-US')}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '22px',
        color: '#ffa040',
      })
      .setOrigin(0.5);

    drawPanel(this, PANEL_X, PANEL_Y, width - PANEL_X * 2, UPGRADES.length * ROW_HEIGHT + 20);
    const items: MenuItem[] = UPGRADES.map((upgrade, i) =>
      this.addRow(upgrade, save, ROW_TOP + i * ROW_HEIGHT),
    );

    const backRow = addMenuRow(this, {
      kind: 'bar',
      label: 'Back  (Esc)',
      x: 150,
      y: BUTTONS_Y,
      width: 200,
      onConfirm: () => this.back(),
    });
    const wipeRow = addMenuRow(this, {
      kind: 'bar',
      label: 'Wipe progress',
      x: width - 210,
      y: BUTTONS_Y,
      width: 320,
      onConfirm: () => this.onWipePressed(wipeRow),
    });
    items.push(backRow, wipeRow);
    attachMenuInput(this, items);
    addHintLine(this, 'click, Esc to go back, or a gamepad (A select, B back)');

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.back();
    });
    attachPadButtons(this, { B: () => this.back() });
  }

  /**
   * Buy one rank, or refuse for `canBuy`'s reason. Public so a browser test can
   * drive the shop without pixel-hunting; the Buy button calls this too.
   */
  buy(upgradeId: string): boolean {
    const result = buyUpgrade(this.save, upgradeId);
    if (!result.ok) return false;
    audioOf(this).play('ui.confirm');
    this.commit(result.save);
    return true;
  }

  /**
   * Wipe every trace of progress and start a fresh save. The button asks twice;
   * this does not. The player name is kept (CO-165): a wipe clears progress,
   * not who is playing.
   */
  wipe(): void {
    const fresh = emptySave();
    this.commit({ ...fresh, profile: { ...fresh.profile, name: this.save.profile.name } });
  }

  private addRow(upgrade: Upgrade, save: Save, y: number): MenuRow {
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

    const buy = addMenuRow(this, {
      kind: 'bar',
      label: 'Buy',
      x: BUY_X,
      y: y + 12,
      width: 90,
      onConfirm: () => this.buy(upgrade.id),
    });
    buy.setEnabled(reason === undefined);
    return buy;
  }

  /** First press arms the wipe and relabels the button; the second wipes. Leaving the scene disarms it. */
  private onWipePressed(button: MenuRow): void {
    audioOf(this).play('ui.confirm');
    if (!this.wipeArmed) {
      this.wipeArmed = true;
      button.setLabel('Really wipe? Click again');
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
    audioOf(this).play('ui.back');
    this.scene.start(SCENE.spellSelect);
  }
}
