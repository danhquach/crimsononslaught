import Phaser from 'phaser';
import { BOSS_CHAIN_FX, BOSS_TRAIL_DEPTH, FX_DEPTH } from '../config/fx';
import { ATLAS_PAGES } from '../config/frames';
import type { Boss } from '../entities/Boss';
import { showEffect } from '../render/animate';

/**
 * The enraged boss's chain charge look (CO-225): a red streak trailing it
 * through every enraged charge, and a four-spike glint that plays once over it
 * on each chained telegraph. Two plain sprites, made once; the trail follows the
 * boss each simulate tick and is hidden outside an enraged charge. With no
 * atlas, or without the clips, nothing is shown.
 */
export class BossChainFx {
  private readonly trail: Phaser.GameObjects.Sprite;
  private readonly glint: Phaser.GameObjects.Sprite;
  private readonly scene: Phaser.Scene;
  private plays = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const page = ATLAS_PAGES[0].key;
    this.trail = scene.add.sprite(0, 0, page).setDepth(BOSS_TRAIL_DEPTH).setVisible(false);
    this.glint = scene.add.sprite(0, 0, page).setDepth(FX_DEPTH).setVisible(false);
    this.glint.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.glint.setVisible(false));
  }

  /** Whether the trail is out; a test hook. */
  get trailVisible(): boolean {
    return this.trail.visible;
  }

  /** The clip the trail plays, or null while it is hidden; a test hook. */
  get trailClip(): string | null {
    return this.trail.visible ? (this.trail.anims.currentAnim?.key ?? null) : null;
  }

  /** The trail's turn in radians (zero is heading right); a test hook. */
  get trailRotation(): number {
    return this.trail.rotation;
  }

  /** Glints played so far; a test hook. */
  get flashPlays(): number {
    return this.plays;
  }

  /**
   * One frame: lay the trail behind `boss`, the live boss, while it charges
   * enraged along a locked line, or hide it. Driven from `GameScene.simulate`.
   */
  update(boss: Boss | null): void {
    const dir = boss?.chargeDir;
    if (
      !boss ||
      !dir ||
      !boss.isEnraged ||
      boss.phase !== 'charge' ||
      (dir.x === 0 && dir.y === 0) ||
      !this.scene.anims.exists(BOSS_CHAIN_FX.trail)
    ) {
      if (this.trail.visible) this.trail.anims.stop();
      this.trail.setVisible(false);
      return;
    }
    if (!this.trail.visible) {
      this.trail.setVisible(true);
      this.trail.anims.stop();
      showEffect(this.trail, BOSS_CHAIN_FX.trail);
      this.fit(this.trail, BOSS_CHAIN_FX.trailLengthPx);
    }
    const back = BOSS_CHAIN_FX.trailBackPx;
    this.trail.setPosition(boss.x - dir.x * back, boss.y - dir.y * back);
    this.trail.setRotation(Math.atan2(dir.y, dir.x));
  }

  /** The glint over `boss`, once, as a chained telegraph begins. */
  flash(boss: Boss): void {
    if (!this.scene.anims.exists(BOSS_CHAIN_FX.flash)) return;
    this.glint.setPosition(boss.x, boss.y);
    this.glint.anims.stop();
    if (!showEffect(this.glint, BOSS_CHAIN_FX.flash)) return;
    this.glint.setVisible(true);
    this.fit(this.glint, BOSS_CHAIN_FX.flashPx);
    this.plays += 1;
  }

  /** Sized from the art's own width, so a re-cut sheet keeps the same span. */
  private fit(sprite: Phaser.GameObjects.Sprite, widthPx: number): void {
    const width = sprite.frame.width;
    sprite.setScale(width > 0 ? widthPx / width : 1);
  }
}
