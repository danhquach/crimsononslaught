import type { AreaSpellId } from '../config/areas';
import { createArea, densestSpot, membersOf, type GroundArea } from '../core/groundArea';
import type { Vec2 } from '../core/input';
import type { Rng } from '../core/rng';
import { Spell, anyWithin } from '../core/spell';
import type { GroundAreaStats } from '../core/spellStats';
import type { EnemyPool } from '../systems/EnemyPool';
import type { AreaPool } from '../systems/AreaPool';
import type { DamageSink } from './DamageSink';

/**
 * A persistent ground area (#135, Phase 2 spec §9): Blizzard and Earthquake.
 * One cast drops a patch on the crowd, and the patch keeps damaging and slowing
 * whatever stands in it until its duration runs out.
 *
 * One class serves both and `config/areas.ts` decides which is which, the way
 * `CompanionSpell` serves all four allies: they differ only in the numbers —
 * Ice trades damage for the element's signature slow, Earth the other way — and
 * a subclass each would be two copies of this file.
 *
 * The rules are `core/groundArea.ts`'s and the patch on screen is
 * `systems/AreaPool.ts`'s; this class only chooses where a cast lands and what
 * a tick costs the enemies inside. Nothing here touches the physics world: a
 * patch has no body, so `CollisionSystem` never learns it exists.
 *
 * Spec §6.2: a patch has a finite lifetime, so every number it will ever use is
 * read once at the cast and closed over — a Haste or an Expanse taken while a
 * Blizzard lies on the ground grows the next one, never the one the player is
 * already standing next to.
 */
export class GroundAreaSpell extends Spell<AreaSpellId> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly areas: AreaPool;
  private readonly rng: Rng;
  /** Test hook (#135): patches this spell has put on the ground. */
  private patches = 0;
  /** Test hook (#135): enemy-ticks its patches have paid out, across every cast. */
  private ticked = 0;

  constructor(
    id: AreaSpellId,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<GroundAreaStats>,
    damage: DamageSink,
    areas: AreaPool,
    rng: Rng,
  ) {
    super(id, { ...stats });
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.areas = areas;
    this.rng = rng;
  }

  /** Patches placed so far — what the browser suite watches a run cast. */
  get placed(): number {
    return this.patches;
  }

  /** Enemy-ticks paid out so far: one per enemy per tick of every patch. */
  get hits(): number {
    return this.ticked;
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
    const { radius, duration, tickRate, targetRange, tickDamage, slowPct, slowDuration } =
      this.areaStats;
    const at = densestSpot(this.caster, this.enemies.live, radius, targetRange, this.rng);
    const area = createArea(at, { radius, durationS: duration, tickEveryS: tickRate });
    const placed = this.areas.place(area, (live) =>
      this.applyTick(live, tickDamage, slowPct, slowDuration),
    );
    if (placed) this.patches += 1;
  }

  /**
   * One tick of one patch: every enemy inside is chilled and then hit, in that
   * order — the status-before-damage convention `CompanionSpell.onCompanionHit`
   * follows, so a tick that kills has still applied its slow while the enemy
   * was there to take it.
   *
   * Two patches overlapping tick independently (spec §9.3): the damage of each
   * lands, and `applyFrost` keeps the stronger slow rather than summing them.
   */
  private applyTick(
    area: Readonly<GroundArea>,
    tickDamage: number,
    slowPct: number,
    slowDuration: number,
  ): void {
    for (const enemy of membersOf(area, this.enemies.live)) {
      if (!enemy.active) continue;
      this.ticked += 1;
      if (slowPct > 0) enemy.applyFrost({ slowPct, slowDuration, freeze: false });
      this.damage(enemy, tickDamage, 'tick');
    }
  }
}
