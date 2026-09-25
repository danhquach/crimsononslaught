import Phaser from 'phaser';
import { AREA_TEXTURE, type AreaLook, type StormLook } from '../config/areas';
import { ART_BOXES, ATLAS_PAGES, type ArtBox } from '../config/frames';
import {
  AREA_ART_DEPTH,
  AREA_DEPTH,
  AREA_SLEET_DEPTH,
  FX_DEPTH,
  MAX_LIVE_AREAS,
} from '../config/fx';
import { areaArtScale, areaScale } from '../core/fx';
import { advanceArea, type GroundArea } from '../core/groundArea';
import {
  sleetAlpha,
  sleetPiece,
  sleetPose,
  sleetRate,
  spawnsDue,
  spotInDisc,
  stormAlpha,
  type SleetPiece,
} from '../core/iceStorm';
import type { Rng } from '../core/rng';
import { showEffect } from '../render/animate';

/** The most sleet one storm may have in the air at once, whatever its rule asks (#219). */
const MAX_SLEET_PER_AREA = 96;
/** The most shards one storm may have bursting at once, whatever its rule asks. */
const MAX_SHARDS_PER_AREA = 8;

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
  /** Whether the ring is shown: a storm (#219) hides it and has no drawn edge. */
  readonly ringShown: boolean;
  /** An ice storm as drawn (#219), or null for a patch drawn with its ring. */
  readonly storm: StormView | null;
}

/** An ice storm as it is drawn right now (#219), for the browser suite. */
export interface StormView {
  /** Pieces of sleet in the air. */
  readonly sleet: number;
  /** How far from the centre the furthest piece that can be seen is; 0 with none. */
  readonly reach: number;
  /** The most opaque piece in the air. */
  readonly brightest: number;
  /** Shards bursting where the ice lands. */
  readonly shards: number;
}

interface LivePiece {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly piece: SleetPiece;
  ageS: number;
}

interface LiveStorm {
  readonly look: StormLook;
  /** The texture and frames the sleet clip is drawn from; a piece picks one. */
  readonly texture: string;
  readonly frames: readonly (string | number)[];
  pieces: LivePiece[];
  /** Shards of this storm still playing; the cap its rule sets is counted here. */
  shardsLive: number;
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
  /** An ice storm (#219), drawn in place of the ring; null for the ring. */
  readonly storm: LiveStorm | null;
  readonly onTick: AreaTick;
  readonly hooks: AreaHooks;
}

/**
 * Persistent ground areas on screen (#135): an ice storm settling over a crowd, a
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
 *
 * A storm look (#219, Ice Storm) is drawn instead of the ring: sleet that
 * streaks across the patch on the run clock and fades out before the edge, and
 * shards bursting where it lands, at spots drawn from `rng` — a stream of its
 * own, so how a storm looks never shifts what a seed plays.
 */
export class AreaPool {
  private readonly group: Phaser.GameObjects.Group;
  private readonly artGroup: Phaser.GameObjects.Group;
  private readonly sleetGroup: Phaser.GameObjects.Group;
  private readonly shardGroup: Phaser.GameObjects.Group;
  private readonly rng: Rng;
  private live: LiveArea[] = [];

