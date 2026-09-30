import type Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { CHAIN_CLIP, FX_DEPTH } from '../config/fx';
import { ART_BOXES, FRAMES } from '../config/frames';
import { artFrame } from '../core/animation';
import { chainFrame, chainSegmentPose } from '../core/fx';
import type { Vec2 } from '../core/input';

/** One arc on screen: the plain sprites laid end to end along it, stepped on the run clock. */
interface Flash {
  readonly sprites: Phaser.GameObjects.Sprite[];
  elapsedMs: number;
  frame: number;
}

/**
 * The short `lightning.chain` arcs the Lightning levels throw many of a second
 * (#329): a Lightning Sword cut's arc and a Lightning Companion's Thunderclap.
 *
 * `ChainStripPool` draws a jump as one tiled strip, and a tile sprite redraws
 * and re-uploads its tile on every frame change: fine for Chain Lightning's
 * cast every second or so, a frame-rate cost at a sword's rate in a crowd (the
 * roster's fps floor). An arc here is plain sprites of the chain's art laid end
 * to end, as many as its length needs, each squeezed a little so they meet the
 * far end: the same look for a hop of a tile or two, with nothing re-uploaded.
 *
 * A flash plays one pass of the clip on the run clock, so a paused run holds
 * it. Past `maxSprites` live sprites a new arc is dropped, never queued: the
 * strike it draws lands all the same. With no atlas it is the `fx_bolt`
 * placeholder bar.
 */
export class ArcFlashPool {
  private readonly scene: Phaser.Scene;
  private readonly maxSprites: number;
  private readonly live: Flash[] = [];
  private readonly spare: Phaser.GameObjects.Sprite[] = [];
  private sprites = 0;

  constructor(scene: Phaser.Scene, maxSprites: number) {
    this.scene = scene;
    this.maxSprites = maxSprites;
  }

  /** Arcs on screen right now. */
  get count(): number {
    return this.live.length;
  }

  /** Sprites those arcs are drawn with, never more than `maxSprites`. */
  get spriteCount(): number {
    return this.sprites;
  }

  /** One frame of run time: each arc steps its clip, and one that has played through is freed. */
  step(deltaS: number): void {
    const deltaMs = deltaS * 1000;
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const flash = this.live[i] as Flash;
      flash.elapsedMs += deltaMs;
      const frame = chainFrame(flash.elapsedMs);
      if (frame === null) {
        this.live.splice(i, 1);
        for (const sprite of flash.sprites) {
          sprite.setVisible(false);
          this.spare.push(sprite);
        }
        this.sprites -= flash.sprites.length;
      } else if (frame !== flash.frame) {
        flash.frame = frame;
        if (this.hasAtlas) {
          for (const sprite of flash.sprites) sprite.setFrame(artFrame(`${CHAIN_CLIP}.${frame}`));
        }
      }
    }
  }

  /** One arc from `from` to `to`, fresh at the clip's first frame; false when it would pass the cap. */
  lay(from: Readonly<Vec2>, to: Readonly<Vec2>): boolean {
    const pose = chainSegmentPose(from, to);
    const tileW = this.hasAtlas ? ART_BOXES[CHAIN_CLIP].w : PLACEHOLDERS.fx_bolt.width;
    const n = Math.max(1, Math.ceil(pose.length / tileW));
    if (!(pose.length > 0) || this.sprites + n > this.maxSprites) return false;
    const step = pose.length / n;
    const cos = Math.cos(pose.rotation);
    const sin = Math.sin(pose.rotation);
    const sprites: Phaser.GameObjects.Sprite[] = [];
    for (let i = 0; i < n; i += 1) {
      const sprite = this.spare.pop() ?? this.makeSprite();
      if (this.hasAtlas) sprite.setFrame(artFrame(`${CHAIN_CLIP}.0`));
      sprite
        .setPosition(pose.x + cos * step * i, pose.y + sin * step * i)
        .setRotation(pose.rotation)
        .setScale(step / tileW, 1)
        .setVisible(true);
      sprites.push(sprite);
    }
    this.sprites += n;
    this.live.push({ sprites, elapsedMs: 0, frame: 0 });
    return true;
  }

  private get hasAtlas(): boolean {
    return this.scene.anims.exists(CHAIN_CLIP);
  }

  /** A sprite anchored at its left-middle, so each one starts where the one before it ends. */
  private makeSprite(): Phaser.GameObjects.Sprite {
    const sprite = this.hasAtlas
      ? this.scene.add.sprite(0, 0, FRAMES[`${CHAIN_CLIP}.0`].page, artFrame(`${CHAIN_CLIP}.0`))
      : this.scene.add.sprite(0, 0, 'fx_bolt');
    return sprite.setOrigin(0, 0.5).setDepth(FX_DEPTH).setVisible(false);
  }
}
