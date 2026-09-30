import { AREA_LOOKS, type AreaSpellId } from '../config/areas';
import { HAIL } from '../config/iceLevels';
import type { SpellLevel } from '../config/spellLevels';
import { recordCapped } from '../core/fireLevels';
import { novaScale } from '../core/fx';
import {
  areaStaggerS,
  createArea,
  densestSpot,
  membersOf,
  type GroundArea,
} from '../core/groundArea';
import { deepFreezeHit, hailsDue, isDeepFreezeTick, stormTickCount } from '../core/iceLevels';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import { Spell, anyWithin } from '../core/spell';
import type { GroundAreaStats } from '../core/spellStats';
import { Boss } from '../entities/Boss';
import type { AreaPool } from '../systems/AreaPool';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/**
 * What only Ice Storm's levels need (#328): the effects pool for the hail and
 * the deep freeze, and the hail's own random stream, so which enemy a
 * hailstone picks never shifts any other draw of the run. Handed to
 * `ice_blizzard` alone; Earthquake never gets it.
 */
export interface StormLevelKit {
  readonly fx: FxPool;
  readonly hailRng: Rng;
}

/** One patch's own count of its ticks and what it needs to run a level (#328), closed over at the cast. */
interface StormPatch {
  readonly kit: StormLevelKit;
  readonly level: SpellLevel;
  readonly patch: number;
  /** Ticks the patch will pay in all. */
  readonly count: number;
  readonly tickEveryS: number;
  tickNumber: number;
}

/** Ice Storm's level record, what the test hook reads (#328): cause and effect in one entry. */
export interface IceStormLevelReport {
  /** Each hailstone: the patch and tick it fell on, the enemies inside then, and whether it hit one. */
  hail: {
    level: SpellLevel;
    patch: number;
    tickNumber: number;
    inside: number;
    hit: boolean;
  }[];
  /** Each deep freeze: the patch's last paid tick, who was inside, how many were frozen after it, the boss's freeze if it was in. */
  deepFreezes: {
    level: SpellLevel;
    patch: number;
    tickNumber: number;
    count: number;
    inside: number;
    frozenAfter: number;
    bossFrozenS: number | null;
  }[];
  /** Patches placed, whatever their level. */
  patches: number;
  /** Hailstones that hit an enemy, all storms so far: a count the capped `hail` log cannot lose. */
  hailHits: number;
  /** Hailstones dropped per patch, hit or not, in the order the patches were placed: never dropped from the log's window. */
  hailPerPatch: number[];
}

/**
 * A persistent ground area (#135, Phase 2 spec §9): Ice Storm and Earthquake.
 * One cast drops a patch on the crowd, and the patch keeps damaging whatever
 * stands in it until its duration runs out: Ice Storm slowing it, Earthquake
 * staggering it (#220).
 *
 * One class serves both and `config/areas.ts` decides which is which, the way
 * `CompanionSpell` serves all four allies: they differ only in the numbers —
 * Ice trades damage for the element's signature slow, Earth trades the slow
 * for damage and a stutter — and a subclass each would be two copies of this
 * file.
 *
 * The rules are `core/groundArea.ts`'s and the patch on screen is
 * `systems/AreaPool.ts`'s; this class only chooses where a cast lands and what
 * a tick costs the enemies inside. Nothing here touches the physics world: a
 * patch has no body, so `CollisionSystem` never learns it exists.
 *
 * Spec §6.2: a patch has a finite lifetime, so every number it will ever use is
 * read once at the cast and closed over — a Haste or an Expanse taken while an
 * Ice Storm lies on the ground grows the next one, never the one the player is
 * already standing next to.
 */
