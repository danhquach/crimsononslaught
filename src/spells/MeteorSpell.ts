import { ART_BOXES } from '../config/frames';
import { METEOR_POND_LOOK, METEOR_SCATTER_PX, type StrikeSpellId } from '../config/strikes';
import { areaArtScale } from '../core/fx';
import { createArea, membersOf, type GroundArea } from '../core/groundArea';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import {
  blastFalloff,
  createTelegraph,
  pickImpactPoint,
  strikeTargets,
  type Telegraph,
} from '../core/skyStrike';
import { Spell, anyWithin, nearestEnemies } from '../core/spell';
import type { MeteorStats } from '../core/spellStats';
import type { AreaPool } from '../systems/AreaPool';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { TelegraphPool } from '../systems/TelegraphPool';
import type { DamageSink } from './DamageSink';

/** Test hook (CO-167): how many recent landing points the spell remembers. */
const RECENT_LANDINGS = 8;

/** Everything one strike will ever use, read once at its cast (spec §6.2). */
interface StrikeSnapshot {
  /** The blast at the centre: `damage × aoeDamageFactor`. */
  readonly blast: number;
  readonly edgeFactor: number;
  readonly pondRadius: number;
  readonly pondDuration: number;
  readonly pondTickDamage: number;
  readonly pondTickRate: number;
}

/** CO-167 test hook: blast damage dealt near the centre and near the rim, before crits. */
export interface BlastSpread {
  /** Hits within half the blast's reach, and the damage they were dealt. */
  readonly innerHits: number;
  readonly innerDamage: number;
  /** Hits in the outer half, out to the rim. */
  readonly outerHits: number;
  readonly outerDamage: number;
}

/**
 * Meteor (#138; CO-167 rework spec): the sky strike. One cast picks the nearest
 * enemy within `targetRange`, commits to a point scattered around it through
 * the seeded RNG, and sends a meteor falling onto it; `fallDelay` later the
 * strike lands on that point — whether the enemy it aimed at is still alive,
 * still there, or long gone. Everything within `aoeRadius` takes the blast,
 * hardest at the centre and `aoeEdgeFactor` of it at the rim, and a magma pond
 * is left on the point that burns whatever stands in it every `pondTickRate`.
 *
 * The rules are `core/skyStrike.ts`'s, the meteor on screen is
 * `systems/TelegraphPool.ts`'s and the pond is a ground area in
 * `systems/AreaPool.ts`; this class only chooses where a cast lands and what
 * the landing costs the crowd. Nothing here touches the physics world: a
 * strike has no body, so `CollisionSystem` never learns it exists. Damage goes
 * through `DamageSink`, which takes an enemy, so neither the blast nor the
 * pond can reach the player.
 *
 * Spec §6.2: a meteor falling has a finite lifetime, so every number it will
 * ever use, its pond's included, is read once at the cast and closed over — a
 * passive taken while one is in the air grows the next one, never the one
 * already falling.
 */
export class MeteorSpell extends Spell<StrikeSpellId> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly telegraphs: TelegraphPool;
  private readonly areas: AreaPool;
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
  /** Test hook (CO-167): ponds placed, and enemies their ticks have burned. */
  private ponds = 0;
  private pondBurns = 0;
  /** Test hook (CO-167): where blast damage landed across the crowd. */
  private spread: BlastSpread = { innerHits: 0, innerDamage: 0, outerHits: 0, outerDamage: 0 };
  /**
   * Test hook (CO-167): the last few points strikes landed on, newest last. A
   * pond outlives only the landing that left it, so the one under any live pond
   * is here whatever the browser suite happened to sample.
   */
  private landedAt: Vec2[] = [];

  constructor(
    id: StrikeSpellId,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<MeteorStats>,
    damage: DamageSink,
    telegraphs: TelegraphPool,
    areas: AreaPool,
    fx: FxPool,
    rng: Rng,
  ) {
    super(id, { ...stats });
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.telegraphs = telegraphs;
    this.areas = areas;
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

  /** Ponds placed so far; a pond dropped at the area cap is not counted. */
  get pondsPlaced(): number {
    return this.ponds;
  }

  /** Enemies burned by pond ticks so far: one per enemy per tick. */
  get pondHits(): number {
    return this.pondBurns;
  }

  /** The last points strikes landed on, newest last. */
  get recentLandings(): readonly Readonly<Vec2>[] {
    return this.landedAt;
  }

  /** Blast damage dealt near the centre and near the rim so far, before crits. */
  get blastSpread(): BlastSpread {
    return this.spread;
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
    const strike: StrikeSnapshot = {
      blast: damage * aoeDamageFactor,
      edgeFactor: this.stats.aoeEdgeFactor,
      pondRadius: this.stats.pondRadius,
      pondDuration: this.stats.pondDuration,
      pondTickDamage: this.stats.pondTickDamage,
      pondTickRate: this.stats.pondTickRate,
    };
    for (let i = 0; i < Math.floor(projectiles); i += 1) {
      const point = pickImpactPoint(this.rng, target, METEOR_SCATTER_PX);
      const telegraph = createTelegraph(point, fallDelay, aoeRadius);
      if (this.telegraphs.place(telegraph, (landed) => this.land(landed, strike))) {
        this.commits += 1;
      }
    }
  }

  /**
   * The landing: the blast on everything standing within the committed reach
   * of the committed point, each enemy hit by its distance (`blastFalloff`),
   * the explosion drawn so its art spans the blast, and the pond left behind.
   * The target the cast aimed at plays no part any more — a dead one changes
   * nothing, one that walked away is simply not under it.
   *
   * The pond is placed after the blast and apart from it: an area pool at its
   * cap drops the pond, never the blast that already landed.
   */
  private land(telegraph: Readonly<Telegraph>, strike: StrikeSnapshot): void {
    const { radius } = telegraph;
    this.landings += 1;
    this.landedAt = [...this.landedAt, { x: telegraph.x, y: telegraph.y }].slice(-RECENT_LANDINGS);
    this.fx.burst('fire.explode', telegraph.x, telegraph.y, {
      scale: areaArtScale(radius, ART_BOXES['fire.explode'].w),
    });
    const targets = strikeTargets(telegraph, this.enemies.live, radius);
    this.widestLanding = Math.max(this.widestLanding, targets.length);
    for (const enemy of targets) {
      const distance = Math.hypot(enemy.x - telegraph.x, enemy.y - telegraph.y);
      const dealt = strike.blast * blastFalloff(distance, radius, strike.edgeFactor);
      this.struck += 1;
      this.recordSpread(distance <= radius / 2, dealt);
      this.damage(enemy, dealt);
    }
    const pond = createArea(telegraph, {
      radius: strike.pondRadius,
      durationS: strike.pondDuration,
      tickEveryS: strike.pondTickRate,
    });
    const tickDamage = strike.pondTickDamage;
    if (this.areas.place(pond, (live) => this.burn(live, tickDamage), {}, METEOR_POND_LOOK)) {
      this.ponds += 1;
    }
  }

  /** One pond tick: every live enemy inside is burned, as a `tick` that never crits. */
  private burn(pond: Readonly<GroundArea>, tickDamage: number): void {
    for (const enemy of membersOf(pond, this.enemies.live)) {
      this.pondBurns += 1;
      this.damage(enemy, tickDamage, 'tick');
    }
  }

  private recordSpread(inner: boolean, dealt: number): void {
    const s = this.spread;
    this.spread = inner
      ? { ...s, innerHits: s.innerHits + 1, innerDamage: s.innerDamage + dealt }
      : { ...s, outerHits: s.outerHits + 1, outerDamage: s.outerDamage + dealt };
  }
}
