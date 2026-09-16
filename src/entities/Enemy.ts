import Phaser from 'phaser';
import { ENEMY_ARCHETYPES, type EnemyType } from '../config/enemies';
import {
  chaseVelocity,
  damageEnemy,
  tickContactCooldown,
  tryContact,
  type Vec2,
} from '../core/enemy';

/**
 * A regular enemy (spec §5 "Enemies"): chases the player in a straight line at
 * its archetype's speed and damages them on contact at most once per 0.5 s.
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

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, ENEMY_ARCHETYPES.swarm.texture);
  }

  get enemyType(): EnemyType {
    return this.kind;
  }

  get contactDamage(): number {
    return ENEMY_ARCHETYPES[this.kind].contactDamage;
  }

  /** Take this pooled object out of the pool as `type`, alive and at (x, y). */
  spawn(type: EnemyType, x: number, y: number): void {
    const archetype = ENEMY_ARCHETYPES[type];
    this.kind = type;
    this.hp = archetype.hp;
    this.contactCooldownMs = 0;
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

  /** Driven by `EnemyPool`, not Phaser, so a paused Game freezes the crowd with it. */
  chase(deltaMs: number, target: Readonly<Vec2>): void {
    this.contactCooldownMs = tickContactCooldown(this.contactCooldownMs, deltaMs);
    const { x, y } = chaseVelocity(this, target, ENEMY_ARCHETYPES[this.kind].speed);
    this.setVelocity(x, y);
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