export class GroundAreaSpell extends Spell<AreaSpellId> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly areas: AreaPool;
  private readonly rng: Rng;
  private readonly kit: StormLevelKit | undefined;
  private readonly hailLog: IceStormLevelReport['hail'] = [];
  private readonly deepFreezeLog: IceStormLevelReport['deepFreezes'] = [];
  private hailHits = 0;
  private readonly hailByPatch = new Map<number, number>();
  /** Test hook (#135): patches this spell has put on the ground. */
  private patches = 0;
  /** Test hook (#135): enemy-ticks its patches have paid out, across every cast. */
  private ticked = 0;
  /** Test hook (#235): staggers its ticks have applied, each to an enemy inside a patch. */
  private staggered = 0;

  constructor(
    id: AreaSpellId,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<GroundAreaStats>,
    damage: DamageSink,
    areas: AreaPool,
    rng: Rng,
    kit?: StormLevelKit,
  ) {
    super(id, { ...stats });
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.areas = areas;
    this.rng = rng;
    // Only Ice Storm has levels; Earthquake ignores a kit it was handed.
    this.kit = id === 'ice_blizzard' ? kit : undefined;
  }

  /** Test hook (#328): the hail and deep freezes this spell's storms have made. */
  get levelReport(): IceStormLevelReport {
    return {
      hail: [...this.hailLog],
      deepFreezes: [...this.deepFreezeLog],
      patches: this.patches,
      hailHits: this.hailHits,
      hailPerPatch: [...this.hailByPatch.values()],
    };
  }

  /** Patches placed so far — what the browser suite watches a run cast. */
  get placed(): number {
    return this.patches;
  }

  /** Enemy-ticks paid out so far: one per enemy per tick of every patch. */
  get hits(): number {
    return this.ticked;
  }

  /**
   * Staggers applied so far. A 0.2 s stagger is gone before most polls land,
   * so the browser suite counts them here rather than sampling enemies.
   */
  get staggers(): number {
    return this.staggered;
  }

  /** The live block, as the ground-area stats this id resolves to. */
  get areaStats(): Readonly<GroundAreaStats> {
    return this.stats;
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.areaStats.targetRange);
  }

  /**
   * One cast: a patch on the densest cluster within `targetRange`
   * (`densestSpot`). With nothing in range the cast never comes here: it waits
   * (#212), so a patch is never dropped on the player's feet.
   *
   * A pool at its cap drops the patch, so the cast is spent — a backlog of
   * areas waiting for room would land them all at once, long after the moment
   * that asked for them.
   */
  protected cast(): void {
    const { radius, duration, tickRate, targetRange, tickDamage } = this.areaStats;
    const slowPct = this.areaStats.slowPct ?? 0;
    const slowDuration = this.areaStats.slowDuration ?? 0;
    const staggerS = areaStaggerS(this.areaStats.staggerDuration ?? 0, tickRate);
    const at = densestSpot(this.caster, this.enemies.live, radius, targetRange, this.rng);
    const area = createArea(at, { radius, durationS: duration, tickEveryS: tickRate });
    const storm: StormPatch | null = this.kit
      ? {
          kit: this.kit,
          level: this.level,
          patch: this.patches + 1,
          count: stormTickCount(duration, tickRate),
          tickEveryS: tickRate,
          tickNumber: 0,
        }
      : null;
    const placed = this.areas.place(
      area,
      (live) => {
        this.applyTick(live, tickDamage, slowPct, slowDuration, staggerS);
        if (storm) this.stormLevels(live, storm, tickDamage, slowPct, slowDuration);
      },
      {},
      AREA_LOOKS[this.id],
    );
    if (placed) this.patches += 1;
  }

  /**
   * One tick of one patch: every enemy inside is chilled or staggered and then
   * hit, in that order — the status-before-damage convention
   * `CompanionSpell.onCompanionHit` follows, so a tick that kills has still
   * applied its status while the enemy was there to take it.
   *
   * Two patches overlapping tick independently (spec §9.3): the damage of each
   * lands, `applyFrost` keeps the stronger slow rather than summing them, and a
   * stagger refreshes rather than stacks. `staggerS` is already capped under
   * the tick interval (`areaStaggerS`), so no enemy is held through a tick.
   */
  private applyTick(
    area: Readonly<GroundArea>,
    tickDamage: number,
    slowPct: number,
    slowDuration: number,
    staggerS: number,
  ): void {
    for (const enemy of membersOf(area, this.enemies.live)) {
      if (!enemy.active) continue;
      this.ticked += 1;
      if (slowPct > 0) enemy.applyFrost({ slowPct, slowDuration, freeze: false });
      if (staggerS > 0) {
        enemy.applyStagger(staggerS);
        this.staggered += 1;
      }
      this.damage(enemy, tickDamage, 'tick', area);
    }
  }

  /**
   * What a level adds to one tick (#328), after the tick's own hits: the hail
   * that fell in this stretch of the patch's life, then, on its last paid tick,
   * the deep freeze. `storm` is the patch's own count of its ticks, closed over
   * at the cast so two patches never share one.
   */
  private stormLevels(
    area: Readonly<GroundArea>,
    storm: StormPatch,
    tickDamage: number,
    slowPct: number,
    slowDuration: number,
  ): void {
    storm.tickNumber += 1;
    const { kit, level, patch, count, tickNumber } = storm;
    if (level >= 2) {
      for (let i = 0; i < hailsDue(tickNumber, storm.tickEveryS, HAIL.everyS); i += 1) {
        this.hailstone(area, storm, tickDamage * HAIL.damageFactor, slowPct, slowDuration);
      }
    }
    if (!isDeepFreezeTick(tickNumber, count, level)) return;
    // Read fresh: an enemy this tick's hits killed is no longer inside to be frozen.
    const inside = membersOf(area, this.enemies.live).filter((enemy) => enemy.active);
    const hit = deepFreezeHit({ slowPct, slowDuration });
    let frozenAfter = 0;
    let bossFrozenS: number | null = null;
    for (const enemy of inside) {
      enemy.applyFrost(hit);
      if (enemy.isFrozen) frozenAfter += 1;
      if (enemy instanceof Boss) {
        bossFrozenS = Math.max(bossFrozenS ?? 0, enemy.crowdControlRemainingS.frozenS);
      }
    }
    kit.fx.burst('ice.nova', area.x, area.y, { scale: novaScale(area.radius) });
    recordCapped(this.deepFreezeLog, {
      level,
      patch,
      tickNumber,
      count,
      inside: inside.length,
      frozenAfter,
      bossFrozenS,
    });
  }

  /**
   * One hailstone: a random enemy inside, chilled and then hit, in that order.
   * Nothing inside draws nothing, so an empty patch leaves the stream where it was.
   */
  private hailstone(
    area: Readonly<GroundArea>,
    storm: StormPatch,
    damage: number,
    slowPct: number,
    slowDuration: number,
  ): void {
    const { kit, level, patch, tickNumber } = storm;
    const inside = membersOf(area, this.enemies.live).filter((enemy) => enemy.active);
    this.hailByPatch.set(patch, (this.hailByPatch.get(patch) ?? 0) + 1);
    if (inside.length === 0) {
      recordCapped(this.hailLog, { level, patch, tickNumber, inside: 0, hit: false });
      return;
    }
    const target = kit.hailRng.pick(inside);
    kit.fx.burst(HAIL.clip, target.x, target.y, { scale: HAIL.drawScale });
    if (slowPct > 0) target.applyFrost({ slowPct, slowDuration, freeze: false });
    this.damage(target, damage, 'tick', area);
    this.hailHits += 1;
    recordCapped(this.hailLog, { level, patch, tickNumber, inside: inside.length, hit: true });
  }
}
