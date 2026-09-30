import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { CHAIN_CLIP, FX_DEPTH } from '../config/fx';
import { ART_BOXES, FRAMES } from '../config/frames';
import { artFrame } from '../core/animation';
import { chainFrame, chainSegmentPose } from '../core/fx';
import type { Vec2 } from '../core/input';

/** One chain jump on screen: a tiled strip between two points, stepped on the run clock. */
interface Segment {
  readonly strip: Phaser.GameObjects.TileSprite;
  elapsedMs: number;
  /** The clip frame the strip shows, so it is only re-set when the clip moves on. */
  frame: number;
}

/**
 * The `lightning.chain` strips a spell lays between two points (CO-082), one
 * pool per spell: Chain Lightning's jumps (#142), forked or not. The
 * high-rate arcs of #329 (the Lightning Companion's Thunderclap, the
 * Lightning Sword's cut arcs) are `ArcFlashPool`'s instead.
 *
 * A strip plays one pass of the clip, cycled on the run clock so a paused run
 * holds it, then goes back to the pool. Past `max` live strips a new one is
 * dropped, never queued: the strike it draws lands all the same. With no atlas
 * the strip is the `fx_bolt` placeholder.
 */
export class ChainStripPool {
  private readonly scene: Phaser.Scene;
  private readonly max: number;
  private readonly live: Segment[] = [];
  private readonly spare: Phaser.GameObjects.TileSprite[] = [];

  constructor(scene: Phaser.Scene, max: number) {
    this.scene = scene;
    this.max = max;
  }

  /** Strips on screen right now. */
  get count(): number {
    return this.live.length;
  }

  /** One frame of run time: each strip steps its clip, and one that has played through is freed. */
  step(deltaS: number): void {
    const deltaMs = deltaS * 1000;
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const segment = this.live[i] as Segment;
      segment.elapsedMs += deltaMs;
      const frame = chainFrame(segment.elapsedMs);
      if (frame === null) {
        this.live.splice(i, 1);
        segment.strip.setVisible(false);
        this.spare.push(segment.strip);
      } else if (frame !== segment.frame && this.hasAtlas) {
        // A tile sprite redraws and re-uploads its tile on every `setFrame`, so
        // it is set only when the frame changes, not every step (#329).
        segment.frame = frame;
        segment.strip.setFrame(artFrame(`${CHAIN_CLIP}.${frame}`));
      }
    }
  }

  /** Put one strip between two points, fresh at the clip's first frame; false when the pool is full. */
  lay(from: Readonly<Vec2>, to: Readonly<Vec2>): boolean {
    if (this.live.length >= this.max) return false;
    const pose = chainSegmentPose(from, to);
    const reused = this.spare.pop();
    const strip = reused ?? this.makeStrip();
    strip.setPosition(pose.x, pose.y).setRotation(pose.rotation).setVisible(true);
    strip.setSize(pose.length, strip.height);
    // A strip made just now already shows the first frame; a reused one ended on the last.
    if (reused && this.hasAtlas) strip.setFrame(artFrame(`${CHAIN_CLIP}.0`));
    this.live.push({ strip, elapsedMs: 0, frame: 0 });
    return true;
  }

  private get hasAtlas(): boolean {
    return this.scene.anims.exists(CHAIN_CLIP);
  }

  /**
   * A strip anchored at its left-middle, so `setPosition` puts that end on the
   * start point and the rotation swings the rest onto the target. The atlas
   * strip tiles the chain's art alone, never its frame's margin (CO-126); the
   * placeholder tiles the `fx_bolt` bar.
   */
  private makeStrip(): Phaser.GameObjects.TileSprite {
    const first = FRAMES[`${CHAIN_CLIP}.0`];
    const art = ART_BOXES[CHAIN_CLIP];
    const strip = this.hasAtlas
      ? this.scene.add.tileSprite(0, 0, art.w, art.h, first.page, artFrame(`${CHAIN_CLIP}.0`))
      : this.scene.add.tileSprite(
          0,
          0,
          PLACEHOLDERS.fx_bolt.width,
          PLACEHOLDERS.fx_bolt.height,
          'fx_bolt',
        );
    return strip.setOrigin(0, 0.5).setDepth(FX_DEPTH).setVisible(false);
  }
}
