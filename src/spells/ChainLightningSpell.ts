import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { CHAIN_CLIP, FX_DEPTH } from '../config/fx';
import { FRAMES } from '../config/frames';
import { resolveCast, rollStun, type BoltStats } from '../core/chainLightning';
import { chainFrame, chainSegmentPose } from '../core/fx';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import { Spell } from '../core/spell';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** The two spells this class casts: Lightning Bolt (the default) and Chain Lightning. */
export type BoltSpellId = 'lightning' | 'lightning_chain';

/**
 * Chain segments that may be up at once. A cast draws `strikes * (chains + 1)`
 * at most — a maxed build is a handful — and each lives one clip cycle, far
 * shorter than any cooldown a perk can reach; the headroom covers a stalled
 * frame paying out several casts. Past it a segment is dropped, never queued.
 */
export const MAX_SEGMENTS = 32;

/** One chain jump on screen: a tiled strip between two enemies, stepped on the run clock. */
interface Segment {
  readonly strip: Phaser.GameObjects.TileSprite;
  elapsedMs: number;
}

/**
 * Lightning Bolt and Chain Lightning (#142, Phase 2 spec §9.4): every
 * `cooldown` s, `strikes` bolts leave the caster. Each hits the nearest enemy
 * within `targetRange` for `damage`, staggers it for `staggerDuration` and, on
 * a `stunChance` roll, stuns it for `stunDuration`. Chain Lightning's bolts go
 * on to chain up to `chains` times to the nearest unhit enemy within
 * `chainRange` for `damage * chainFalloff`; Lightning Bolt's block has no chain
 * fields, so its bolts stop at the first target.
 *
 * The rules — where a bolt starts, who it jumps to, what each hit pays, whether
 * it stuns — live in `core/chainLightning.ts`. A cast is instantaneous and
 * resolved against the live enemies geometrically, so it puts no body in the
 * world. The stun roll is the one draw from the run's RNG, so a seed reproduces
 * which hits stunned.
 *
 * FX (CO-082): every bolt is drawn from the caster — a tiled `lightning.chain`
 * strip from the player to the first target (#118: the bolt travels out from
 * the caster rather than reading as a strike from the sky), then one more from
 * each enemy to the next along the arc — each for one pass of the clip, cycled
 * on the run clock so a paused run holds it. `lightning.strike` and
 * `lightning.impact` play on each bolt's first target. With no atlas the strip
 * is the `fx_bolt` placeholder. The sparks on a stunned or staggered enemy are
 * the overlay pool's, driven from its status.
 */
export class ChainLightningSpell extends Spell<BoltSpellId> {
  private readonly scene: Phaser.Scene;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly rng: Rng;
  private readonly live: Segment[] = [];
  private readonly spare: Phaser.GameObjects.TileSprite[] = [];
  /** Test hook (#142): enemies this spell has struck, across every bolt. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    id: BoltSpellId,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: BoltStats,
    damage: DamageSink,
    rng: Rng,
    fx: FxPool,
  ) {
    super(id, stats);
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.rng = rng;
    this.fx = fx;
  }

  /** Bolt strips on screen right now. */
  get liveCount(): number {
    return this.live.length;
  }

  /** Enemies struck so far — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
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
        segment.strip.setFrame(`${CHAIN_CLIP}.${frame}`);
      }
    }
  }

  /**
   * One cast. Positions are read before any damage lands, so a killing blow
   * still draws to where the enemy stood; the lead-in strip leaves from where
   * the caster stands this frame.
   */
  protected cast(): void {
    const stats: BoltStats = this.stats;
    const bolts = resolveCast(this.caster, this.enemies.live, stats);
    if (bolts.length === 0) return;

    for (const bolt of bolts) {
      const [first] = bolt;
      if (!first) continue;
      this.lay(this.caster, first.target);
      this.fx.burst('lightning.strike', first.target.x, first.target.y);
      this.fx.burst('lightning.impact', first.target.x, first.target.y);
      let from: Readonly<Vec2> = first.target;
      for (const { target } of bolt.slice(1)) {
        this.lay(from, target);
        from = { x: target.x, y: target.y };
      }
    }
    for (const bolt of bolts) {
      for (const { target, damage } of bolt) {
        this.landed += 1;
        // Status before damage, so a killing bolt has still marked the enemy
        // while it was there; the stun roll draws once per enemy struck.
        target.applyStagger(stats.staggerDuration);
        if (rollStun(this.rng, stats.stunChance)) target.applyStun(stats.stunDuration);
        this.damage(target, damage);
      }
    }
  }

  private get hasAtlas(): boolean {
    return this.scene.anims.exists(CHAIN_CLIP);
  }

  /** Put one strip between two points — the caster and a target, or two enemies — fresh at the clip's first frame. */
  private lay(from: Readonly<Vec2>, to: Readonly<Vec2>): void {
    if (this.live.length >= MAX_SEGMENTS) return;
    const pose = chainSegmentPose(from, to);
    const strip = this.spare.pop() ?? this.makeStrip();
    strip.setPosition(pose.x, pose.y).setRotation(pose.rotation).setVisible(true);
    strip.setSize(pose.length, strip.height);
    if (this.hasAtlas) strip.setFrame(`${CHAIN_CLIP}.0`);
    this.live.push({ strip, elapsedMs: 0 });
  }

  /**
   * A strip anchored at its left-middle, so `setPosition` puts that end on the
   * start point and the rotation swings the rest onto the target. The atlas
   * strip tiles the chain art; the placeholder tiles the `fx_bolt` bar.
   */
  private makeStrip(): Phaser.GameObjects.TileSprite {
    const first = FRAMES[`${CHAIN_CLIP}.0`];
    const strip = this.hasAtlas
      ? this.scene.add.tileSprite(0, 0, first.w, first.h, first.page, `${CHAIN_CLIP}.0`)
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
