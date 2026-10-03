import type Phaser from 'phaser';
import { STONE_SHOCK } from '../config/earthLevels';
import type { SpellLevel } from '../config/spellLevels';
import { hasStoneShock, stoneShockHits, stoneShockPush } from '../core/earthLevels';
import { recordCapped } from '../core/fireLevels';
import { dustFlip } from '../core/fx';
import type { Vec2 } from '../core/input';
import type { OrbitPhase } from '../core/orbitCycle';
import { knockbackVector } from '../core/orbitingBoulders';
import type { EarthShieldStats } from '../core/spellStats';
import { Boss } from '../entities/Boss';
import type { Boulder } from '../entities/Boulder';
import type { Enemy } from '../entities/Enemy';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';
import { OrbitRing } from './OrbitRing';
import { ShieldSpell } from './ShieldSpell';

/** Earth Shield's level record, what the test hook reads (#330, #406): cause and effect in one entry. */
export interface EarthShieldLevelReport {
  /**
   * Every stone shock: the level the ring held, when it struck on the spell's
   * own clock, the enemies it reached, how many of them stood staggered right
   * after, and the boss's stagger if it was among them.
   */
  shocks: {
    level: SpellLevel;
    atS: number;
    caught: number;
    staggered: number;
    bossStaggerS: number | null;
  }[];
  /** Shocks so far: a count the capped log cannot lose. */
  shockCount: number;
  /** Stones on the ring right now; 0 while recharging. */
  stones: number;
  /** Whether the stones are out or recharging right now. */
  phase: OrbitPhase;
}

/**
 * Earth Shield (#134, Phase 2 spec §9.5): `count` stones circle the player,
 * hurting and hurling back what they roll over, over a pool the whole ring
 * shares — it absorbs `shieldHp` of the player's damage while the stones are
 * out. The stones are out for `uptime` s and gone for `recharge` s (#406); the
 * pool is full each time they return and 0 while they are gone, and a pool
 * broken at 0 ends the uptime early, so a hit that breaks it starts the recharge.
 *
 * So the ring is both the element's defence and its offence, and while it is
 * gone the player has neither: nothing is being shoved away and the next hit
 * lands on HP.
 *
 * The pool is `core/shield.ts` through `ShieldSpell`; the ring is `OrbitRing`,
 * shared with Lightning Sword. This class turns an overlap into damage and the
 * ring's vanishing into a shock.
 *
 * Levels (#330, #406): level 2's fourth stone is a stat add (`count`), so the
 * ring simply places one more. Level 3, stone shock: when the stones vanish,
 * timed or broken, each stone sends a shockwave that shoves, staggers and hurts
 * every enemy within reach (`STONE_SHOCK`). Stagger only, so a boss's
 * diminishing returns cap it.
 *
 * The shield's cue plays as the stones return, never as they time out: the
 * break cue is the player's intake path's, played only for a real break.
 */
export class EarthShieldSpell extends ShieldSpell<'earth_shield'> {
  private readonly ring: OrbitRing;
  private readonly caster: Readonly<Vec2>;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly enemies: EnemyPool;
  /** The spell's own clock (#330), on the run clock: what a shock's time is read from. */
  private clockS = 0;
  private readonly shockLog: EarthShieldLevelReport['shocks'] = [];
  private shocks = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<EarthShieldStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('earth_shield', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.ring = new OrbitRing(
      scene,
      caster,
      collisions,
      (enemy, stone) => this.onHit(enemy, stone),
      this.stats,
    );
    // The ring is up from the first frame, not one tick later.
    this.placeRing();
  }

  /** Stones on the ring right now; 0 while the stones are gone. */
  get liveCount(): number {
    return this.ring.liveCount;
  }

  /** Test hook (#406): whether the stones are out or recharging. */
  get cyclePhase(): OrbitPhase {
    return this.ring.phase;
  }

  /** Test hook (#330, #406): the shocks this ring has sent. */
  get levelReport(): EarthShieldLevelReport {
    return {
      shocks: [...this.shockLog],
      shockCount: this.shocks,
      stones: this.liveCount,
      phase: this.cyclePhase,
    };
  }

  protected override tick(deltaS: number): void {
    const { appeared, vanished } = this.ring.step(deltaS, this.stats);
    this.clockS += deltaS;
    if (vanished) this.dismiss(false);
    if (appeared) {
      this.refillPool();
      this.onCast?.();
    }
    this.placeRing();
  }

  /** A pool broken at 0: the stones vanish now and the recharge starts. */
  protected onBreak(): void {
    if (this.ring.endEarly(this.stats.recharge)) this.dismiss(true);
  }

  /**
   * The stones go: at level 3 each sends its shock from where it is, the pool
   * is emptied, and the ring is cleared. `broke` adds the break burst at the
   * player; a timed vanish plays none.
   */
  private dismiss(broke: boolean): void {
    if (hasStoneShock(this.level)) this.shock(this.level);
    this.emptyPool();
    this.placeRing();
    if (broke) this.fx.burst('earth.impact', this.caster.x, this.caster.y);
  }

  /** Every stone shoves, staggers and hurts what is within its reach, each enemy once, by its nearest stone. */
  private shock(level: SpellLevel): void {
    const stones = this.ring.bodies;
    for (const stone of stones) {
      this.fx.burst('earth.impact', stone.x, stone.y, { scale: STONE_SHOCK.impactScale });
    }
    const hits = stoneShockHits(stones, this.enemies.live);
    const damage = this.stats.damage * STONE_SHOCK.damageFactor;
    let staggered = 0;
    let bossStaggerS: number | null = null;
    for (const { enemy, stone } of hits) {
      if (!enemy.active) continue;
      const push = stoneShockPush(stone, enemy, this.caster);
      enemy.applyStagger(STONE_SHOCK.staggerS);
      if (enemy.isStaggered) staggered += 1;
      if (enemy instanceof Boss) {
        bossStaggerS = Math.max(bossStaggerS ?? 0, enemy.crowdControlRemainingS.staggerS);
      }
      this.damage(enemy, damage, 'hit', stone);
      // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
      if (!enemy.active) continue;
      enemy.knockBack(push);
      this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
    }
    this.shocks += 1;
    recordCapped(this.shockLog, {
      level,
      atS: this.clockS,
      caught: hits.length,
      staggered,
      bossStaggerS,
    });
  }

  private placeRing(): void {
    this.ring.place(this.stats, (stone) => stone.spin(this.stats.orbitSpeed));
  }

  private onHit(enemy: Enemy, stone: Boulder): void {
    // The per-enemy window is claimed first: a second stone on the same enemy
    // this frame, or any stone within `hitCooldown`, does nothing.
    if (!enemy.tryBoulderHit()) return;

    const { damage, knockback } = this.stats;
    const push = knockbackVector(stone, enemy, knockback, this.caster);
    this.fx.burst('earth.impact', enemy.x, enemy.y);
    this.damage(enemy, damage, 'hit', stone);
    // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
    if (!enemy.active) return;
    enemy.knockBack(push);
    // The dust is drawn from its top edge, so it sits at the enemy's feet.
    this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
  }
}
