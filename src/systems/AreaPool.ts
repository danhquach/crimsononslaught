import Phaser from 'phaser';
import { AREA_TEXTURE } from '../config/areas';
import { AREA_DEPTH, MAX_LIVE_AREAS } from '../config/fx';
import { areaScale } from '../core/fx';
import { advanceArea, type GroundArea } from '../core/groundArea';

/** What a patch does to the arena on one of its ticks, given where it stands. */
export type AreaTick = (area: Readonly<GroundArea>) => void;

/**
 * What a patch does every simulation step, before its clock advances: a
 * tornado (#142) drifts and pulls here. It returns the patch to step from —
 * moved, or the same one — so the position is data the pool holds, never state
 * the spell has to keep in step with the sprite.
 */
export type AreaStep = (area: Readonly<GroundArea>, deltaS: number) => GroundArea;

/** What a patch may do besides tick: step every frame, and hear that it ran out. */
export interface AreaHooks {
  readonly onStep?: AreaStep;
  /** Called once, the frame the patch expires and its sprite is freed. */
  readonly onExpire?: () => void;
}

interface LiveArea {
  area: GroundArea;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly onTick: AreaTick;
  readonly hooks: AreaHooks;
}

/**
 * Persistent ground areas on screen (#135): a blizzard settling over a crowd, a
 * fissure shaking the ground under it. A pool of plain sprites mirroring
 * `FxPool`, one per live patch, drawn at the radius the patch covers and freed
 * the frame it expires. Past `MAX_LIVE_AREAS` a cast places nothing, never a
 * queue — the rule every pool in the game follows.
 *
 * Unlike a burst, a patch is not a clip that ends: it has a lifetime on the run
 * clock and owes effects along the way, so this pool is stepped from
 * `GameScene.simulate` with the step's own window. A paused run holds every
 * patch where it lies, and a `?timeScale=` run pays exactly the ticks that
 * window is worth (`core/groundArea.ts`). What a tick *does* belongs to the
 * spell that placed the patch and arrives as the `AreaTick` it was placed with.
 *
 * Counting patches here rather than in each spell is what makes the cap a
 * property of the arena: two area spells equipped at once share it, the way
 * every enemy shares one pool. The group belongs to the scene, so a run ending
 * takes the patches with it.
 */
export class AreaPool {
  private readonly group: Phaser.GameObjects.Group;
  private live: LiveArea[] = [];

  constructor(scene: Phaser.Scene) {
    this.group = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_AREAS,
      createCallback: (child) => (child as Phaser.GameObjects.Sprite).setDepth(AREA_DEPTH),
    });
  }

  /** Patches on the ground right now; the test hook the acceptance criteria name. */
  get count(): number {
    return this.live.length;
  }

  /** The patches themselves, for the browser suite to watch one live and expire. */
  get areas(): readonly Readonly<GroundArea>[] {
    return this.live.map((entry) => entry.area);
  }

  /**
   * Put `area` on the ground, ticking `onTick` as it goes and, with `hooks`,
   * stepping it every frame first and telling the spell when it runs out.
   * Returns whether it was placed: a pool at its cap drops the patch outright,
   * the way a burst past `MAX_LIVE_FX` is dropped.
   */
  place(area: GroundArea, onTick: AreaTick, hooks: AreaHooks = {}): boolean {
    const sprite = this.group.get(area.x, area.y, AREA_TEXTURE) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return false;
    sprite
      .setActive(true)
      .setVisible(true)
      .setPosition(area.x, area.y)
      .setScale(areaScale(area.radius));
    this.live.push({ area, sprite, onTick, hooks });
    return true;
  }

  /**
   * One simulation step, in milliseconds of run time: every patch is advanced,
   * pays out the ticks the window crossed, and is freed when its lifetime ends.
   *
   * Ticks are applied one at a time rather than as a multiplier, so a long
   * frame lands as the many small hits it stands in for — each one re-reads who
   * is inside and re-applies the slow, which is what makes a scaled run worth
   * the same as a real-time one.
   */
  update(deltaMs: number): void {
    const deltaS = deltaMs / 1000;
    const surviving: LiveArea[] = [];
    for (const entry of this.live) {
      const { onStep, onExpire } = entry.hooks;
      const stepped = onStep ? onStep(entry.area, deltaS) : entry.area;
      const step = advanceArea(stepped, deltaS);
      entry.area = step.area;
      // A moving patch is drawn where it now stands, so the ring says where the ticks land.
      if (onStep) entry.sprite.setPosition(step.area.x, step.area.y);
      for (let tick = 0; tick < step.ticks; tick += 1) entry.onTick(step.area);
      if (step.expired) {
        this.group.killAndHide(entry.sprite);
        onExpire?.();
      } else {
        surviving.push(entry);
      }
    }
    this.live = surviving;
  }
}
