import Phaser from 'phaser';
import { DASH_TRAIL } from '../config/dash';
import { DASH_DEPTH } from '../config/fx';
import { showEffect } from '../render/animate';

interface Ghost {
  readonly image: Phaser.GameObjects.Sprite;
  readonly wisp: Phaser.GameObjects.Sprite;
  /** Run-clock ms since it was laid; -1 when free. */
  age: number;
}

/**
 * The dash's afterimage (#384): copies of the hero's current frame laid along
 * the path in the trail tint, fading out, each with a smoke wisp played over it,
 * and a puff at the take-off. Every sprite is made once in the constructor and
 * reused; a ghost with none free is dropped, never queued, and nothing is
 * created while the run plays.
 *
 * It follows the hero's frame, not its own art, so a spell that swaps the tint
 * or the clips (`config/dash.ts`) changes the effect without a new hero pose.
 * With no atlas the hero is the placeholder circle and no trail is drawn; a
 * wisp or puff clip the atlas does not supply is skipped.
 */
export class DashTrailPool {
  private readonly ghosts: Ghost[];
  private readonly puffSprite: Phaser.GameObjects.Sprite;

  private readonly scene: Phaser.Scene;
  private readonly hero: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, hero: Phaser.GameObjects.Sprite) {
    this.scene = scene;
    this.hero = hero;
    const hidden = (depth: number): Phaser.GameObjects.Sprite =>
      scene.add.sprite(0, 0, hero.texture.key).setDepth(depth).setVisible(false).setActive(false);
    this.ghosts = Array.from({ length: DASH_TRAIL.poolSize }, () => {
      const wisp = hidden(DASH_DEPTH - 0.01);
      // A one-shot clip holds its last frame; hide it once it has played.
      wisp.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => wisp.setVisible(false));
      return { image: hidden(DASH_DEPTH), wisp, age: -1 };
    });
    this.puffSprite = hidden(DASH_DEPTH + 0.01);
    this.puffSprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
      this.puffSprite.setVisible(false),
    );
  }

  /** Ghosts out right now. */
  get live(): number {
    return this.ghosts.filter((ghost) => ghost.age >= 0).length;
  }

  /** Test hook: each ghost out now, where and how faint, for the browser suite. */
  report(): { x: number; y: number; alpha: number; frame: string; tint: number }[] {
    return this.ghosts
      .filter((ghost) => ghost.age >= 0)
      .map(({ image }) => ({
        x: image.x,
        y: image.y,
        alpha: image.alpha,
        frame: String(image.frame.name),
        tint: image.tintTopLeft,
      }));
  }

  /** Wisps showing right now: one per ghost whose clip is in the atlas. */
  get wisps(): number {
    return this.ghosts.filter((ghost) => ghost.wisp.visible).length;
  }

  /** The puff has played, or is playing, at the take-off point. */
  get puffShown(): boolean {
    return this.puffSprite.visible;
  }

  /** Lay one ghost at `x, y` in the hero's current frame; false when none is free or there is no atlas. */
  lay(x: number, y: number): boolean {
    // The placeholder circle has no frames to copy: no atlas, no trail.
    if (!this.hero.anims.currentAnim) return false;
    const ghost = this.ghosts.find((candidate) => candidate.age < 0);
    if (!ghost) return false;
    const { image, wisp } = ghost;
    ghost.age = 0;
    image
      .setTexture(this.hero.texture.key, this.hero.frame.name)
      .setOrigin(this.hero.originX, this.hero.originY)
      .setFlipX(this.hero.flipX)
      .setScale(this.hero.scaleX, this.hero.scaleY)
      .setTint(DASH_TRAIL.ghostTint)
      .setAlpha(DASH_TRAIL.ghostAlpha)
      .setPosition(x, y)
      .setActive(true)
      .setVisible(true);
    this.play(wisp, DASH_TRAIL.wispClip, x, y, DASH_TRAIL.wispScale);
    wisp.setAlpha(DASH_TRAIL.wispAlpha);
    return true;
  }

  /** The puff at the take-off point. */
  puff(x: number, y: number): void {
    this.play(this.puffSprite, DASH_TRAIL.burstClip, x, y, DASH_TRAIL.burstScale);
  }

  /** Fade the ghosts by `deltaMs` of run time and free the ones that have gone. */
  update(deltaMs: number): void {
    for (const ghost of this.ghosts) {
      if (ghost.age < 0) continue;
      ghost.age += deltaMs;
      if (ghost.age >= DASH_TRAIL.fadeMs) {
        ghost.age = -1;
        ghost.image.setVisible(false).setActive(false);
        ghost.wisp.anims.stop();
        ghost.wisp.setVisible(false);
        continue;
      }
      ghost.image.setAlpha(DASH_TRAIL.ghostAlpha * (1 - ghost.age / DASH_TRAIL.fadeMs));
    }
  }

  private play(
    sprite: Phaser.GameObjects.Sprite,
    clip: string,
    x: number,
    y: number,
    scale: number,
  ): void {
    if (!this.scene.anims.exists(clip)) return;
    sprite.setPosition(x, y).setScale(scale).setActive(true).setVisible(true);
    // Registered with the scene but not in the cut list: nothing to draw.
    if (!showEffect(sprite, clip)) sprite.setVisible(false);
  }
}
