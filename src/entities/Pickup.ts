import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { PICKUP_TEXTURES, type PickupKind } from '../config/pickups';
import { gemDrift, type Vec2 } from '../core/gems';

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
 * There is no art yet, so a pickup is its kind's placeholder texture and
 * leaves the moment it is taken.
 */
export class Pickup extends Phaser.Physics.Arcade.Sprite {
  private kindValue: PickupKind = 'ember';
  private worth = 0;

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

  /** Take this pooled object out of the pool as a `kind` pickup lying at (x, y). */
  spawn(kind: PickupKind, x: number, y: number, value = 0): void {
    this.kindValue = kind;
    this.worth = value;
    const texture = PICKUP_TEXTURES[kind];
    this.setTexture(texture);
    this.setOrigin(0.5, 0.5);
    this.enableBody(true, x, y, true, true);
    this.setVelocity(0, 0);
    const radius = PLACEHOLDERS[texture].width / 2;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(radius, this.width / 2 - radius, this.height / 2 - radius);
  }

  /** Return to the pool: inactive, invisible, body disabled. */
  despawn(): void {
    this.setVelocity(0, 0);
    this.disableBody(true, true);
  }

  /** Driven by `PickupPool`, not Phaser, so a paused Game freezes the pickups with it. */
  drift(target: Readonly<Vec2>, radius: number): void {
    if (this.kindValue === 'relic') return;
    const { x, y } = gemDrift(this, target, radius);
    this.setVelocity(x, y);
  }
}
