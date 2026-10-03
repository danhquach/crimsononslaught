import Phaser from 'phaser';
import { FRAMES, type FrameName } from '../config/frames';
import { FROST_TINT, FX_DEPTH } from '../config/fx';
import { ICE_WAVE_ART } from '../config/iceLevels';
import { fxAlpha } from '../core/fx';
import { iceWaveFade, iceWaveFrame, iceWaveScale } from '../core/iceLevels';
import type { Vec2 } from '../core/input';

/** The no-atlas ring: a thick stroke on the rim. */
const RING_WIDTH = 8;
/** The ring is drawn no smaller than this, so the first frames of a wave still read. */
const MIN_DRAWN_R = 8;
/** The ring's opacity at full fade, so the crowd reads through it (#347). */
const RING_ALPHA = fxAlpha('ice.wave');

/** What the rings drawn so far looked like, read back off the sprites (the test hook, #406). */
export interface RingTrace {
  /** Every frame name a ring wore. */
  frames: string[];
  /** The most a ring's drawn outer edge was off the radius it was asked for, in px. */
  edgeError: number;
  /** The lowest opacity a ring was drawn at. */
  minAlpha: number;
}

export function newRingTrace(): RingTrace {
  return { frames: [], edgeError: 0, minAlpha: 1 };
}

/**
 * The look of one full-circle cold wave (#406): `ice.wave`, drawn about the
 * wave's centre and scaled so its outer edge sits on the rim that hits
 * (`ICE_WAVE_ART`, via `core/iceLevels.ts`). Reusable: the owner makes one per
 * wave, calls `update(r, range)` with the rim's radius every step and
 * `destroy()` when the wave is done. Ice Shield's small level 3 wave draws the
 * same way at a smaller `range`.
 *
 * The frame follows the rim's progress (the core burst at the start, the
 * widest ring near the end) rather than a clock of its own, and the ring fades
 * over the last fifth, so it stops with the run and follows `?timeScale=` like
 * the wave it draws; it plays no animation. With no atlas it is a Graphics
 * stroke instead.
 */
export class IceRingWave {
  private readonly view: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  private readonly at: Readonly<Vec2>;
  private readonly trace: RingTrace | undefined;

  constructor(scene: Phaser.Scene, at: Readonly<Vec2>, trace?: RingTrace) {
    this.trace = trace;
    this.at = { x: at.x, y: at.y };
    if (scene.anims.exists('ice.wave')) {
      const first = FRAMES['ice.wave.0'];
      this.view = scene.add
        .sprite(this.at.x, this.at.y, first.page, 'ice.wave.0')
        .setOrigin(first.anchorX / first.w, first.anchorY / first.h)
        .setDepth(FX_DEPTH);
    } else {
      this.view = scene.add.graphics().setDepth(FX_DEPTH);
    }
  }

  /** Redraw the ring with its rim at `r` px of a wave that ends at `range`. */
  update(r: number, range: number): void {
    const fade = iceWaveFade(r, range);
    const drawn = Math.max(MIN_DRAWN_R, r);
    const { view } = this;
    if (view instanceof Phaser.GameObjects.Sprite) {
      const frame = iceWaveFrame(r, range);
      const art = FRAMES[`ice.wave.${frame}` as FrameName];
      view
        .setFrame(`ice.wave.${frame}`)
        .setOrigin(art.anchorX / art.w, art.anchorY / art.h)
        .setScale(iceWaveScale(drawn, frame))
        .setAlpha(fade * RING_ALPHA);
      if (this.trace) this.note(view, this.trace, drawn);
      return;
    }
    view.clear();
    view.lineStyle(RING_WIDTH, FROST_TINT, fade);
    view
      .beginPath()
      .arc(this.at.x, this.at.y, Math.max(0, drawn - RING_WIDTH / 2), 0, Math.PI * 2, false)
      .strokePath();
  }

  /** Record the sprite as it now is: its frame, how far its outer edge sits from `asked`, its opacity. */
  private note(view: Phaser.GameObjects.Sprite, trace: RingTrace, asked: number): void {
    const name = String(view.frame.name);
    if (!trace.frames.includes(name)) trace.frames.push(name);
    const outer = ICE_WAVE_ART.outerRadius[Number(name.slice(name.lastIndexOf('.') + 1))] ?? 0;
    trace.edgeError = Math.max(trace.edgeError, Math.abs(view.scaleX * outer - asked));
    trace.minAlpha = Math.min(trace.minAlpha, view.alpha);
  }

  destroy(): void {
    this.view.destroy();
  }
}
