import Phaser from 'phaser';
import { ENEMY_ARCHETYPES, type EnemyType } from '../config/enemies';
import {
  chaseVelocity,
  damageEnemy,
  tickContactCooldown,
  tryContact,
  type Vec2,
} from '../core/enemy';
import { NO_BURN, applyBurn, tickBurn, type BurnState } from '../core/fireball';
import {
  NO_FROST,
  applyFrost,
  frostSpeedFactor,
  isSlowed,
  tickFrost,
  type FrostHit,
  type FrostState,
} from '../core/frostNova';
import { PLACEHOLDERS } from '../config/colors';

/** A slowed or frozen enemy is tinted the nova's blue so the slow reads on screen. */
const FROST_TINT = PLACEHOLDERS.fx_nova.color;

/**
 * A regular enemy (spec §5 "Enemies"): chases the player in a straight line at
 * its archetype's speed and damages them on contact at most once per 0.5 s.
 * A fireball hit can set it burning (CO-044); the burn ticks with the chase.
 * A frost pulse can slow or freeze it (CO-045); the cold scales the chase speed
 * and runs out with it.
 *
 * Pooled — never constructed per spawn. `systems/EnemyPool.ts` owns the pool and
 * calls `spawn` / `despawn`; an inactive enemy has its body disabled, so it costs
 * nothing until reused. The type is set on every spawn, so one pooled object can
 * come back as any archetype.
 *
 * All the decisions live in `core/enemy.ts`; this class only moves the sprite.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  // `type` is taken by Phaser.GameObject, so the archetype key is `kind`.
  private kind: EnemyType = 'swarm';
  private hp = 0;
  private contactCooldownMs = 0;
  private burn: BurnState = { ...NO_BURN };
  private frost: FrostState = { ...NO_FROST };

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, ENEMY_ARCHETYPES.swarm.texture);
  }

  get enemyType(): EnemyType {
    return this.kind;
  }

  get contactDamage(): number {
    return ENEMY_ARCHETYPES[this.kind].contactDamage;
  }

  /** Spec §5 Ice: moving slower than the archetype says, frozen included — what Shatter checks. */
  get slowed(): boolean {
    return isSlowed(this.frost);
  }

  /** Take this pooled object out of the pool as `type`, alive and at (x, y). */
  spawn(type: EnemyType, x: number, y: number): void {
    const archetype = ENEMY_ARCHETYPES[type];
    this.kind = type;
    this.hp = archetype.hp;
    this.contactCooldownMs = 0;
    this.burn = { ...NO_BURN };
    this.frost = { ...NO_FROST };
    this.clearTint();
    this.setTexture(archetype.texture);
    this.enableBody(true, x, y, true, true);
    // Body radius comes from the archetype (spec §5), not the placeholder art,
    // so swapping in a sprite leaves the hitbox alone. Centre it on the frame.
    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = archetype.radius;
    body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
  }

  /** Return to the pool: inactive, invisible, body disabled. */
  despawn(): void {
    this.setVelocity(0, 0);
    this.disableBody(true, true);
  }

  /**
   * Driven by `EnemyPool`, not Phaser, so a paused Game freezes the crowd with it.
   * Returns the burn damage this frame owes, for the caller to apply through the
   * run's damage path — a burn kill drops gems like any other.
   */
  chase(deltaMs: number, target: Readonly<Vec2>): number {
    this.contactCooldownMs = tickContactCooldown(this.contactCooldownMs, deltaMs);
    const speed = ENEMY_ARCHETYPES[this.kind].speed * frostSpeedFactor(this.frost);
    const { x, y } = chaseVelocity(this, target, speed);
    this.setVelocity(x, y);
    const deltaS = deltaMs / 1000;
    const frost = tickFrost(this.frost, deltaS);
    this.frost = frost.state;
    if (frost.ended) this.clearTint();
    const burn = tickBurn(this.burn, deltaS);
    this.burn = burn.state;
    return burn.damage;
  }

  /** Spec §5 Fire: set (or refresh) a burn of `dps` for the burn duration. */
  applyBurn(dps: number): void {
    this.burn = applyBurn(this.burn, dps);
  }

  /** Spec §5 Ice: slow (max, not additive) and maybe freeze; takes effect on the next chase step. */
  applyFrost(hit: Readonly<FrostHit>): void {
    this.frost = applyFrost(this.frost, hit);
    if (this.slowed) this.setTintFill(FROST_TINT);
  }

  /**
   * Claim a contact tick against the player. `true` means the hit lands and this
   * enemy's own 0.5 s window has just opened (spec §5).
   */
  tryContact(): boolean {
    const { cooldownMs, hit } = tryContact(this.contactCooldownMs);
    this.contactCooldownMs = cooldownMs;
    return hit;
  }

  /** `true` on the blow that kills, so a death is handled exactly once. */
  takeDamage(amount: number): boolean {
    const result = damageEnemy(this.hp, amount);
    this.hp = result.hp;
    if (result.died) this.despawn();
    return result.died;
  }
}
