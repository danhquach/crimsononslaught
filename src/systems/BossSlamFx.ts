import Phaser from 'phaser';
import { BOSS_SLAM, BOSS_LEAP } from '../config/boss';
import { BOSS_LEAP_FX, BOSS_SLAM_FX, BOSS_SLAM_WARN_DEPTH } from '../config/fx';
import { ART_BOXES, ATLAS_PAGES } from '../config/frames';
import { slamArtScale } from '../core/boss';
import type { Boss } from '../entities/Boss';
import { showEffect } from '../render/animate';

/**
 * The Ground slam's look (CO-222): through the wind-up a translucent red disc
 * and a bright rim mark the floor the slam will hit, following the boss, and on
 * the slam a ring of fire bursts once on the floor, under the boss and the
 * hero. All three share one scale, taken from the
 * rim's art box, so the rim's outer edge is the hit radius. With no atlas
 * nothing is shown.
 *
 * The same look serves the Leap (CO-232), built with `skill` 'leap': its
 * warning sits at the locked landing point, not the boss, through the leap's
 * wind-up, with the leap's own clips.
 */
export class BossSlamFx {
  private readonly skill: 'slam' | 'leap';
  private readonly look: typeof BOSS_SLAM_FX | typeof BOSS_LEAP_FX;
  private readonly fill: Phaser.GameObjects.Sprite;
  private readonly rim: Phaser.GameObjects.Sprite;
  private readonly shock: Phaser.GameObjects.Sprite;
  private readonly scene: Phaser.Scene;
  private readonly scale: number;
  private plays = 0;

  constructor(scene: Phaser.Scene, skill: 'slam' | 'leap' = 'slam') {
    this.scene = scene;
    this.skill = skill;
    this.look = skill === 'leap' ? BOSS_LEAP_FX : BOSS_SLAM_FX;
    this.scale = slamArtScale(
      ART_BOXES[this.look.rim].w,
      skill === 'leap' ? BOSS_LEAP.radius : BOSS_SLAM.radius,
    );
    const page = ATLAS_PAGES[0].key;
    const warn = (): Phaser.GameObjects.Sprite =>
      scene.add
        .sprite(0, 0, page)
        .setDepth(BOSS_SLAM_WARN_DEPTH)
        .setScale(this.scale)
        .setVisible(false);
    this.fill = warn().setAlpha(this.look.fillAlpha);
    this.rim = warn().setAlpha(this.look.rimAlpha);
    this.shock = scene.add
      .sprite(0, 0, page)
      .setDepth(BOSS_SLAM_WARN_DEPTH)
      .setScale(this.scale)
      .setAlpha(this.look.shockAlpha)
      .setVisible(false);
    this.shock.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.shock.setVisible(false));
  }

  /** Whether the warning is out; a test hook. */
  get warnVisible(): boolean {
    return this.rim.visible;
  }

  /** The clips the rim and disc play, or null while hidden; test hooks. */
  get rimClip(): string | null {
    return this.rim.visible ? (this.rim.anims.currentAnim?.key ?? null) : null;
  }

  get fillClip(): string | null {
    return this.fill.visible ? (this.fill.anims.currentAnim?.key ?? null) : null;
  }

  /** The drawn radius of the rim's outer edge, world px; a test hook. */
  get warnRadiusPx(): number {
    return (ART_BOXES[this.look.rim].w * this.rim.scaleX) / 2;
  }

  /** Shockwaves played so far; a test hook. */
  get shockPlays(): number {
    return this.plays;
  }

  /**
   * One frame: show the warning on `boss` through a slam's wind-up and follow
   * it, or hide it otherwise. Driven from `GameScene.simulate`.
   */
  update(boss: Boss | null): void {
    const warning =
      boss !== null &&
      boss.phase === 'windup' &&
      boss.skill === this.skill &&
      this.scene.anims.exists(this.look.rim);
    const at = this.skill === 'leap' ? boss?.lockedLeapPoint : boss;
    if (!warning || !at) {
      for (const sprite of [this.fill, this.rim]) {
        if (sprite.visible) sprite.anims.stop();
        sprite.setVisible(false);
      }
      return;
    }
    for (const [sprite, clip] of [
      [this.fill, this.look.fill],
      [this.rim, this.look.rim],
    ] as const) {
      if (!sprite.visible) {
        sprite.setVisible(true);
        sprite.anims.stop();
        showEffect(sprite, clip);
      }
      sprite.setPosition(at.x, at.y);
    }
  }

  /** The ring of fire at (`x`, `y`), once, as the slam lands. */
  impact(x: number, y: number): void {
    if (!this.scene.anims.exists(this.look.shock)) return;
    this.shock.setVisible(true).setPosition(x, y);
    this.shock.anims.stop();
    if (!showEffect(this.shock, this.look.shock)) return;
    this.plays += 1;
  }
}
