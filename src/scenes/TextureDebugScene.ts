import Phaser from 'phaser';
import { ANIMATIONS } from '../config/animations';
import { FRAMES } from '../config/frames';
import { SCENE } from '../core/scenePayloads';

const COLS = 6;
const ROWS = 4;
const PER_PAGE = COLS * ROWS;

/**
 * Dev-only check for CO-080: plays every animation in the atlas in a labelled
 * grid, so a bad cut, a jittering anchor or a wrong frame order is visible at a
 * glance. Reached via `?debug=textures`; never part of the normal scene flow.
 *
 * More animations than fit on one screen, so it pages: left/right arrows, or
 * click anywhere for the next page.
 */
export class TextureDebugScene extends Phaser.Scene {
  private page = 0;
  private readonly shown: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(SCENE.textureDebug);
  }

  create(): void {
    this.draw();

    const turn = (by: number) => {
      const pages = Math.ceil(ANIMATIONS.length / PER_PAGE);
      this.page = (this.page + by + pages) % pages;
      this.draw();
    };
    this.input.keyboard?.on('keydown-RIGHT', () => turn(1));
    this.input.keyboard?.on('keydown-LEFT', () => turn(-1));
    this.input.on('pointerdown', () => turn(1));
  }

  private draw(): void {
    for (const object of this.shown.splice(0)) object.destroy();

    const { width, height } = this.scale;
    const pages = Math.ceil(ANIMATIONS.length / PER_PAGE);
    const page = ANIMATIONS.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);

    this.shown.push(
      this.add
        .text(
          width / 2,
          16,
          `Atlas animations — page ${this.page + 1}/${pages} (arrows or click)`,
          { fontFamily: 'monospace', fontSize: '18px' },
        )
        .setOrigin(0.5, 0),
    );

    const cellW = width / COLS;
    const cellH = (height - 52) / ROWS;

    page.forEach((anim, i) => {
      const cx = cellW * (i % COLS) + cellW / 2;
      const cy = 52 + cellH * Math.floor(i / COLS) + cellH / 2;

      const first = anim.frames[0];
      if (!first) return;
      const info = FRAMES[first];
      // Scaled to fit the cell, but never blown up past 3x: the point is to see
      // whether the cut is clean, and interpolating would hide exactly that.
      const fit = Math.min(3, (cellH - 34) / info.h, (cellW - 12) / info.w);

      const sprite = this.add
        .sprite(cx, cy - 8, info.page, first)
        .setScale(Math.max(1, Math.floor(fit)));
      sprite.play(anim.name);

      this.shown.push(
        sprite,
        this.add
          .text(
            cx,
            cy + cellH / 2 - 26,
            `${anim.name}\n${anim.frames.length}f ${info.w}x${info.h}`,
            {
              fontFamily: 'monospace',
              fontSize: '10px',
              align: 'center',
            },
          )
          .setOrigin(0.5, 0),
      );
    });
  }
}
