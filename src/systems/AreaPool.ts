import Phaser from 'phaser';
import { AREA_TEXTURE, type AreaLook } from '../config/areas';
import { ART_BOXES, type ArtBox } from '../config/frames';
import { AREA_ART_DEPTH, AREA_DEPTH, MAX_LIVE_AREAS } from '../config/fx';
import { areaArtScale, areaScale } from '../core/fx';
import { advanceArea, type GroundArea } from '../core/groundArea';
import { showEffect } from '../render/animate';

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

/** How one live patch is drawn, for the browser suite to hold against its radius. */
export interface AreaView {
  readonly radius: number;
  readonly remainingS: number;
  /** The ring's half-width on screen. */
  readonly drawnRadius: number;
  /** The clip of the patch's own art, or null when it is the ring alone. */
  readonly clip: string | null;
  /** Half the art box's width on screen, or null with no art. */
  readonly artRadius: number | null;
  /** How far the art stands from its ring, or null with no art: 0 while it keeps up with a moving patch. */
  readonly artOffset: number | null;
}

interface LiveArea {
  area: GroundArea;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** The spell's own art under the ring, when its clip is in the atlas. */
  readonly art: {
    readonly sprite: Phaser.GameObjects.Sprite;
    readonly clip: string;
    readonly box: ArtBox;
  } | null;
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
 *
 * Every patch is drawn with the `fx_area` ring. A spell with art of its own
 * passes its `AreaLook` and the patch also plays that clip just under the ring,
 * sized so the art spans the patch (#179); without the clip in the atlas the
 * ring alone still draws, so no spell waits on its art.
 */
export class AreaPool {
  private readonly group: Phaser.GameObjects.Group;
  private readonly artGroup: Phaser.GameObjects.Group;
  private live: LiveArea[] = [];

  constructor(scene: Phaser.Scene) {
    this.group = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_AREAS,
      createCallback: (child) => (child as Phaser.GameObjects.Sprite).setDepth(AREA_DEPTH),
    });
    // As many as there are rings, and each is freed with its ring, so a patch
    // that got a ring always gets its art.
    this.artGroup = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_AREAS,
      createCallback: (child) => (child as Phaser.GameObjects.Sprite).setDepth(AREA_ART_DEPTH),
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

  /** Each live patch and how it is drawn right now, for the browser suite. */
  get views(): readonly AreaView[] {
    return this.live.map(({ area, sprite, art }) => ({
      radius: area.radius,
      remainingS: area.remainingS,
      drawnRadius: sprite.displayWidth / 2,
      clip: art?.clip ?? null,
      artRadius: art ? (art.box.w * Math.abs(art.sprite.scaleX)) / 2 : null,
      artOffset: art ? Math.hypot(art.sprite.x - sprite.x, art.sprite.y - sprite.y) : null,
    }));
  }

  /**
   * Put `area` on the ground, ticking `onTick` as it goes and, with `hooks`,
   * stepping it every frame first and telling the spell when it runs out, and
   * drawing it with `look`'s art under the ring.
   * Returns whether it was placed: a pool at its cap drops the patch outright,
   * the way a burst past `MAX_LIVE_FX` is dropped.
   */
  place(area: GroundArea, onTick: AreaTick, hooks: AreaHooks = {}, look: AreaLook = {}): boolean {
    const sprite = this.group.get(area.x, area.y, AREA_TEXTURE) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return false;
    sprite
      .setActive(true)
      .setVisible(true)
      .setPosition(area.x, area.y)
      .setScale(areaScale(area.radius));
    this.live.push({ area, sprite, art: this.showArt(area, look), onTick, hooks });
    return true;
  }

  /** The patch's own art, or null — touching no sprite — when its clip is not in the atlas. */
  private showArt(area: Readonly<GroundArea>, look: AreaLook): LiveArea['art'] {
    const { clip } = look;
    const box = clip
      ? (ART_BOXES as Readonly<Record<string, ArtBox | undefined>>)[clip]
      : undefined;
    if (!clip || !box || !this.artGroup.scene.anims.exists(clip)) return null;
    const sprite = this.artGroup.get(area.x, area.y) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return null;
    sprite.setActive(true).setVisible(true).setPosition(area.x, area.y);
    if (!showEffect(sprite, clip)) {
      this.artGroup.killAndHide(sprite);
      return null;
    }
    sprite.setScale(areaArtScale(area.radius, box.w));
    return { sprite, clip, box };
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
      if (onStep) {
        entry.sprite.setPosition(step.area.x, step.area.y);
        entry.art?.sprite.setPosition(step.area.x, step.area.y);
      }
      for (let tick = 0; tick < step.ticks; tick += 1) entry.onTick(step.area);
      if (step.expired) {
        this.group.killAndHide(entry.sprite);
        if (entry.art) {
          entry.art.sprite.stop();
          this.artGroup.killAndHide(entry.art.sprite);
        }
        onExpire?.();
      } else {
        surviving.push(entry);
      }
    }
    this.live = surviving;
  }
}
