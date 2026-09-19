import type Phaser from 'phaser';
import { flightRotation } from '../core/fx';
import { isLiveTarget, retarget, steerToward, tickLifetime } from '../core/homing';
import type { Enemy } from './Enemy';
import { type ProjectileLook, Projectile } from './Projectile';

/**
 * A shot that bends toward its target every frame (#137, spec §9.2 "Fire
 * Dragon"). Launched like any `Projectile`, then `steer`ed by its spell's
 * `tick` with the frame window and the live crowd: the heading turns toward
 * the target by at most `turnRate * dt`, a target that dies is swapped for
 * the nearest live enemy within `targetRange` of the shot, and with none the
 * shot flies straight on until its `lifeS` runs out.
 *
 * Pooled the same way as its parent — a spell's group with
 * `classType: HomingProjectile` and the same `maxSize` cap — so a dragon costs
 * nothing until fired and is dropped, never queued, past the cap. It expires
 * on run-clock lifetime rather than distance from launch (`spent` is
 * overridden): a curving flight covers more ground than the line to its target.
 */
export class HomingProjectile extends Projectile {
  private target: Enemy | null = null;
  private turnRate = 0;
  private speed = 0;
  private targetRange = 0;
  private lifeS = 0;

  /** Take this pooled object out of the pool at (x, y), flying at `target` and turning after it. */
  fireAt(
    x: number,
    y: number,
    target: Enemy,
    speed: number,
    turnRate: number,
    lifeS: number,
    targetRange: number,
    look: ProjectileLook,
  ): void {
    this.target = target;
    this.speed = speed;
    this.turnRate = turnRate;
    this.lifeS = lifeS;
    this.targetRange = targetRange;
    // Range is what `Projectile.spent` measures; this shot times out instead,
    // so it is set past any flight, and the launch line is a plain `fire`.
    this.fire(x, y, target, speed, Infinity, look);
  }

  /**
   * One frame of flight. Called by the owning spell's `tick`, never by Phaser,
   * so a paused scene holds the shot where it is.
   */
  steer(deltaS: number, enemies: readonly Enemy[]): void {
    this.lifeS = tickLifetime(this.lifeS, deltaS);
    if (!isLiveTarget(this.target)) this.target = retarget(this, enemies, this.targetRange);
    if (!this.target) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const next = steerToward(body.velocity, this, this.target, this.turnRate * deltaS, this.speed);
    body.velocity.set(next.x, next.y);
    this.setRotation(flightRotation(next, this.rotation));
  }

  /** What it is flying at right now; null once its target is gone and nothing is in range. */
  get homingTarget(): Enemy | null {
    return this.target;
  }

  /** Whether its lifetime has run out. */
  override get spent(): boolean {
    return this.lifeS <= 0;
  }

  /** Return to the pool, dropping the target so a pooled reference never outlives the enemy. */
  override despawn(): void {
    this.target = null;
    super.despawn();
  }
}
