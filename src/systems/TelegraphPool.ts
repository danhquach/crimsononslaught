import Phaser from 'phaser';
import { METEOR_CLIP, TELEGRAPH_TEXTURE } from '../config/strikes';
import { FX_DEPTH, MAX_LIVE_TELEGRAPHS } from '../config/fx';
import { telegraphScale } from '../core/fx';
import {
  advanceTelegraphs,
  fallPosition,
  fallProgress,
  fallRotation,
  type Telegraph,
} from '../core/skyStrike';
import { showEffect } from '../render/animate';

/** What a strike does to the arena when it lands, given the point it committed to. */
export type Landing = (telegraph: Readonly<Telegraph>) => void;

/** One strike in the air as drawn right now, for the browser suite. */
export interface MeteorView {
  /** The committed impact point. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly remainingS: number;
  /** The whole fall it counts down from, in seconds of run time. */
  readonly fallS: number;
  /** Where the meteor is drawn this step. */
  readonly drawnX: number;
  readonly drawnY: number;
  readonly visible: boolean;
  /** The clip it plays, or null when the atlas did not supply it and the placeholder stands in. */
  readonly clip: string | null;
  readonly rotation: number;
}

interface LiveTelegraph {
  readonly telegraph: Telegraph;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly onLand: Landing;
  /** Whether the meteor's clip is playing; false when the placeholder stands in for it. */
  readonly animated: boolean;
}

/**
 * Strikes in the air (#138): since CO-167 each one is the meteor itself,
 * coming in along `fallPosition`'s straight 35° path, rotated to lead with the
 * rock and playing `fire.meteor`, and nothing is drawn at the point it will
 * hit. A pool of plain sprites mirroring `AreaPool`, one per strike, freed the
 * frame it lands. Past `MAX_LIVE_TELEGRAPHS` a cast lands nothing, never a
 * queue — the rule every pool in the game follows.
 *
 * `FxPool` frees a clip on `ANIMATION_COMPLETE`, so a strike that has to fly
 * for the fall delay cannot be a burst: it lives here, on the run clock, and a
 * paused run holds it mid-air. Drawn at `FX_DEPTH`, above the crowd, because a
 * warning the enemy cap can bury is not a warning.
 *
 * Without the atlas the `fx_telegraph` placeholder flies the path instead, at
 * the blast's size, so a missing atlas only costs the art.
 *
 * The group belongs to the scene, so a run ending takes the meteors with it.
 */
export class TelegraphPool {
  private readonly group: Phaser.GameObjects.Group;
  private live: LiveTelegraph[] = [];

  constructor(scene: Phaser.Scene) {
    this.group = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_TELEGRAPHS,
      createCallback: (child) => (child as Phaser.GameObjects.Sprite).setDepth(FX_DEPTH),
    });
  }

  /** Strikes in the air right now; the test hook the acceptance criteria name. */
  get count(): number {
    return this.live.length;
  }

  /** The telegraphs themselves, for the browser suite to watch one appear and land. */
  get telegraphs(): readonly Readonly<Telegraph>[] {
    return this.live.map((entry) => entry.telegraph);
  }

  /** Each strike in the air and how its meteor is drawn right now. */
  get views(): readonly MeteorView[] {
    return this.live.map(({ telegraph, sprite, animated }) => ({
      x: telegraph.x,
      y: telegraph.y,
      radius: telegraph.radius,
      remainingS: telegraph.remainingS,
      fallS: telegraph.fallS,
      drawnX: sprite.x,
      drawnY: sprite.y,
      visible: sprite.visible,
      clip: animated ? METEOR_CLIP : null,
      rotation: sprite.rotation,
    }));
  }

  /**
   * Launch `telegraph`'s meteor and call `onLand` when its delay is up.
   * Returns whether it was placed: a pool at its cap drops the strike outright,
   * the way a burst past `MAX_LIVE_FX` is dropped.
   */
  place(telegraph: Telegraph, onLand: Landing): boolean {
    const start = fallPosition(telegraph, fallProgress(telegraph));
    const sprite = this.group.get(
      start.x,
      start.y,
      TELEGRAPH_TEXTURE,
    ) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return false;
    sprite.setActive(true).setVisible(true).setPosition(start.x, start.y);
    // A recycled sprite may still hold its last clip; `showEffect` restarts it.
    sprite.anims.stop();
    const animated = showEffect(sprite, METEOR_CLIP);
    if (animated) {
      sprite.setScale(1).setRotation(fallRotation());
    } else {
      sprite
        .setTexture(TELEGRAPH_TEXTURE)
        .setOrigin(0.5)
        .setRotation(0)
        .setScale(telegraphScale(telegraph.radius));
    }
    this.live.push({ telegraph, sprite, onLand, animated });
    return true;
  }

  /**
   * One simulation step, in milliseconds of run time: every telegraph counts
   * down and its meteor moves on along the path, and the ones whose delay this
   * window spent land and are freed. The landings run after the whole list is
   * stepped, so a landing that changes the crowd cannot disturb a strike still
   * falling beside it.
   */
  update(deltaMs: number): void {
    const deltaS = deltaMs / 1000;
    const surviving: LiveTelegraph[] = [];
    const landings: LiveTelegraph[] = [];
    for (const entry of this.live) {
      const step = advanceTelegraphs([entry.telegraph], deltaS);
      const [landed] = step.landed;
      const [live] = step.live;
      if (landed) landings.push({ ...entry, telegraph: landed });
      else if (live) {
        const at = fallPosition(live, fallProgress(live));
        entry.sprite.setPosition(at.x, at.y);
        surviving.push({ ...entry, telegraph: live });
      }
    }
    this.live = surviving;
    for (const landing of landings) {
      landing.sprite.anims.stop();
      this.group.killAndHide(landing.sprite);
      landing.onLand(landing.telegraph);
    }
  }
}
