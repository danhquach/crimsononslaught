import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import {
  CONSUMABLE_TEXTURES,
  PICKUP_TEXTURES,
  type ConsumableKind,
  type PickupKind,
} from '../config/pickups';
import { pickupAnimation } from '../core/animation';
import { gemDrift, type Vec2 } from '../core/gems';
import { clearClip, clipDurationMs, showClip } from '../render/animate';

/**
 * One floor pickup (#195): an Ember or a consumable dropped where an enemy
 * died, or a relic placed in the arena at run start.
 *
 * Pooled — never constructed per drop. `systems/PickupPool.ts` owns the pool
 * and calls `spawn` / `despawn`; an inactive pickup has its body disabled, so
 * it costs nothing until reused.
 *
 * Embers and consumables drift in by the gem rule (`core/gems.ts#gemDrift`),
 * the same radius and speed. A relic never moves: the player walks to it.
 *
 * It shows its kind's atlas clip (CO-106) — a consumable its
 * `consumableKind`'s (#128): `idle` lying there or drifting in, and `pickup`
 * bursting where it was taken, body off and still `active` so the pool cannot
 * hand it out, before it is released. With no atlas it is its kind's
 * placeholder texture and leaves the moment it is taken.
 */
export class Pickup extends Phaser.Physics.Arcade.Sprite {
  private kindValue: PickupKind = 'ember';
  private worth = 0;
  private consumable: ConsumableKind = 'health';
  /** Run-clock ms of pickup clip left; the pickup is released when it runs out. */
  private burstMs = 0;
  private collected = false;
  private bodyRadius = 0;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, PICKUP_TEXTURES.ember);
  }

  get kind(): PickupKind {
    return this.kindValue;
  }

  /** Embers an Ember pickup is worth; 0 for the other kinds. */
  get value(): number {
    return this.worth;
  }

  /** What a consumable does on pickup (#128); meaningless for the other kinds. */
  get consumableKind(): ConsumableKind {
    return this.consumable;
  }

  /** Taken by the player and bursting: paid out, not yet back in the pool. */
  get isCollected(): boolean {
    return this.collected;
  }

  /**
   * Take this pooled object out of the pool as a `kind` pickup lying at (x, y).
   * `consumable` is the kind of a consumable, and ignored for the rest.
   */
  spawn(
    kind: PickupKind,
    x: number,
    y: number,
    value = 0,
    consumable: ConsumableKind = 'health',
  ): void {
    this.kindValue = kind;
    this.worth = value;
    this.consumable = consumable;
    this.collected = false;
    this.burstMs = 0;
    clearClip(this);
    const texture = kind === 'consumable' ? CONSUMABLE_TEXTURES[consumable] : PICKUP_TEXTURES[kind];
    this.setTexture(texture);
    this.setOrigin(0.5, 0.5);
    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);
    this.bodyRadius = PLACEHOLDERS[texture].width / 2;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(
      this.bodyRadius,
      this.width / 2 - this.bodyRadius,
      this.height / 2 - this.bodyRadius,
    );
    this.show();
  }

  /** Return to the pool: inactive, invisible, body disabled. */
  despawn(): void {
    this.setVelocity(0, 0);
    this.disableBody(true, true);
  }

  /**
   * Driven by `PickupPool`, not Phaser, so a paused Game freezes the pickups
   * with it. `deltaMs` times the pickup burst.
   */
  drift(deltaMs: number, target: Readonly<Vec2>, radius: number): void {
    if (this.collected) {
      this.burstMs -= deltaMs;
      if (this.burstMs <= 0) this.despawn();
      return;
    }
    if (this.kindValue === 'relic') return;
    const { x, y } = gemDrift(this, target, radius);
    this.setVelocity(x, y);
  }

  /**
   * The player touched it: the pool has paid it out, the body is gone so it
   * cannot pay twice, and the burst plays where it lay.
   */
  collect(): void {
    this.collected = true;
    this.setVelocity(0, 0);
    this.disableBody(false, false);
    this.burstMs = this.show();
    if (this.burstMs <= 0) this.despawn();
  }

  /** The clip for this step; returns its run-clock length for the burst to wait on. */
  private show(): number {
    const name = pickupAnimation({
      kind: this.kindValue,
      consumable: this.consumable,
      collected: this.collected,
    });
    showClip(this, name, this.bodyRadius);
    return clipDurationMs(this.scene, name);
  }
}
