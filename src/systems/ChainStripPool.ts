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
}

/**
 * Tiled `lightning.chain` strips (CO-082, #329): one strip between two points,
 * for one pass of the clip, cycled on the run clock so a paused run holds it.
 * Extracted from `ChainLightningSpell` so the level-3 Lightning effects that
 * draw an arc between enemies (the companion's front arc and Thunderclap, the
 * sword's arcs) share the one look. Each owner builds its own pool with its own
 * cap and steps it from its own `tick`, which only runs while the run does.
 *
 * With no atlas the strip is the `fx_bolt` placeholder. Past `maxLive` a strip
 * is dropped, never queued.
 */
export class ChainStripPool {
  private readonly scene: Phaser.Scene;
  private readonly maxLive: number;
  private readonly live: Segment[] = [];
  private readonly spare: Phaser.GameObjects.TileSprite[] = [];

  constructor(scene: Phaser.Scene, maxLive: number) {
    this.scene = scene;
    this.maxLive = maxLive;
  }

  /** Strips on screen right now. */
  get liveCount(): number {
    return this.live.length;
  }

  /** Step every strip by `deltaS` seconds of run time and free the ones whose clip has played out. */
  update(deltaS: number): void {
    const deltaMs = deltaS * 1000;
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const segment = this.live[i] as Segment;
      segment.elapsedMs += deltaMs;
      const frame = chainFrame(segment.elapsedMs);
      if (frame === null) {
        this.live.splice(i, 1);
        segment.strip.setVisible(false);
        this.spare.push(segment.strip);
      } else if (this.hasAtlas) {
        segment.strip.setFrame(artFrame(`${CHAIN_CLIP}.${frame}`));
      }
    }
  }

  /**
   * Put one strip between two points, fresh at the clip's first frame. False
   * when the pool is full and the strip was dropped.
   */
  lay(from: Readonly<Vec2>, to: Readonly<Vec2>): boolean {
    if (this.live.length >= this.maxLive) return false;
    const pose = chainSegmentPose(from, to);
    const strip = this.spare.pop() ?? this.makeStrip();
    strip.setPosition(pose.x, pose.y).setRotation(pose.rotation).setVisible(true);
    strip.setSize(pose.length, strip.height);
    if (this.hasAtlas) strip.setFrame(artFrame(`${CHAIN_CLIP}.0`));
    this.live.push({ strip, elapsedMs: 0 });
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
