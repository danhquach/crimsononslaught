import { createArea, membersOf, type GroundArea } from '../core/groundArea';
import type { Vec2 } from '../core/input';
import { Spell, anyWithin } from '../core/spell';
import type { TornadoStats } from '../core/spellStats';
import { driftArea, tornadoHeading, tornadoPulls } from '../core/tornado';
import type { AreaPool } from '../systems/AreaPool';
import type { EnemyPool } from '../systems/EnemyPool';
import type { DamageSink } from './DamageSink';

/**
 * Tornado (#142, Phase 2 spec §9.4): every `cooldown` s a vortex leaves the
 * caster toward the nearest enemy within `targetRange` and drifts that way at
 * `speed` px/s for `duration`. Every frame it pulls each enemy within
 * `pullRadius` toward its eye at `pullForce` px/s (#136); every `tickRate` it
 * deals `tickDamage` to each enemy inside `radius` (#135).
 *
 * It is `GroundAreaSpell`'s patch with a heading: the pool (`systems/AreaPool.ts`)
 * owns the lifetime, the ticks and the ring on screen, and this class hands it
 * the step that moves and pulls (`core/tornado.ts`) and the tick that hurts.
 * Nothing here touches the physics world directly: the pull is asked of each
 * `Enemy` through `addForce` and spent in its own next chase step.
 *
 * Spec §6.2: a tornado has a finite lifetime, so every number it uses is read
 * once at the cast and closed over — a passive taken mid-flight grows the next
 * one, never the one already tearing through the crowd.
 */
export class TornadoSpell extends Spell<'lightning_tornado'> {
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly areas: AreaPool;
  /** Test hook (#142): tornadoes this spell has sent out. */
  private sent = 0;
  /** Tornadoes of this spell's own on the ground right now. */
  private out = 0;
  /** Test hook (#142): enemy-ticks its tornadoes have paid out, across every cast. */
  private ticked = 0;

  constructor(
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<TornadoStats>,
    damage: DamageSink,
    areas: AreaPool,
  ) {
    super('lightning_tornado', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.areas = areas;
  }

  /** Tornadoes sent so far — what the browser suite watches a run cast. */
  get placed(): number {
    return this.sent;
  }

  /** Enemy-ticks paid out so far: one per enemy per tick of every tornado. */
  get hits(): number {
    return this.ticked;
  }

  /** This spell's tornadoes live right now — its own, not every patch the arena's pool holds. */
  get liveCount(): number {
    return this.out;
  }

  /** Nothing within targetRange → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.targetRange);
  }

  /**
   * One cast: a tornado from the caster toward the nearest enemy in
   * `targetRange`; with nothing in range the cast is spent on nothing, the rule
   * Fire Column follows. A pool at its cap drops the tornado, so the cast is
   * spent — a backlog waiting for room would land them all at once, long after
   * the moment that asked for them.
   */
  protected cast(): void {
    const { radius, duration, tickRate, targetRange, tickDamage, speed, pullRadius, pullForce } =
      this.stats;
    const heading = tornadoHeading(this.caster, this.enemies.live, targetRange);
    if (!heading) return;
    const area = createArea(this.caster, { radius, durationS: duration, tickEveryS: tickRate });
    const placed = this.areas.place(area, (live) => this.applyTick(live, tickDamage), {
      onStep: (live, deltaS) => this.step(live, heading, speed, pullRadius, pullForce, deltaS),
      onExpire: () => {
        this.out -= 1;
      },
    });
    if (!placed) return;
    this.sent += 1;
    this.out += 1;
  }

  /** One frame of one tornado: drift, then ask every enemy in reach for its pull. */
  private step(
    area: Readonly<GroundArea>,
    heading: Readonly<Vec2>,
    speed: number,
    pullRadius: number,
    pullForce: number,
    deltaS: number,
  ): GroundArea {
    const moved = driftArea(area, heading, speed, deltaS);
    for (const { enemy, force } of tornadoPulls(moved, this.enemies.live, pullRadius, pullForce)) {
      if (enemy.active) enemy.addForce(force);
    }
    return moved;
  }

  /** One tick of one tornado: every enemy inside the eye's radius is hit. */
  private applyTick(area: Readonly<GroundArea>, tickDamage: number): void {
    for (const enemy of membersOf(area, this.enemies.live)) {
      if (!enemy.active) continue;
      this.ticked += 1;
      this.damage(enemy, tickDamage, 'tick');
    }
  }
}
