import Phaser from 'phaser';
import type { Vec2 } from '../core/input';
import {
  MAX_BOULDERS,
  advanceOrbit,
  boulderAngles,
  boulderPosition,
} from '../core/orbitingBoulders';
import { Spell } from '../core/spell';
import type { SpellStatsBySpell, StattedSpellId } from '../core/spellStats';
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

/**
 * A ring of bodies circling the caster (spec §5 "Earth — Orbiting Boulders",
 * Phase 2 spec §9.4 "Lightning Sword"): `count` of them at `orbitRadius`,
 * turning `orbitSpeed` rad/s, each `size` px across. What a body does to the
 * enemy it rolls over is the one thing left to a subclass — Lightning's blade
 * cuts and staggers — so #142 generalised this out of Phase 1's Earth ring
 * rather than copying it. #143 retired that ring's own spell: `earth` is Earth
 * Spike now, and the stones live on in `spells/EarthShieldSpell.ts`, which
 * carries a pool of its own instead of extending this.
 *
 * The rules — spacing, the turn, the position — live in
 * `core/orbitingBoulders.ts`; this class owns the body pool, registers it with
 * `CollisionSystem` (the one place overlaps are wired, CO-032) and hands each
 * overlap to `onHit`.
 *
 * A ring has no cooldown, so it overrides `tick` and never sees the scheduler:
 * every frame the ring turns and each body is placed from the live stats, which
 * is what makes a passive take effect on the next frame — a wider orbit moves
 * the ring out, a higher count joins a body and the others re-space.
 */
export abstract class OrbitingBodySpell<S extends StattedSpellId> extends Spell<S> {
  private readonly group: Phaser.Physics.Arcade.Group;
  protected readonly caster: Readonly<Vec2>;
  private readonly look: BodyLook;
  /** Where body 0 is on the ring, in radians; the rest are spaced from it. */
  private angle = 0;

  protected constructor(
    scene: Phaser.Scene,
    id: S,
    caster: Readonly<Vec2>,
    collisions: CollisionSystem,
    stats: SpellStatsBySpell[S],
    look: BodyLook = BOULDER_LOOK,
  ) {
    super(id, stats);
    this.caster = caster;
    this.look = look;
    this.group = scene.physics.add.group({
      classType: Boulder,
      maxSize: MAX_BOULDERS,
      // Bodies are placed from `tick`, which only runs while Game does, so a
      // paused scene freezes the ring.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => {
      if (!(hitbox instanceof Boulder) || !hitbox.active || !enemy.active) return;
      this.onHit(enemy, hitbox);
    });
    // The ring is up from the first frame, not one tick later.
    this.place();
  }

  /** Bodies on the ring right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  protected override tick(deltaS: number): void {
    this.angle = advanceOrbit(this.angle, this.orbit.orbitSpeed, deltaS);
    this.place();
  }

  /** Never called: a ring has no cast, it is always out. */
  protected cast(): void {}

  /** The live block, as the ring reads it. */
  protected get orbit(): Readonly<OrbitStats> {
    return this.stats as Readonly<OrbitStats>;
  }

  /** One body rolled over one live enemy. */
  protected abstract onHit(enemy: Enemy, body: Boulder): void;

  /**
   * How a body is turned at `angle` on the ring, every frame: a boulder is a
   * disc that only rolls; a blade lies along the orbit.
   */
  protected abstract orient(body: Boulder, angle: number): void;

  /**
   * Put `count` bodies on the ring at the live radius and size. Bodies are
   * taken from and returned to the pool as the count changes, and every one is
   * repositioned from the same base angle, so the spacing is even every frame.
   */
  private place(): void {
    const { count, orbitRadius, size } = this.orbit;
    const angles = boulderAngles(this.angle, count);
    const live = this.liveBodies();
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
      if (body) this.orient(body, angle);
    });
  }

  /** Live bodies in pool order, so the same object keeps the same slot frame to frame. */
  private liveBodies(): Boulder[] {
    const live: Boulder[] = [];
    for (const child of this.group.getChildren()) {
      if (child instanceof Boulder && child.active) live.push(child);
    }
    return live;
  }
}
