import Phaser from 'phaser';
import type { Vec2 } from '../core/input';
import {
  endEarly,
  isOut,
  startOrbitCycle,
  stepOrbitCycle,
  type OrbitCycleRule,
  type OrbitCycleState,
  type OrbitPhase,
} from '../core/orbitCycle';
import {
  MAX_BOULDERS,
  advanceOrbit,
  boulderAngles,
  boulderPosition,
} from '../core/orbitingBoulders';
import { BOULDER_LOOK, Boulder, type BodyLook } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import type { CollisionSystem } from '../systems/CollisionSystem';

/** The fields a ring needs from its block; every orbiting spell's stats carry them. */
export interface OrbitStats {
  count: number;
  orbitRadius: number;
  orbitSpeed: number;
  size: number;
}

/** What a ring reads from its spell's live block each frame: the ring itself and the cycle it runs on. */
export type OrbitRingStats = OrbitStats & OrbitCycleRule;

/**
 * A ring of pooled bodies circling a caster, out for `uptime` s and gone for
 * `recharge` s (#406): the part Lightning Sword's blades and Earth Shield's
 * stones share. The rules (spacing, the turn, the position, the cycle) are
 * `core/orbitingBoulders.ts` and `core/orbitCycle.ts`; this class owns the body
 * pool, registers it with `CollisionSystem` (the one place overlaps are wired,
 * CO-032) and hands each overlap to the spell.
 *
 * While the ring is recharging every body is despawned, so there is nothing to
 * overlap and nothing to hit. A spell reacts to `step`'s `vanished` while the
 * bodies are still where they were, then calls `place`, which clears the ring;
 * `appeared` is the frame the bodies return.
 *
 * Bodies are placed from the spell's `tick`, which only runs while Game does,
 * so a paused scene freezes the ring. Stats are read live every frame, so a
 * passive takes effect on the next one.
 */
export class OrbitRing {
  private readonly group: Phaser.Physics.Arcade.Group;
  /** Where body 0 is on the ring, in radians; the rest are spaced from it. */
  private angle = 0;
  private cycle: OrbitCycleState;
  private readonly caster: Readonly<Vec2>;
  private readonly look: BodyLook;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    collisions: CollisionSystem,
    onOverlap: (enemy: Enemy, body: Boulder) => void,
    rule: Readonly<OrbitCycleRule>,
    look: BodyLook = BOULDER_LOOK,
  ) {
    this.caster = caster;
    this.look = look;
    this.cycle = startOrbitCycle(rule);
    this.group = scene.physics.add.group({
      classType: Boulder,
      maxSize: MAX_BOULDERS,
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => {
      if (!(hitbox instanceof Boulder) || !hitbox.active || !enemy.active) return;
      onOverlap(enemy, hitbox);
    });
  }

  /** Bodies on the ring right now; 0 while it recharges. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  get phase(): OrbitPhase {
    return this.cycle.phase;
  }

  get isOut(): boolean {
    return isOut(this.cycle);
  }

  /** Live bodies in pool order, so the same object keeps the same slot frame to frame. */
  get bodies(): Boulder[] {
    const live: Boulder[] = [];
    for (const child of this.group.getChildren()) {
      if (child instanceof Boulder && child.active) live.push(child);
    }
    return live;
  }

  /** Turn the ring and run the cycle one frame; says whether the bodies vanished or returned in it. */
  step(deltaS: number, stats: Readonly<OrbitRingStats>): { appeared: boolean; vanished: boolean } {
    this.angle = advanceOrbit(this.angle, stats.orbitSpeed, deltaS);
    const step = stepOrbitCycle(this.cycle, deltaS, stats);
    this.cycle = step.state;
    return { appeared: step.appeared, vanished: step.vanished };
  }

  /** End the uptime now (a broken pool); true when the bodies were out and now vanish. */
  endEarly(recharge: number): boolean {
    const result = endEarly(this.cycle, recharge);
    this.cycle = result.state;
    return result.vanished;
  }

  /**
   * Put `count` bodies on the ring at the live radius and size, or take them
   * off the board while the ring recharges. Bodies are taken from and returned
   * to the pool as the count changes, and every one is repositioned from the
   * same base angle, so the spacing is even every frame. `shape` turns each
   * body to suit what it is (a blade points out, a stone rolls).
   */
  place(stats: Readonly<OrbitStats>, shape: (body: Boulder, angle: number) => void): void {
    const live = this.bodies;
    if (!this.isOut) {
      for (const body of live) body.despawn();
      return;
    }
    const { count, orbitRadius, size } = stats;
    const angles = boulderAngles(this.angle, count);
    while (live.length > angles.length) live.pop()?.despawn();
    angles.forEach((angle, i) => {
      const { x, y } = boulderPosition(this.caster, orbitRadius, angle);
      let body = live[i];
      if (body) {
        body.setPosition(x, y);
        body.resize(size);
      } else {
        // Pool exhausted: the ring is short a body until the pool frees one.
        body = (this.group.get(x, y) as Boulder | null) ?? undefined;
        body?.spawn(x, y, size, this.look);
      }
      if (body) shape(body, angle);
    });
  }
}
