import Phaser from 'phaser';
import { BOSS } from '../config/boss';
import { BOSS_AURA, BOSS_AURA_DEPTH, BOSS_BURST, FX_DEPTH } from '../config/fx';
import { ATLAS_PAGES } from '../config/frames';
import type { Boss } from '../entities/Boss';
import { showEffect } from '../render/animate';

/**
 * What the enraged boss wears (#388): an ember ring that loops under it for the
 * rest of the fight, and a burst that plays once as it turns. Two plain sprites
 * rather than a tint or a scale on the boss, which every hit repaints and whose
 * scale would resize its Arcade body; the ring follows the boss each simulate
 * tick and is hidden when it dies or leaves. With no atlas nothing is shown.
 */
export class BossEnrageFx {
  private readonly aura: Phaser.GameObjects.Sprite;
  private readonly burst: Phaser.GameObjects.Sprite;
  private readonly scene: Phaser.Scene;
  private plays = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const page = ATLAS_PAGES[0].key;
    this.aura = scene.add.sprite(0, 0, page).setDepth(BOSS_AURA_DEPTH).setVisible(false);
    this.burst = scene.add.sprite(0, 0, page).setDepth(FX_DEPTH).setVisible(false);
    this.burst.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.burst.setVisible(false));
  }

  /** Whether the ring is out; a test hook. */
  get auraVisible(): boolean {
    return this.aura.visible;
  }

  /** The clip the ring plays, or null while it is hidden; a test hook. */
  get auraClip(): string | null {
    return this.aura.visible ? (this.aura.anims.currentAnim?.key ?? null) : null;
  }

  /** Bursts played so far; a test hook. */
  get burstPlays(): number {
    return this.plays;
  }

  /**
   * One frame: show the ring on `boss`, the live boss, and follow it, or hide it
   * when there is none or it is not enraged. Driven from `GameScene.simulate`.
   */
  update(boss: Boss | null): void {
    if (!boss || !boss.isEnraged || !this.scene.anims.exists(BOSS_AURA.clip)) {
      if (this.aura.visible) this.aura.anims.stop();
      this.aura.setVisible(false);
      return;
    }
    if (!this.aura.visible) {
      this.aura.setVisible(true);
      this.aura.anims.stop();
      showEffect(this.aura, BOSS_AURA.clip);
      this.fit(this.aura, BOSS_AURA.span);
    }
    this.aura.setPosition(boss.x, boss.y);
  }

  /** The burst at the boss, once, as it enrages. */
  play(boss: Boss): void {
    if (!this.scene.anims.exists(BOSS_BURST.clip)) return;
    this.burst.setVisible(true).setPosition(boss.x, boss.y);
    this.burst.anims.stop();
    if (!showEffect(this.burst, BOSS_BURST.clip)) return;
    this.fit(this.burst, BOSS_BURST.span);
    this.plays += 1;
  }

  /** Sized from the art's own width, so a re-cut sheet keeps the same span. */
  private fit(sprite: Phaser.GameObjects.Sprite, span: number): void {
    const width = sprite.frame.width;
    sprite.setScale(width > 0 ? (BOSS.radius * 2 * span) / width : 1);
  }
}
