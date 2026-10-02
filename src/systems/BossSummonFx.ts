import Phaser from 'phaser';
import { BOSS_SUMMON } from '../config/boss';
import { BOSS_SLAM_WARN_DEPTH, BOSS_SUMMON_FX } from '../config/fx';
import { ATLAS_PAGES } from '../config/frames';
import type { Vec2 } from '../core/enemy';
import type { Boss } from '../entities/Boss';
import { showEffect } from '../render/animate';

/**
 * Summon's look (CO-224): through the wind-up one circle loops on the floor at
 * each point the pack will appear, and as the pack lands a burst plays once at
 * each point that spawned. Both sit under every entity, at the slam warning's
 * depth. With no atlas, or without the clips, nothing is shown.
 */
export class BossSummonFx {
  private readonly circles: Phaser.GameObjects.Sprite[] = [];
  private readonly bursts: Phaser.GameObjects.Sprite[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const page = ATLAS_PAGES[0].key;
    const sprite = (alpha: number): Phaser.GameObjects.Sprite =>
      scene.add.sprite(0, 0, page).setDepth(BOSS_SLAM_WARN_DEPTH).setAlpha(alpha).setVisible(false);
    for (let i = 0; i < BOSS_SUMMON.packSize; i += 1) {
      this.circles.push(sprite(BOSS_SUMMON_FX.circleAlpha));
      const burst = sprite(1);
      burst.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => burst.setVisible(false));
      this.bursts.push(burst);
    }
  }

  /** Circles showing right now; a test hook. */
  get circlesVisible(): number {
    return this.circles.filter((c) => c.visible).length;
  }

  /**
   * One frame: show a circle at each of `boss`'s locked points through a summon's
   * wind-up, or hide them. Driven from `GameScene.simulate`.
   */
  update(boss: Boss | null): void {
    const points: readonly Vec2[] =
      boss !== null && this.scene.anims.exists(BOSS_SUMMON_FX.circle)
        ? boss.lockedSummonPoints
        : [];
    this.circles.forEach((circle, i) => {
      const at = points[i];
      if (!at) {
        if (circle.visible) circle.anims.stop();
        circle.setVisible(false);
        return;
      }
      if (!circle.visible) {
        circle.setVisible(true);
        circle.anims.stop();
        showEffect(circle, BOSS_SUMMON_FX.circle);
      }
      circle.setPosition(at.x, at.y);
    });
  }

  /** A burst at `at`, once, as a pack member lands there. */
  burst(at: Readonly<Vec2>, index: number): void {
    const sprite = this.bursts[index];
    if (!sprite || !this.scene.anims.exists(BOSS_SUMMON_FX.burst)) return;
    sprite.setVisible(true).setPosition(at.x, at.y);
    sprite.anims.stop();
    if (!showEffect(sprite, BOSS_SUMMON_FX.burst)) sprite.setVisible(false);
  }
}
