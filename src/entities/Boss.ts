import Phaser from 'phaser';
import { BOSS } from '../config/boss';
import {
  bossVelocity,
  startBossCycle,
  stepBossCycle,
  type BossCycle,
  type BossPhase,
} from '../core/boss';
import type { Vec2 } from '../core/enemy';
import { emitRunEvent } from '../core/runEvents';
import { Enemy } from './Enemy';

/** The telegraph flash: the ring fills white for the wind-up so the charge reads before it lands. */
const TELEGRAPH_TINT = 0xffffff;

/**
 * The boss (spec §5 "Boss"): an enemy with its own stats and a charge cycle.
 * Between charges it chases like any enemy, at 70 px/s. Every 4 s it stops and
 * flashes for 0.8 s, then charges for 0.6 s at 400 px/s along a line locked
 * toward where the player stood as the flash ended.
 *
 * It lives in the enemy pool's group (`EnemyPool.spawnBoss`), so every spell's
 * targeting and overlap wiring reaches it unchanged, and burns, slows and stuns
 * apply as they do to any enemy — a slow or stun scales the charge too. One of
 * a kind: never recycled as a regular enemy; the pool drops it when it dies.
 *
 * Its HP is published as `run:bossHp` on the scene emitter (CO-051), on spawn
 * and after every hit, the way `Player` publishes `run:hp`; the HUD boss bar
 * (CO-012) renders from those events alone.
 *
 * All the decisions live in `core/boss.ts`; this class only moves the sprite.
 */
export class Boss extends Enemy {
  private cycle: BossCycle = startBossCycle();

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y);
  }

  override get contactDamage(): number {
    return BOSS.contactDamage;
  }

  /** Where the boss is in its cycle: chasing, telegraphing or charging. */
  get phase(): BossPhase {
    return this.cycle.phase;
  }

  /** Standing still and flashing: the 0.8 s warning before a charge (spec §5). */
  get telegraphing(): boolean {
    return this.cycle.phase === 'telegraph';
  }

  /** Come alive at (x, y) at full HP with the cycle at its start. */
  spawnBoss(x: number, y: number): void {
    this.cycle = startBossCycle();
    this.arise(BOSS, x, y);
    this.emitHp();
  }

  /** Every hit redraws the boss bar; the killing blow shows it empty. */
  override takeDamage(amount: number): boolean {
    const died = super.takeDamage(amount);
    this.emitHp();
    return died;
  }

  private emitHp(): void {
    emitRunEvent(this.scene.events, 'bossHp', { hp: this.remainingHp, maxHp: BOSS.hp });
  }

  /** Advance the cycle by the frame and move as the current phase asks. */
  protected override steer(deltaS: number, target: Readonly<Vec2>, speedFactor: number): Vec2 {
    const wasTelegraphing = this.telegraphing;
    this.cycle = stepBossCycle(this.cycle, deltaS, this, target);
    if (this.telegraphing !== wasTelegraphing) this.refreshTint();
    return bossVelocity(this.cycle, this, target, speedFactor);
  }

  /** The telegraph flash outranks the status tints: the warning must always show. */
  protected override refreshTint(): void {
    if (this.telegraphing) this.setTintFill(TELEGRAPH_TINT);
    else super.refreshTint();
  }
}
