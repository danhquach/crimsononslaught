import type Phaser from 'phaser';
import type { Vec2 } from '../core/input';
import type { OrbitPhase } from '../core/orbitCycle';
import { Spell } from '../core/spell';
import type { SpellStatsBySpell, StattedSpellId } from '../core/spellStats';
import { BOULDER_LOOK, type Boulder, type BodyLook } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import type { CollisionSystem } from '../systems/CollisionSystem';
import { OrbitRing, type OrbitRingStats } from './OrbitRing';

/**
 * A ring of bodies circling the caster, out for `uptime` s and gone for
 * `recharge` s (Phase 2 spec §9.4 "Lightning Sword", #406): `count` of them at
 * `orbitRadius`, turning `orbitSpeed` rad/s, each `size` px across. What a body
 * does to the enemy it rolls over, and what it does as the ring vanishes, is
 * left to a subclass — Lightning's blade cuts and staggers, and ends in a chain
 * burst. #142 generalised this out of Phase 1's Earth ring; #143 retired that
 * ring's own spell, and the stones live on in `spells/EarthShieldSpell.ts`,
 * which carries a pool of its own instead of extending this.
 *
 * The ring itself — body pool, placement, the out-and-recharge cycle — is
 * `OrbitRing`, shared with Earth Shield. This class registers nothing of its
 * own: it ticks the ring, and hands each overlap to `onHit`.
 *
 * A ring has no cooldown, so it overrides `tick` and never sees the scheduler.
 * Every frame the ring turns and each body is placed from the live stats, which
 * is what makes a passive take effect on the next frame — a wider orbit moves
 * the ring out, a higher count joins a body and the others re-space.
 */
export abstract class OrbitingBodySpell<S extends StattedSpellId> extends Spell<S> {
  private readonly ring: OrbitRing;
  protected readonly caster: Readonly<Vec2>;

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
    this.ring = new OrbitRing(
      scene,
      caster,
      collisions,
      (enemy, body) => this.onHit(enemy, body),
      this.orbit,
      look,
    );
    // The ring is up from the first frame, not one tick later.
    this.ring.place(this.orbit, (body, angle) => this.orient(body, angle));
  }

  /** Bodies on the ring right now; 0 while it recharges. */
  get liveCount(): number {
    return this.ring.liveCount;
  }

  /** Test hook (#406): whether the ring is out or recharging. */
  get cyclePhase(): OrbitPhase {
    return this.ring.phase;
  }

  protected override tick(deltaS: number): void {
    const { appeared, vanished } = this.ring.step(deltaS, this.orbit);
    // The bodies are still where they were: the subclass reads them, then the ring is cleared.
    if (vanished) this.onVanish(this.ring.bodies);
    this.ring.place(this.orbit, (body, angle) => this.orient(body, angle));
    if (appeared) this.onCast?.();
  }

  /** Never called: a ring has no cast, it is out and then recharging. */
  protected cast(): void {}

  /** The live block, as the ring reads it. */
  protected get orbit(): Readonly<OrbitRingStats> {
    return this.stats as Readonly<OrbitRingStats>;
  }

  /** One body rolled over one live enemy. */
  protected abstract onHit(enemy: Enemy, body: Boulder): void;

  /** The ring's uptime ran out, with `bodies` still in place; they are gone right after. */
  protected abstract onVanish(bodies: readonly Boulder[]): void;

  /**
   * How a body is turned at `angle` on the ring, every frame: a blade points
   * out along the radius.
   */
  protected abstract orient(body: Boulder, angle: number): void;
}
