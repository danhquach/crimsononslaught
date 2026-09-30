import Phaser from 'phaser';
import {
  FIRE_TRAIL,
  MAX_LIVE_SCORCH_PIECES,
  MAX_LIVE_TRAIL_FLAMES,
  SCORCH_CLIP,
  SCORCH_VARIANTS,
} from '../config/fireLevels';
import { BASE_FIRE_WAVE_STATS } from '../config/fireRoster';
import { ART_BOXES, ATLAS_PAGES, FRAMES, type FrameName } from '../config/frames';
import { AREA_ART_DEPTH, AREA_DEPTH } from '../config/fx';
import { frameOrigin } from '../core/animation';
import type { ScorchPiece } from '../core/fireTrail';
import { showEffect } from '../render/animate';

/** What one zone has laid: its scorch sprites and its flames, told apart for the caps. */
interface Laid {
  pieces: Phaser.GameObjects.Sprite[];
  flames: Phaser.GameObjects.Sprite[];
}

/**
 * The burnt ground under a level 3 Fire Wave (#327): static soot sprites and a
 * few tiny flames, laid piece by piece as the rim passes and released with their
 * zone. A dumb pool: what goes where, and when, is `core/fireTrail.ts`'s call
 * and the burning is the spell's. `FireWaveSpell` owns it, as `FireballSpell`
 * owns its embers; it is outside the area pool and its cap.
 *
 * Pieces and flames are capped separately (`MAX_LIVE_SCORCH_PIECES`,
 * `MAX_LIVE_TRAIL_FLAMES`); a piece past either is refused, never queued. With no
 * atlas nothing is drawn and every piece is refused.
 */
export class ScorchPool {
  private readonly group: Phaser.GameObjects.Group;
  private readonly zones = new Map<number, Laid>();
  private pieceCount = 0;
  private flameCount = 0;

  constructor(scene: Phaser.Scene) {
    this.group = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_SCORCH_PIECES + MAX_LIVE_TRAIL_FLAMES,
    });
  }

  /** Scorch pieces out right now. */
  get pieces(): number {
    return this.pieceCount;
  }

  /** Flames out right now. */
  get flames(): number {
    return this.flameCount;
  }

  /** The distinct frames and flame looks on show, for the test hook. */
  views(): { frames: string[]; flames: { clip: string; scale: number }[] } {
    const frames = new Set<string>();
    const flames = new Map<string, { clip: string; scale: number }>();
    for (const { pieces, flames: lit } of this.zones.values()) {
      for (const sprite of pieces) frames.add(String(sprite.frame.name));
      for (const sprite of lit) {
        const clip = sprite.anims.currentAnim?.key ?? '';
        flames.set(`${clip}@${sprite.scaleX}`, { clip, scale: sprite.scaleX });
      }
    }
    return { frames: [...frames], flames: [...flames.values()] };
  }

  /**
   * Lay `piece` for `zone` at a wave of `range`; false, laying nothing, when
   * the piece (or its flame) is over its cap or there is no atlas.
   */
  lay(zone: number, piece: ScorchPiece, range: number): boolean {
    if (!this.group.scene.anims.exists(SCORCH_CLIP)) return false;
    if (this.pieceCount >= MAX_LIVE_SCORCH_PIECES) return false;
    if (piece.flame && this.flameCount >= MAX_LIVE_TRAIL_FLAMES) return false;
    const name = `${SCORCH_CLIP}.${piece.variant % SCORCH_VARIANTS}` as FrameName;
    const info = FRAMES[name];
    const span = FIRE_TRAIL.pieceSpan * (range / BASE_FIRE_WAVE_STATS.range) * piece.scale;
    const sprite = this.take(piece.x, piece.y, info.page, name);
    if (!sprite) return false;
    const origin = frameOrigin(info);
    sprite
      .setOrigin(origin.x, origin.y)
      .setRotation(piece.rotation)
      .setFlipX(piece.flipX)
      .setScale(span / ART_BOXES[SCORCH_CLIP].w)
      .setAlpha(FIRE_TRAIL.alpha)
      .setTint(FIRE_TRAIL.tint)
      .setDepth(AREA_ART_DEPTH);
    const laid = this.laidOf(zone);
    laid.pieces.push(sprite);
    this.pieceCount += 1;
    if (piece.flame) this.light(laid, piece);
    return true;
  }

  /** Set every sprite of `zone` to opacity `alpha`, as its ground fades. */
  setAlpha(zone: number, alpha: number): void {
    const laid = this.zones.get(zone);
    if (!laid) return;
    for (const sprite of [...laid.pieces, ...laid.flames]) sprite.setAlpha(alpha);
  }

  /** Take back everything `zone` laid. */
  release(zone: number): void {
    const laid = this.zones.get(zone);
    if (!laid) return;
    this.zones.delete(zone);
    for (const sprite of [...laid.pieces, ...laid.flames]) {
      sprite.anims.stop();
      this.group.killAndHide(sprite);
    }
    this.pieceCount -= laid.pieces.length;
    this.flameCount -= laid.flames.length;
  }

  /** A tiny flame on a piece; the caller has checked the flame cap. */
  private light(laid: Laid, piece: ScorchPiece): void {
    const sprite = this.take(piece.x, piece.y, ATLAS_PAGES[0].key);
    if (!sprite) return;
    sprite
      .setRotation(0)
      .setFlipX(false)
      .setScale(FIRE_TRAIL.flameScale)
      .setAlpha(FIRE_TRAIL.alpha)
      .clearTint()
      .setDepth(AREA_DEPTH);
    showEffect(sprite, FIRE_TRAIL.flameClip);
    laid.flames.push(sprite);
    this.flameCount += 1;
  }

  private take(
    x: number,
    y: number,
    texture: string,
    frame?: string,
  ): Phaser.GameObjects.Sprite | null {
    const sprite = this.group.get(x, y, texture, frame) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return null;
    sprite.anims.stop();
    sprite.setTexture(texture, frame).setActive(true).setVisible(true).setPosition(x, y);
    return sprite;
  }

  private laidOf(zone: number): Laid {
    let laid = this.zones.get(zone);
    if (!laid) {
      laid = { pieces: [], flames: [] };
      this.zones.set(zone, laid);
    }
    return laid;
  }
}
