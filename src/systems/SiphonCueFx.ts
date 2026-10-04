import Phaser from 'phaser';
import { FX_DEPTH, SIPHON_CUE } from '../config/fx';
import { ATLAS_PAGES } from '../config/frames';
import { showEffect } from '../render/animate';

/**
 * Siphon's heal cue (CO-235): one sprite that rides the hero and plays a short
 * mote once each time `core/siphon.ts` says a cue is due, so the player sees the
 * heal working. A cue due while the last is still playing is dropped, which with
 * the one-cue-per-HP pacing keeps it at or under the heal ceiling's rate. With
 * no atlas, or without the clip, nothing is shown.
 */
export class SiphonCueFx {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly scene: Phaser.Scene;
  private plays = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sprite = scene.add.sprite(0, 0, ATLAS_PAGES[0].key).setDepth(FX_DEPTH).setVisible(false);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
      this.sprite.setVisible(false),
    );
  }

  /** Cues played so far; a test hook. */
  get pulses(): number {
    return this.plays;
  }

  /** Whether a cue is showing; a test hook. */
  get playing(): boolean {
    return this.sprite.visible;
  }

  /**
   * One step: follow `hero`, and start the clip if `cue` and it is idle.
   * Returns whether a cue was started. Driven from `GameScene.simulate`.
   */
  update(hero: Readonly<{ x: number; y: number; displayHeight: number }>, cue: boolean): boolean {
    if (this.sprite.visible) this.follow(hero);
    if (!cue || this.sprite.visible || !this.scene.anims.exists(SIPHON_CUE.clip)) return false;
    this.follow(hero);
    this.sprite.anims.stop();
    if (!showEffect(this.sprite, SIPHON_CUE.clip)) return false;
    this.sprite.setVisible(true);
    this.plays += 1;
    return true;
  }

  /** On the hero's upper body, half its height above its centre, so the cue's red does not sit on the red robe. */
  private follow(hero: Readonly<{ x: number; y: number; displayHeight: number }>): void {
    this.sprite.setPosition(hero.x, hero.y - hero.displayHeight / 2);
  }

  /** Hide the cue, on the hero's death. */
  hide(): void {
    this.sprite.anims.stop();
    this.sprite.setVisible(false);
  }
}
