import Phaser from 'phaser';
import { TELEGRAPH_TEXTURE } from '../config/strikes';
import { FX_DEPTH, MAX_LIVE_TELEGRAPHS } from '../config/fx';
import { telegraphScale } from '../core/fx';
import { advanceTelegraphs, type Telegraph } from '../core/skyStrike';

/** What a strike does to the arena when it lands, given the point it committed to. */
export type Landing = (telegraph: Readonly<Telegraph>) => void;

interface LiveTelegraph {
  readonly telegraph: Telegraph;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly onLand: Landing;
}

/**
 * Strike telegraphs on screen (#138): the ring that says where a meteor is
 * about to land. A pool of plain sprites mirroring `AreaPool`, one per strike in
 * the air, drawn at the blast's own radius and freed the frame it lands. Past
 * `MAX_LIVE_TELEGRAPHS` a cast lands nothing, never a queue — the rule every
 * pool in the game follows.
 *
 * `FxPool` frees a clip on `ANIMATION_COMPLETE`, so a marker that has to hold
 * for the fall delay cannot be a burst: it lives here, on the run clock, and a
 * paused run holds it mid-air. Drawn at `FX_DEPTH`, above the crowd, because a
 * warning the enemy cap can bury is not a warning.
 *
 * The group belongs to the scene, so a run ending takes the markers with it.
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

  /**
   * Show `telegraph` and call `onLand` when its delay is up. Returns whether it
   * was placed: a pool at its cap drops the strike outright, the way a burst
   * past `MAX_LIVE_FX` is dropped.
   */
  place(telegraph: Telegraph, onLand: Landing): boolean {
    const sprite = this.group.get(
      telegraph.x,
      telegraph.y,
      TELEGRAPH_TEXTURE,
    ) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return false;
    sprite
      .setActive(true)
      .setVisible(true)
      .setPosition(telegraph.x, telegraph.y)
      .setScale(telegraphScale(telegraph.radius));
    this.live.push({ telegraph, sprite, onLand });
    return true;
  }

  /**
   * One simulation step, in milliseconds of run time: every telegraph counts
   * down, and the ones whose delay this window spent land and are freed. The
   * landings run after the whole list is stepped, so a landing that changes
   * the crowd cannot disturb a telegraph still counting down beside it.
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
      else if (live) surviving.push({ ...entry, telegraph: live });
    }
    this.live = surviving;
    for (const landing of landings) {
      this.group.killAndHide(landing.sprite);
      landing.onLand(landing.telegraph);
    }
  }
}
