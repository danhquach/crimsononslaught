import Phaser from 'phaser';
import {
  CONSUMABLE_KINDS,
  MAX_LIVE_PICKUPS,
  RELIC_COUNT,
  type ConsumableKind,
  type PickupKind,
} from '../config/pickups';
import { canDrop } from '../core/pickups';
import { Pickup } from '../entities/Pickup';
import type { PickupTarget } from './GemPool';

/** What a collected pickup was, for the scene to act on. */
export type Collected =
  | { kind: 'ember'; value: number }
  | { kind: 'consumable'; consumable: ConsumableKind }
  | { kind: 'relic' };

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
      if (live(child)) counts[child.kind] += 1;
    }
    return counts;
  }

  /** Live consumables of each kind (#128): the test hook's view of what they are. */
  consumablesByKind(): Record<ConsumableKind, number> {
    const counts = Object.fromEntries(CONSUMABLE_KINDS.map((k) => [k, 0])) as Record<
      ConsumableKind,
      number
    >;
    for (const child of this.group.getChildren()) {
      if (live(child) && child.kind === 'consumable') {
        counts[child.consumableKind] += 1;
      }
    }
    return counts;
  }

  /**
   * Drop an Ember worth `value` at (x, y). Returns false when the drop cap is
   * full and nothing was placed: the caller credits it to the run (spec §4).
   */
  dropEmber(x: number, y: number, value: number): boolean {
    return this.drop('ember', x, y, value);
  }

  /** Drop a `consumable` at (x, y) (#128). Returns false when the cap is full and it was lost. */
  dropConsumable(consumable: ConsumableKind, x: number, y: number): boolean {
    return this.drop('consumable', x, y, 0, consumable);
  }

  /** Place one relic at (x, y) (spec §5). Its slot is reserved, so it only fails past `RELIC_COUNT`. */
  placeRelic(x: number, y: number): boolean {
    return this.spawn('relic', x, y) !== null;
  }

  /**
   * Pull every in-range Ember and consumable toward `target`; relics and the
   * rest lie still. `deltaMs` times the pickup bursts (CO-106).
   */
  update(deltaMs: number, target: PickupTarget): void {
    for (const child of this.group.getChildren()) {
      if (child instanceof Pickup && child.active) {
        child.drift(deltaMs, target, target.pickupRadius);
      }
    }
  }

  /**
   * Take a pickup the player has touched. Returns what it was, or `null` for
   * one already taken, so a double overlap cannot pay twice. Its drop slot is
   * freed at once; the sprite itself bursts (CO-106) and returns to the group
   * after, so a drop that finds the whole group bursting is refused like one
   * past the cap.
   */
  collect(pickup: Pickup): Collected | null {
    if (!pickup.active || pickup.isCollected) return null;
    const collected = describe(pickup);
    pickup.collect();
    if (collected.kind !== 'relic') this.drops -= 1;
    return collected;
  }

  private drop(
    kind: Exclude<PickupKind, 'relic'>,
    x: number,
    y: number,
    value: number,
    consumable?: ConsumableKind,
  ): boolean {
    if (!canDrop(this.drops)) return false;
    if (!this.spawn(kind, x, y, value, consumable)) return false;
    this.drops += 1;
    return true;
  }

  private spawn(
    kind: PickupKind,
    x: number,
    y: number,
    value = 0,
    consumable?: ConsumableKind,
  ): Pickup | null {
    const pickup = this.group.get(x, y) as Pickup | null;
    if (!pickup) return null;
    pickup.spawn(kind, x, y, value, consumable);
    return pickup;
  }
}

/** On the floor to be taken: in the pool's use, and not already bursting. */
function live(child: Phaser.GameObjects.GameObject): child is Pickup {
  return child instanceof Pickup && child.active && !child.isCollected;
}

function describe(pickup: Pickup): Collected {
  switch (pickup.kind) {
    case 'ember':
      return { kind: 'ember', value: pickup.value };
    case 'consumable':
      return { kind: 'consumable', consumable: pickup.consumableKind };
    case 'relic':
      return { kind: 'relic' };
  }
}
