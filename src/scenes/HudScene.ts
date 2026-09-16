import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import {
  INITIAL_HUD,
  applyRunEvent,
  bossBarVisible,
  formatTimer,
  fraction,
  type HudModel,
} from '../core/hudModel';
import { onRunEvents, type RunEvent } from '../core/runEvents';
import { SCENE } from '../core/scenePayloads';

const MARGIN = 16;
const BAR_WIDTH = 240;
const BAR_BG = 0x222222;
const HP_COLOR = 0xdc143c;
const XP_COLOR = PLACEHOLDERS.gem.color;
const BOSS_COLOR = PLACEHOLDERS.boss.color;
const LABEL_STYLE = { fontFamily: 'monospace', fontSize: '14px', color: '#eeeeee' } as const;

/** Background + fill + label; `set` drives the fill by fraction so callers never touch pixels. */
class Bar {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
  ) {
    this.bg = scene.add
      .rectangle(x, y, width, height, BAR_BG)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x555555);
    this.fill = scene.add.rectangle(x, y, width, height, color).setOrigin(0, 0);
    this.label = scene.add.text(x + width + 8, y + height / 2, '', LABEL_STYLE).setOrigin(0, 0.5);
  }

  set(fraction01: number, text: string): void {
    this.fill.setScale(fraction01, 1);
    this.label.setText(text);
  }

  setVisible(visible: boolean): void {
    this.bg.setVisible(visible);
    this.fill.setVisible(visible);
    this.label.setVisible(visible);
  }
}

/**
 * HUD overlay: timer, HP bar, XP bar + level, kill count, boss HP bar.
 *
 * Runs as a parallel scene launched by Game, so it keeps rendering while Game
 * is paused (level-up overlay). It is driven purely by `RunEvent`s on the Game
 * scene's emitter (see `core/runEvents.ts`); it never reads GameScene fields.
 */
export class HudScene extends Phaser.Scene {
  private model: HudModel = INITIAL_HUD;
  private timerText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private hpBar!: Bar;
  private xpBar!: Bar;
  private bossBar!: Bar;

  constructor() {
    super(SCENE.hud);
  }

  create(): void {
    this.model = INITIAL_HUD;
    const { width } = this.scale;

    this.hpBar = new Bar(this, MARGIN, MARGIN, BAR_WIDTH, 18, HP_COLOR);
    this.xpBar = new Bar(this, MARGIN, MARGIN + 24, BAR_WIDTH, 10, XP_COLOR);
    this.timerText = this.add
      .text(width / 2, MARGIN - 4, '', { ...LABEL_STYLE, fontSize: '28px' })
      .setOrigin(0.5, 0);
    this.killsText = this.add.text(width - MARGIN, MARGIN, '', LABEL_STYLE).setOrigin(1, 0);
    this.bossBar = new Bar(this, width / 2 - 200, 56, 400, 14, BOSS_COLOR);
    this.render();

    this.subscribe();
  }

  /** Listen to every run event on the Game emitter; detach on our own shutdown. */
  private subscribe(): void {
    const unsubscribe = onRunEvents(this.scene.get(SCENE.game).events, (e) => this.apply(e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private apply(event: RunEvent): void {
    this.model = applyRunEvent(this.model, event);
    this.render();
  }

  private render(): void {
    const m = this.model;
    this.timerText.setText(formatTimer(m.elapsedMs));
    this.hpBar.set(fraction(m.hp, m.maxHp), `HP ${Math.ceil(m.hp)} / ${m.maxHp}`);
    this.xpBar.set(fraction(m.xp, m.xpToNext), `Lv ${m.level}`);
    this.killsText.setText(`Kills ${m.kills}`);
    this.bossBar.setVisible(bossBarVisible(m));
    this.bossBar.set(fraction(m.bossHp, m.bossMaxHp), 'Boss');
  }
}
