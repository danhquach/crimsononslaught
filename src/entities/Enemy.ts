import Phaser from 'phaser';
import { ENEMY_ARCHETYPES, ENEMY_HURT_MS, type EnemyType } from '../config/enemies';
import {
  DEFAULT_FACING,
  enemyAnimation,
  facingFromVector,
  headingRotation,
  type Clip,
  type EnemyPhase,
  type Facing,
} from '../core/animation';
import {
  chaseVelocity,
  damageEnemy,
  tickContactCooldown,
  tryContact,
  type Vec2,
} from '../core/enemy';
import { applyStun, stunSpeedFactor, tickStun } from '../core/chainLightning';
import { NO_BURN, applyBurn, hasBurn, tickBurn, type BurnState } from '../core/fireball';
import {
  NO_FROST,
  applyFrost,
  frostSpeedFactor,
  isSlowed,
  tickFrost,
  type FrostHit,
  type FrostState,
} from '../core/frostNova';
import { tickBoulderCooldown, tryBoulderHit } from '../core/orbitingBoulders';
import { PLACEHOLDERS, type TextureKey } from '../config/colors';
import { clearClip, clipDurationMs, showClip } from '../render/animate';

/** A slowed or frozen enemy is tinted the nova's blue so the slow reads on screen. */
const FROST_TINT = PLACEHOLDERS.fx_nova.color;
/** A stunned enemy is tinted the bolt's yellow so the stun reads on screen. */
const STUN_TINT = PLACEHOLDERS.fx_bolt.color;

/** What any enemy needs to come alive: an archetype row, or the boss's own table. */
export interface EnemyStats {
  readonly hp: number;
  readonly radius: number;
  readonly texture: TextureKey;
}

