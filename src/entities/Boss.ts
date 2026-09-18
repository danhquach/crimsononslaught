import Phaser from 'phaser';
import { BOSS } from '../config/boss';
import { bossAnimation, type Clip, type EnemyPhase } from '../core/animation';
import {
  BOSS_EVENT,
  startBossCycle,
  stepBossCycle,
  type BossCycle,
  type BossPhase,
} from '../core/boss';
import type { Vec2 } from '../core/enemy';
import { emitRunEvent } from '../core/runEvents';
import { Enemy } from './Enemy';

/**
 * The telegraph flash for the placeholder ring: it fills white for the wind-up
 * so the charge reads before it lands. With the atlas the telegraph clip is
 * the warning (CO-081) and the tint stays off.
 */
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
 * Its clips follow the cycle (CO-081): `walk`, `telegraph` and `charge` per
 * facing, `hurt` between them, and `death` played out before `BOSS_EVENT.died`
 * tells the run it has won — `Enemy` keeps the sprite for the clip's length.
 * It faces its last velocity: the player while it chases, so the telegraph
 * that follows the stop faces them too, and the locked line while it charges.
 *
 * All the decisions live in `core/boss.ts`; this class only moves the sprite.
 */
export class Boss extends Enemy {
  private cycle: BossCycle = startBossCycle();
  /** Whether the atlas is drawing the telegraph, so the tint fallback can stand down. */
  private animated = false;

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

  /** The end of the death clip is the win (spec §4 step 4), not the killing blow. */
  override despawn(): void {
    const finished = this.isDying;
    super.despawn();
    if (finished) this.scene.events.emit(BOSS_EVENT.died);
  }

  private emitHp(): void {
    emitRunEvent(this.scene.events, 'bossHp', { hp: this.remainingHp, maxHp: BOSS.hp });
  }

  /** Advance the cycle by the frame and move as the current phase asks. */
  protected override steer(deltaS: number, target: Readonly<Vec2>, speedFactor: number): Vec2 {
    const wasTelegraphing = this.telegraphing;
    const step = stepBossCycle(this.cycle, deltaS, this, target, speedFactor);
    this.cycle = step.cycle;
    if (this.telegraphing !== wasTelegraphing) this.refreshTint();
    return step.velocity;
  }

  protected override get bodyRadius(): number {
    return BOSS.radius;
  }

  /** The boss sheet has no spawn: it walks in, and nothing holds it on arrival. */
  protected override show(phase: EnemyPhase, velocity: Readonly<Vec2>): number {
    // One clip stands for the whole sheet: `installAtlas` registers every
    // animation or none, so the telegraph clip is there whenever the walk is.
    this.animated = this.scene.anims.exists(`boss.walk.${this.facingDir}`);
    if (phase === 'spawn') {
      super.show('move', velocity);
      return 0;
    }
    return super.show(phase, velocity);
  }

  /** `Enemy`'s phases map onto the boss sheet through the cycle: moving is whatever the cycle is doing. */
  protected override clip(phase: EnemyPhase): Clip {
    const name = bossAnimation({
      phase: this.cycle.phase,
      facing: this.facingDir,
      hurt: phase === 'hurt',
      dead: phase === 'death',
    });
    return { name, flipX: false };
  }

  /** The telegraph flash outranks the status tints: the warning must always show. */
  protected override refreshTint(): void {
    if (this.telegraphing && !this.animated) this.setTintFill(TELEGRAPH_TINT);
    else super.refreshTint();
  }
}
