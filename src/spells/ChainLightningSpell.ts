import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { CHAIN_CLIP, FX_DEPTH } from '../config/fx';
import { ATLAS_KEY, FRAMES } from '../config/frames';
import { resolveCast } from '../core/chainLightning';
import { chainFrame, chainSegmentPose } from '../core/fx';
import type { Vec2 } from '../core/input';
import { Spell } from '../core/spell';
import type { LightningStats } from '../core/spellStats';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/**
 * Chain segments that may be up at once. A cast draws `strikes * chains` at
 * most — a maxed build is a handful — and each lives one clip cycle, far
 * shorter than any cooldown a perk can reach; the headroom covers a stalled
 * frame paying out several casts. Past it a segment is dropped, never queued.
 */
const MAX_SEGMENTS = 32;

/** One chain jump on screen: a tiled strip between two enemies, stepped on the run clock. */
interface Segment {
  readonly strip: Phaser.GameObjects.TileSprite;
  elapsedMs: number;
}

/**
 * Lightning (spec §5 "Lightning — Chain Lightning"): every `cooldown` s,
 * `strikes` bolts leave the caster. Each hits the nearest enemy for `damage`,
 * then chains up to `chains` times to the nearest unhit enemy within
 * `chainRange` for `damage * chainFalloff`. Every enemy struck is stunned for
 * `stun` s.
 *
 * The rules — where a bolt starts, who it jumps to, what each hit pays — live in
 * `core/chainLightning.ts`. A cast is instantaneous and resolved against the
 * live enemies geometrically, like Ice, so it puts no body in the world.
 *
 * FX (CO-082): `lightning.strike` and `lightning.impact` play on each bolt's
 * first target, and every jump lays a tiled `lightning.chain` strip from one
 * enemy to the next for one pass of the clip, cycled on the run clock so a
 * paused run holds it. With no atlas the strip is the `fx_bolt` placeholder.
 * The sparks on a stunned enemy are the overlay pool's, driven from its status.
 */
export class ChainLightningSpell extends Spell<'lightning'> {
  private readonly scene: Phaser.Scene;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly live: Segment[] = [];
  private readonly spare: Phaser.GameObjects.TileSprite[] = [];

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<LightningStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('lightning', stats);
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
  }

  /** Chain strips on screen right now. */
  get liveSegments(): number {
    return this.live.length;
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

  /** One cast. Positions are read before any damage lands, so a killing blow still draws to where the enemy stood. */
  protected cast(): void {
    const stats = this.stats;
    const bolts = resolveCast(this.caster, this.enemies.live, stats);
    if (bolts.length === 0) return;

    for (const bolt of bolts) {
      const [first] = bolt;
      if (!first) continue;
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
        target.applyStun(stats.stun);
        this.damage(target, damage);
      }
    }
  }

  private get hasAtlas(): boolean {
    return this.scene.anims.exists(CHAIN_CLIP);
  }

  /** Put one strip between two enemies, fresh at the clip's first frame. */
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
   * first enemy and the rotation swings the rest onto the second. The atlas
   * strip tiles the chain art; the placeholder tiles the `fx_bolt` bar.
   */
  private makeStrip(): Phaser.GameObjects.TileSprite {
    const first = FRAMES[`${CHAIN_CLIP}.0`];
    const strip = this.hasAtlas
      ? this.scene.add.tileSprite(0, 0, first.w, first.h, ATLAS_KEY, `${CHAIN_CLIP}.0`)
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
