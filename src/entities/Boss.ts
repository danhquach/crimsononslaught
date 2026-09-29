import Phaser from 'phaser';
import { BOSS } from '../config/boss';
import { bossAnimation, type Clip, type EnemyPhase } from '../core/animation';
import {
  BOSS_EVENT,
  startBossCycle,
  stepBossCycle,
  type BossCycle,
  type BossPhase,
  type BossPhasePayload,
} from '../core/boss';
import {
  NO_BOSS_CC,
  applyBossCc,
  diminishFrost,
  type BossCcKind,
  type BossCcState,
} from '../core/bossCrowdControl';
import type { Vec2 } from '../core/enemy';
import type { FrostHit } from '../core/frostNova';
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
 * apply as they do to any enemy — a slow or stun scales the charge too — save
 * for the diminishing returns below. One of a kind: never recycled as a regular
 * enemy; the pool drops it when it dies.
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
 * Its crowd control diminishes (#315): every stun, stagger and slow repeated
 * within a few seconds lasts a fraction of the last (`core/bossCrowdControl.ts`),
 * so Persistence can interrupt the boss but never lock it down.
 *
 * All the decisions live in `core/boss.ts`; this class only moves the sprite.
 */
export class Boss extends Enemy {
  private cycle: BossCycle = startBossCycle();
  /** Whether the atlas is drawing the telegraph, so the tint fallback can stand down. */
  private animated = false;
  /** Seconds this boss has been alive, run time; the clock its crowd-control windows are read on (#315). */
  private clockS = 0;
  private cc: BossCcState = NO_BOSS_CC;

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
    this.clockS = 0;
    this.cc = NO_BOSS_CC;
    this.arise(BOSS, x, y);
    this.emitHp();
  }

  /** Diminishing returns (#315): a repeated stun is shorter. The roll that landed it was drawn before this. */
  override applyStun(stunS: number): void {
    super.applyStun(this.diminish('stun', stunS));
  }

  /** Diminishing returns (#315): a repeated stagger is shorter. */
  override applyStagger(staggerS: number): void {
    super.applyStagger(this.diminish('stagger', staggerS));
  }

  /**
   * Diminishing returns (#315): a freeze is a stun, so it shares the stun count,
   * and never cuts a running freeze short; a slow is scaled in length, not in
   * strength (`diminishFrost`).
   */
  override applyFrost(hit: Readonly<FrostHit>): void {
    const applied = diminishFrost(this.cc, hit, this.crowdControlRemainingS.frozenS, this.clockS);
    this.cc = applied.state;
    super.applyFrost(applied.hit);
  }

  /** The length `durationS` of `kind` takes on this boss now, counting it as an application. */
  private diminish(kind: BossCcKind, durationS: number): number {
    const applied = applyBossCc(this.cc, kind, durationS, this.clockS);
    this.cc = applied.state;
    return applied.durationS;
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
    this.clockS += deltaS;
    const wasTelegraphing = this.telegraphing;
    const before = this.cycle.phase;
    const step = stepBossCycle(this.cycle, deltaS, this, target, speedFactor);
    this.cycle = step.cycle;
    if (this.telegraphing !== wasTelegraphing) this.refreshTint();
    if (this.cycle.phase !== before) {
      const payload: BossPhasePayload = { phase: this.cycle.phase };
      this.scene.events.emit(BOSS_EVENT.phase, payload);
    }
    return step.velocity;
  }

  override get bodyRadius(): number {
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
