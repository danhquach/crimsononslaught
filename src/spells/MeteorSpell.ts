import { METEOR_SCATTER_PX, type StrikeSpellId } from '../config/strikes';
import { explosionScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import { createTelegraph, pickImpactPoint, strikeTargets, type Telegraph } from '../core/skyStrike';
import { Spell, anyWithin, nearestEnemies } from '../core/spell';
import type { MeteorStats } from '../core/spellStats';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { TelegraphPool } from '../systems/TelegraphPool';
import type { DamageSink } from './DamageSink';

/**
 * Meteor (#138, Phase 2 spec §9.2): the sky strike. One cast picks the nearest
 * enemy within `targetRange`, commits to a point scattered around it through
 * the seeded RNG, and puts a telegraph there; `fallDelay` later the strike
 * lands on that point and everything within `aoeRadius` takes the blast —
 * whether the enemy it aimed at is still alive, still there, or long gone.
 *
 * The rules are `core/skyStrike.ts`'s and the marker on screen is
 * `systems/TelegraphPool.ts`'s; this class only chooses where a cast lands and
 * what the landing costs the crowd. Nothing here touches the physics world: a
 * strike has no body, so `CollisionSystem` never learns it exists.
 *
 * Spec §6.2: a meteor falling has a finite lifetime, so every number it will
 * ever use is read once at the cast and closed over — a Big Blast or a Might
 * taken while one is in the air grows the next one, never the one already
 * telegraphed on the ground.
 */
export class MeteorSpell extends Spell<StrikeSpellId> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly telegraphs: TelegraphPool;
  private readonly fx: FxPool;
  private readonly rng: Rng;
  /** Test hook (#138): strikes this spell has committed to a point. */
  private commits = 0;
  /** Test hook (#138): strikes that have landed. */
  private landings = 0;
  /** Test hook (#138): enemies its landings have hit, across every cast. */
  private struck = 0;
  /** Test hook (#187): the most enemies one landing has hit. */
  private widestLanding = 0;

  constructor(
    id: StrikeSpellId,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<MeteorStats>,
    damage: DamageSink,
    telegraphs: TelegraphPool,
    fx: FxPool,
    rng: Rng,
  ) {
    super(id, { ...stats });
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.telegraphs = telegraphs;
    this.fx = fx;
    this.rng = rng;
  }

  /** Strikes committed so far — what the browser suite watches a run cast. */
  get committed(): number {
    return this.commits;
  }

  /** Strikes that have landed so far. */
  get landed(): number {
    return this.landings;
  }

  /** Enemies hit by landings so far: one per enemy per strike. */
  get hits(): number {
    return this.struck;
  }

  /** The most enemies a single landing has hit so far. */
  get widest(): number {
    return this.widestLanding;
  }

  /** The live block, as the strike stats this id resolves to. */
  get strikeStats(): Readonly<MeteorStats> {
    return this.stats;
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /**
   * One cast: `projectiles` strikes, each aimed at the nearest enemy within
   * `targetRange` and committed to a point scattered around it. With nothing in
   * range the cast is spent on nothing — a meteor has no one to fall on, and
   * dropping it at the player's feet would land on an empty arena.
   *
   * A pool at its cap drops the strike, so the cast is spent — the same rule as
   * a projectile past `MAX_LIVE_PROJECTILES`: never queued.
   */
  protected cast(): void {
    const { damage, aoeRadius, aoeDamageFactor, projectiles, targetRange, fallDelay } = this.stats;
    const [target] = nearestEnemies(this.caster, this.enemies.live, 1, targetRange);
    if (!target) return;
    const blast = damage * aoeDamageFactor;
    for (let i = 0; i < Math.floor(projectiles); i += 1) {
      const point = pickImpactPoint(this.rng, target, METEOR_SCATTER_PX);
      const telegraph = createTelegraph(point, fallDelay, aoeRadius);
      if (this.telegraphs.place(telegraph, (landed) => this.land(landed, blast))) {
        this.commits += 1;
      }
    }
  }

  /**
   * The landing: the blast on everything standing within the committed reach
   * of the committed point, and the explosion drawn at that reach. The target
   * the cast aimed at plays no part any more — a dead one changes nothing, one
   * that walked away is simply not under it.
   */
  private land(telegraph: Readonly<Telegraph>, blast: number): void {
    this.landings += 1;
    this.fx.burst('fire.explode', telegraph.x, telegraph.y, {
      scale: explosionScale(telegraph.radius),
    });
    const targets = strikeTargets(telegraph, this.enemies.live, telegraph.radius);
    this.widestLanding = Math.max(this.widestLanding, targets.length);
    for (const enemy of targets) {
      this.struck += 1;
      this.damage(enemy, blast);
    }
  }
}
