import Phaser from 'phaser';
import { MAX_LIVE_PICKUPS, RELIC_COUNT, type PickupKind } from '../config/pickups';
import { canDrop } from '../core/pickups';
import { Pickup } from '../entities/Pickup';
import type { PickupTarget } from './GemPool';

/** What a collected pickup was, for the scene to act on. */
export interface Collected {
  kind: PickupKind;
  value: number;
}

/**
 * Every floor pickup but XP gems (#195), mirroring `GemPool`: one Arcade
 * group of reusable `Pickup` sprites, capped, and reclaimed when collected.
 * Nothing needs cleaning up at run end: the group dies with the scene.
 *
 * The group holds `MAX_LIVE_PICKUPS` drops plus `RELIC_COUNT` relics. Drops
 * are counted against their own cap here rather than left to the group's
 * `maxSize`, which alone would let a drop take a collected relic's slot.
 *
 * `group` is the overlap target for collection (CollisionSystem, CO-032).
 */
export class PickupPool {
  readonly group: Phaser.Physics.Arcade.Group;
  /** Embers and consumables lying in the arena now; relics are not counted. */
  private drops = 0;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      classType: Pickup,
      maxSize: MAX_LIVE_PICKUPS + RELIC_COUNT,
      // Updated from `update` below with the player's position, and only while
      // Game runs, so a paused scene freezes them.
      runChildUpdate: false,
    });
  }

  /** Embers and consumables lying in the arena now. */
  get liveDrops(): number {
    return this.drops;
  }

  /** Live pickups of each kind: the test hook's view of the floor. */
  countsByKind(): Record<PickupKind, number> {
    const counts: Record<PickupKind, number> = { ember: 0, consumable: 0, relic: 0 };
    for (const child of this.group.getChildren()) {
      if (child instanceof Pickup && child.active) counts[child.kind] += 1;
    }
    return counts;
  }

  /**
   * Drop an Ember or a consumable at (x, y). Returns false when the drop cap
   * is full and nothing was placed: the caller credits a lost Ember to the run
   * (spec §4) and lets a lost consumable go.
   */
  drop(kind: Exclude<PickupKind, 'relic'>, x: number, y: number, value = 0): boolean {
    if (!canDrop(this.drops)) return false;
    if (!this.spawn(kind, x, y, value)) return false;
    this.drops += 1;
    return true;
  }

  /** Place one relic at (x, y) (spec §5). Its slot is reserved, so it only fails past `RELIC_COUNT`. */
  placeRelic(x: number, y: number): boolean {
    return this.spawn('relic', x, y) !== null;
  }

  /** Pull every in-range Ember and consumable toward `target`; relics and the rest lie still. */
  update(target: PickupTarget): void {
    for (const child of this.group.getChildren()) {
      if (child instanceof Pickup && child.active) child.drift(target, target.pickupRadius);
    }
  }

  /**
   * Take a pickup the player has touched. Returns what it was, or `null` for
   * one already taken this frame, so a double overlap cannot pay twice.
   */
  collect(pickup: Pickup): Collected | null {
    if (!pickup.active) return null;
    const collected = { kind: pickup.kind, value: pickup.value };
    pickup.despawn();
    if (collected.kind !== 'relic') this.drops -= 1;
    return collected;
  }

  private spawn(kind: PickupKind, x: number, y: number, value = 0): Pickup | null {
    const pickup = this.group.get(x, y) as Pickup | null;
    if (!pickup) return null;
    pickup.spawn(kind, x, y, value);
    return pickup;
  }
}