/**
 * A regular enemy (spec §5 "Enemies"): chases the player in a straight line at
 * its archetype's speed and damages them on contact at most once per 0.5 s.
 * A fireball hit can set it burning (CO-044); the burn ticks with the chase.
 * A frost pulse can slow or freeze it (CO-045); the cold scales the chase speed
 * and runs out with it. A bolt can stun it (CO-046): a full stop that runs out
 * the same way. A boulder can hit it at most once per 0.4 s and shove it
 * (CO-047); that window drains with the chase too.
 *
 * Pooled — never constructed per spawn. `systems/EnemyPool.ts` owns the pool and
 * calls `spawn` / `despawn`; an inactive enemy has its body disabled, so it costs
 * nothing until reused. The type is set on every spawn, so one pooled object can
 * come back as any archetype.
 *
 * It shows the atlas clip for what it is doing (CO-081, `core/animation.ts`):
 * `spawn` holds it still on arrival, `hurt` flashes for 0.1 s after a hit, and
 * `death` plays on the pooled sprite — body off, still `active` so the pool
 * cannot hand it out — before it is released. Those windows run on the run
 * clock, so a paused Game holds them. With no atlas each has no length and the
 * placeholder behaves as before.
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
  /** Seconds of stun left; 0 when moving freely. */
  private stunS = 0;
  /** Seconds before a boulder may hit this enemy again; 0 when it may. */
  private boulderCooldownS = 0;
  private facing: Facing = DEFAULT_FACING;
  /** Run-clock ms left of the arrival hold, the hurt flash and the death clip. */
  private spawnMs = 0;
  private hurtMs = 0;
  private deathMs = 0;
  private dying = false;

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

  /** Spec §5 Fire: a burn is ticking on it; the overlay pool (CO-082) shows the flame. */
  get isBurning(): boolean {
    return hasBurn(this.burn);
  }

  /** Spec §5 Ice: in a full stop from a freeze; the overlay pool shows the block. */
  get isFrozen(): boolean {
    return this.frost.frozenS > 0;
  }

  /** Spec §5 Lightning: in a full stop from a bolt; the overlay pool shows the sparks. */
  get isStunned(): boolean {
    return this.stunS > 0;
  }

  /** HP left; 0 once dead. What the boss bar (CO-051) and the debug readout show. */
  get remainingHp(): number {
    return this.hp;
  }

  /** Killed, and playing its death clip: not a target, not a threat, not yet back in the pool. */
  get isDying(): boolean {
    return this.dying;
  }

  /** Which way it last moved; the tank's and the boss's clips are drawn per facing. */
  protected get facingDir(): Facing {
    return this.facing;
  }

  /** Take this pooled object out of the pool as `type`, alive and at (x, y). */
  spawn(type: EnemyType, x: number, y: number): void {
    this.kind = type;
    this.arise(ENEMY_ARCHETYPES[type], x, y);
  }

  /**
   * Come alive at (x, y) with `stats`: full HP, no effects, a fresh body. Shared
   * by every archetype and the boss (CO-050), which brings its own stats.
   */
  protected arise(stats: Readonly<EnemyStats>, x: number, y: number): void {
    this.hp = stats.hp;
    this.contactCooldownMs = 0;
    this.burn = { ...NO_BURN };
    this.frost = { ...NO_FROST };
    this.stunS = 0;
    this.boulderCooldownS = 0;
    this.facing = DEFAULT_FACING;
    this.hurtMs = 0;
    this.deathMs = 0;
    this.dying = false;
    this.clearTint();
    clearClip(this);
    this.setTexture(stats.texture);
    this.setOrigin(0.5, 0.5);
    this.enableBody(true, x, y, true, true);
    // Body radius comes from the archetype (spec §5), not the placeholder art,
    // so swapping in a sprite leaves the hitbox alone. Centre it on the frame;
    // `showClip` re-centres it on the atlas frame's anchor when a clip shows.
    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = stats.radius;
    body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.spawnMs = this.show('spawn', { x: 0, y: 0 });
  }

  /** The body radius the clips are placed around: the archetype's, or the boss's own. The overlays (CO-082) size the flame by it. */
  get bodyRadius(): number {
    return ENEMY_ARCHETYPES[this.kind].radius;
  }

  /**
   * The clip for `phase`, given this step's velocity. Returns its run-clock
   * length, for the phases that hold the enemy until they end.
   */
  protected show(phase: EnemyPhase, velocity: Readonly<Vec2>): number {
    const clip = this.clip(phase, velocity);
    showClip(this, clip.name, this.bodyRadius, clip.flipX);
    return clipDurationMs(this.scene, clip.name);
  }

  /** Which clip this enemy shows for `phase`; the boss (CO-050) picks from its own sheet. */
  protected clip(phase: EnemyPhase, velocity: Readonly<Vec2>): Clip {
    return enemyAnimation({ kind: this.kind, phase, facing: this.facing, velocityX: velocity.x });
  }

  /** The phase this step shows: the hurt flash over movement, the arrival hold over both. */
  private clipPhase(): EnemyPhase {
    if (this.spawnMs > 0) return 'spawn';
    return this.hurtMs > 0 ? 'hurt' : 'move';
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
    if (this.dying) {
      this.deathMs -= deltaMs;
      if (this.deathMs <= 0) this.despawn();
      return 0;
    }
    if (this.spawnMs > 0) {
      // Arriving: the clip plays out where it landed before the chase starts.
      this.spawnMs -= deltaMs;
      this.setVelocity(0, 0);
      if (this.spawnMs > 0) return 0;
    }
    this.hurtMs = Math.max(0, this.hurtMs - deltaMs);
    this.contactCooldownMs = tickContactCooldown(this.contactCooldownMs, deltaMs);
    const deltaS = deltaMs / 1000;
    const speedFactor = frostSpeedFactor(this.frost) * stunSpeedFactor(this.stunS);
    const { x, y } = this.steer(deltaS, target, speedFactor);
    this.setVelocity(x, y);
    this.facing = facingFromVector({ x, y }, this.facing);
    // The fast enemy's sheet is drawn facing up; it turns to its heading.
    if (this.kind === 'fast') this.setRotation(headingRotation({ x, y }, this.rotation));
    this.show(this.clipPhase(), { x, y });
    const frost = tickFrost(this.frost, deltaS);
    this.frost = frost.state;
    const stun = tickStun(this.stunS, deltaS);
    this.stunS = stun.remainingS;
    this.boulderCooldownS = tickBoulderCooldown(this.boulderCooldownS, deltaS);
    if (frost.ended || stun.ended) this.refreshTint();
    const burn = tickBurn(this.burn, deltaS);
    this.burn = burn.state;
    return burn.damage;
  }

  /**
   * The velocity this frame asks for: a straight chase at the archetype's speed,
   * scaled by whatever slow or stun holds the enemy. The boss (CO-050) overrides
   * this with its charge cycle; `deltaS` is for such stateful movers.
   */
  protected steer(_deltaS: number, target: Readonly<Vec2>, speedFactor: number): Vec2 {
    return chaseVelocity(this, target, ENEMY_ARCHETYPES[this.kind].speed * speedFactor);
  }

  /** Spec §5 Fire: set (or refresh) a burn of `dps` for the burn duration. */
  applyBurn(dps: number): void {
    this.burn = applyBurn(this.burn, dps);
  }

  /** Spec §5 Ice: slow (max, not additive) and maybe freeze; takes effect on the next chase step. */
  applyFrost(hit: Readonly<FrostHit>): void {
    this.frost = applyFrost(this.frost, hit);
    this.refreshTint();
  }

  /** Spec §5 Lightning: a full stop for `stunS` s (refreshed, never stacked); takes effect on the next chase step. */
  applyStun(stunS: number): void {
    this.stunS = applyStun(this.stunS, stunS);
    this.refreshTint();
  }

  /**
   * Spec §5 Earth: claim a boulder hit. `true` means it lands and this enemy's
   * own 0.4 s window has just opened; any boulder inside it is ignored.
   */
  tryBoulderHit(): boolean {
    const { remainingS, hit } = tryBoulderHit(this.boulderCooldownS);
    this.boulderCooldownS = remainingS;
    return hit;
  }

  /**
   * Spec §5 Earth: shove the enemy by `push` px, kept inside the arena. The
   * body picks the new spot up on its next step; the chase resumes from there.
   */
  knockBack(push: Readonly<Vec2>): void {
    const bounds = this.scene.physics.world.bounds;
    this.setPosition(
      Phaser.Math.Clamp(this.x + push.x, bounds.left, bounds.right),
      Phaser.Math.Clamp(this.y + push.y, bounds.top, bounds.bottom),
    );
  }

  /** The tint says which effect holds the enemy: a stun over a slow, nothing when it moves freely. */
  protected refreshTint(): void {
    if (this.stunS > 0) this.setTintFill(STUN_TINT);
    else if (this.slowed) this.setTintFill(FROST_TINT);
    else this.clearTint();
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

  /**
   * `true` on the blow that kills, so a death is handled exactly once. The
   * killing blow takes the body out of the world at once; the sprite stays to
   * play its death clip and `chase` releases it when that ends.
   */
  takeDamage(amount: number): boolean {
    if (this.dying) return false;
    const result = damageEnemy(this.hp, amount);
    const landed = result.hp < this.hp;
    this.hp = result.hp;
    if (!result.died) {
      if (landed) this.hurtMs = ENEMY_HURT_MS;
      return false;
    }
    this.dying = true;
    this.hurtMs = 0;
    this.setVelocity(0, 0);
    this.disableBody(false, false);
    this.clearTint();
    this.deathMs = this.show('death', { x: 0, y: 0 });
    if (this.deathMs <= 0) this.despawn();
    return true;
  }
}