  constructor(scene: Phaser.Scene, rng: Rng) {
    this.rng = rng;
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
    this.sleetGroup = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_AREAS * MAX_SLEET_PER_AREA,
      createCallback: (child) => (child as Phaser.GameObjects.Sprite).setDepth(AREA_SLEET_DEPTH),
    });
    // A shard plays once where the ice lands and frees itself when its clip ends.
    this.shardGroup = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_AREAS * MAX_SHARDS_PER_AREA,
      createCallback: (child) => {
        const sprite = child as Phaser.GameObjects.Sprite;
        sprite.setDepth(FX_DEPTH);
        sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
          this.shardGroup.killAndHide(sprite),
        );
      },
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
    return this.live.map(({ area, sprite, art, storm }) => ({
      radius: area.radius,
      remainingS: area.remainingS,
      drawnRadius: sprite.displayWidth / 2,
      clip: art?.clip ?? null,
      artRadius: art ? (art.box.w * Math.abs(art.sprite.scaleX)) / 2 : null,
      artOffset: art ? Math.hypot(art.sprite.x - sprite.x, art.sprite.y - sprite.y) : null,
      ringShown: sprite.visible,
      storm: storm ? stormView(area, storm) : null,
    }));
  }

  /**
   * Put `area` on the ground, ticking `onTick` as it goes and, with `hooks`,
   * stepping it every frame first and telling the spell when it runs out, and
   * drawing it with `look`'s art under the ring, or its storm in its place.
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
    const storm = this.startStorm(look.storm);
    // The ring is still the patch's slot in the pool; a storm just hides it.
    sprite.setVisible(storm === null);
    this.live.push({
      area,
      sprite,
      art: storm ? null : this.showArt(area, look),
      storm,
      onTick,
      hooks,
    });
    return true;
  }

  /**
   * A storm (#219), or null unless its sleet clip is in the atlas: without it
   * the ring draws, so the patch still says where it ticks.
   */
  private startStorm(look: StormLook | undefined): LiveStorm | null {
    if (!look) return null;
    const anim = this.sleetGroup.scene.anims.get(look.sleet.clip);
    const first = anim?.frames[0];
    if (!anim || !first) return null;
    return {
      look,
      texture: first.textureKey,
      frames: anim.frames.map((frame) => frame.textureFrame),
      pieces: [],
      shardsLive: 0,
    };
  }

  /**
   * One step of a storm (#219): every piece of sleet falls on and fades by
   * where it now is, the ones that have landed are freed, and the pieces and
   * shards the step owes are sent up. Past a rule's cap a spawn is dropped,
   * never queued.
   */
  private stepStorm(entry: LiveArea, storm: LiveStorm, elapsedS: number, deltaS: number): void {
    const { area } = entry;
    const { sleet, fade } = storm.look;
    const shown = stormAlpha(area.durationS - area.remainingS, area.remainingS, fade);
    const falling: LivePiece[] = [];
    for (const live of storm.pieces) {
      live.ageS += deltaS;
      if (live.ageS >= live.piece.lifeS) {
        this.sleetGroup.killAndHide(live.sprite);
        continue;
      }
      falling.push(live);
    }
    storm.pieces = falling;

    const cap = Math.min(sleet.maxLive, MAX_SLEET_PER_AREA);
    const owed = spawnsDue(elapsedS, deltaS, sleetRate(area.radius, sleet));
    for (let i = 0; i < owed && storm.pieces.length < cap; i += 1) {
      const piece = sleetPiece(area, area.radius, sleet, storm.frames.length, this.rng);
      const sprite = this.sleetGroup.get(
        piece.x0,
        piece.y0,
        storm.texture,
        storm.frames[piece.frame],
      ) as Phaser.GameObjects.Sprite | null;
      if (!sprite) break;
      sprite
        .setActive(true)
        .setVisible(true)
        .setTexture(storm.texture, storm.frames[piece.frame])
        .setRotation(piece.rotation);
      storm.pieces.push({ sprite, piece, ageS: 0 });
    }

    for (const { sprite, piece, ageS } of storm.pieces) {
      const at = sleetPose(piece, ageS);
      sprite
        .setPosition(at.x, at.y)
        .setAlpha(shown * sleetAlpha(piece, ageS, area, area.radius, sleet.rimFade));
    }

    this.burstShards(entry, storm, elapsedS, deltaS, shown);
  }

  /** The shards a storm's step owes, each bursting at a spot of its own inside the patch. */
  private burstShards(
    entry: LiveArea,
    storm: LiveStorm,
    elapsedS: number,
    deltaS: number,
    alpha: number,
  ): void {
    const rule = storm.look.shards;
    if (!this.shardGroup.scene.anims.exists(rule.clip)) return;
    const cap = Math.min(rule.maxLive, MAX_SHARDS_PER_AREA);
    const owed = spawnsDue(elapsedS, deltaS, rule.perSecond);
    for (let i = 0; i < owed && storm.shardsLive < cap; i += 1) {
      const at = spotInDisc(entry.area, rule.reach * entry.area.radius, this.rng);
      const sprite = this.shardGroup.get(
        at.x,
        at.y,
        ATLAS_PAGES[0].key,
      ) as Phaser.GameObjects.Sprite | null;
      if (!sprite) return;
      sprite.setActive(true).setVisible(true).setPosition(at.x, at.y).setScale(rule.scale);
      sprite.setAlpha(alpha);
      sprite.anims.stop();
      if (!showEffect(sprite, rule.clip)) {
        this.shardGroup.killAndHide(sprite);
        return;
      }
      storm.shardsLive += 1;
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        storm.shardsLive -= 1;
      });
    }
  }

  private endStorm(storm: LiveStorm): void {
    for (const { sprite } of storm.pieces) this.sleetGroup.killAndHide(sprite);
    storm.pieces = [];
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
      const elapsedS = entry.area.durationS - entry.area.remainingS;
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
        if (entry.storm) this.endStorm(entry.storm);
        onExpire?.();
      } else {
        if (entry.storm) this.stepStorm(entry, entry.storm, elapsedS, deltaS);
        surviving.push(entry);
      }
    }
    this.live = surviving;
  }
}

/** A storm's sleet and shards as drawn right now (#219). */
function stormView(area: Readonly<GroundArea>, storm: LiveStorm): StormView {
  let reach = 0;
  let brightest = 0;
  for (const { sprite } of storm.pieces) {
    brightest = Math.max(brightest, sprite.alpha);
    if (sprite.alpha > 0) reach = Math.max(reach, Math.hypot(sprite.x - area.x, sprite.y - area.y));
  }
  return { sleet: storm.pieces.length, reach, brightest, shards: storm.shardsLive };
}
