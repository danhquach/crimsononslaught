import Phaser from 'phaser';
import type { EnemyType } from '../config/enemies';
import { GEM_XP_VALUE, MAX_LIVE_GEMS } from '../config/gems';
import { gemDropCount, type Vec2 } from '../core/gems';
import { XpGem } from '../entities/XpGem';

/**
 * How far apart the gems of a multi-gem drop are placed, so a tank's three do
 * not sit on the exact same pixel. Well inside the pickup radius, so one pass
 * over the death spot still takes all three.
 */
const DROP_SPREAD = 12;

/** What the pool needs of the player: where they are, and how far they attract gems. */
export interface PickupTarget extends Vec2 {
  readonly pickupRadius: number;
}

/**
 * The XP gem object pool (spec §5), mirroring `EnemyPool`: one Arcade group of
 * reusable `XpGem` sprites, so a run allocates gems at worst once and never
 * again. Drops past `MAX_LIVE_GEMS` are dropped rather than queued.
 *
 * `group` is the overlap target for collection (CollisionSystem, CO-032).
 */
export class GemPool {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      classType: XpGem,
      maxSize: MAX_LIVE_GEMS,
      // Gems are updated from `update` below with the player's position, and
      // only while Game runs, so a paused scene freezes them.
      runChildUpdate: false,
    });
  }

  /** Gems currently lying in the world; pooled-but-collected ones do not count. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /**
   * Drop one death's worth of gems at (x, y) — 1, or 3 for a tank (spec §5).
   * Multi-gem drops are spread on a small circle so they are all reachable
   * without overlapping. Returns how many were actually placed.
   */
  dropFor(type: EnemyType, x: number, y: number): number {
    const count = gemDropCount(type);
    let placed = 0;
    for (let i = 0; i < count; i++) {
      // A single gem lands exactly on the death spot; a group rings it.
      const angle = (i / count) * Math.PI * 2;
      const offset = count > 1 ? DROP_SPREAD : 0;
      if (this.spawn(x + Math.cos(angle) * offset, y + Math.sin(angle) * offset)) placed++;
    }
    return placed;
  }

  /** Place one gem, or `null` when the pool is full. */
  spawn(x: number, y: number): XpGem | null {
    const gem = this.group.get(x, y) as XpGem | null;
    if (!gem) return null;
    gem.spawn(x, y);
    return gem;
  }

  /**
   * Pull every in-range gem toward `target`; the rest lie still. The radius is
   * the target's own (`Player.pickupRadius`, CO-092), so the caller does not
   * carry a player stat through the pool. `deltaMs` times the pickup bursts.
   */
  update(deltaMs: number, target: PickupTarget): void {
    for (const child of this.group.getChildren()) {
      if (child instanceof XpGem && child.active) {
        child.drift(deltaMs, target, target.pickupRadius);
      }
    }
  }

  /**
   * Take a gem the player has touched. Returns the XP it is worth, or 0 for a
   * gem that was already collected this frame, so a double overlap cannot pay
   * twice. The gem bursts where the player stood before it leaves the pool.
   */
  collect(gem: XpGem, at: Readonly<Vec2>): number {
    if (!gem.active || gem.isCollected) return 0;
    gem.collect(at);
    return GEM_XP_VALUE;
  }
}
