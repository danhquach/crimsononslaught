import Phaser from 'phaser';
import { ENEMY_ARCHETYPES, ENEMY_HURT_MS, type EnemyType } from '../config/enemies';
import { HIT_FLASH_MS, HIT_FLASH_TINT } from '../config/hitFeedback';
import { BURN_DURATION } from '../config/spells';
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
  UNSCALED,
  chaseVelocity,
  damageEnemy,
  scaleArchetype,
  tickContactCooldown,
  tryContact,
  type Vec2,
  type WaveScale,
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
import {
  NO_BLEED,
  applyBleed,
  applyStagger,
  hasBleed,
  staggerSpeedFactor,
  tickBleed,
  tickStagger,
  type BleedState,
} from '../core/status';
import { NO_FORCE, confineVelocity, heldForce, sumVelocities } from '../core/vortex';
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
  /** Contact damage as the spawning wave scaled it (#127); the boss has its own. */
  private contact = ENEMY_ARCHETYPES.swarm.contactDamage;
  private contactCooldownMs = 0;
  private burn: BurnState = { ...NO_BURN };
  private bleed: BleedState = { ...NO_BLEED };
  private frost: FrostState = { ...NO_FROST };
  /** Seconds of stun left; 0 when moving freely. */
  private stunS = 0;
  /** Seconds of stagger left (#139); its own clock, so it and a stun both run out on their own. */
  private staggerS = 0;
  /** Seconds before a boulder may hit this enemy again; 0 when it may. */
  private boulderCooldownS = 0;
  /** Velocity the spells have asked for since the last chase step (#136); spent and cleared by it. */
  private force: Readonly<Vec2> = NO_FORCE;
  private facing: Facing = DEFAULT_FACING;
  /** Run-clock ms left of the arrival hold, the hurt flash and the death clip. */
  private spawnMs = 0;
  private hurtMs = 0;
  /** Run-clock ms left of the white hit flash (#125); presentation only. */
  private flashMs = 0;
  private deathMs = 0;
  private dying = false;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, ENEMY_ARCHETYPES.swarm.texture);
  }

  get enemyType(): EnemyType {
    return this.kind;
  }

  get contactDamage(): number {
    return this.contact;
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

  /** #139: in the short stop of a stagger; the overlay pool marks it. */
  get isStaggered(): boolean {
    return this.staggerS > 0;
  }

  /** #139: a bleed is ticking on it; the overlay pool marks it. */
  get isBleeding(): boolean {
    return hasBleed(this.bleed);
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

  /**
   * Take this pooled object out of the pool as `type`, alive and at (x, y),
   * with hp and contact damage scaled by the wave that spawned it (#127).
   */
  spawn(type: EnemyType, x: number, y: number, scale: Readonly<WaveScale> = UNSCALED): void {
    this.kind = type;
    const stats = scaleArchetype(ENEMY_ARCHETYPES[type], scale);
    this.contact = stats.contactDamage;
    this.arise(stats, x, y);
  }

  /**
   * Come alive at (x, y) with `stats`: full HP, no effects, a fresh body. Shared
   * by every archetype and the boss (CO-050), which brings its own stats.
   */
  protected arise(stats: Readonly<EnemyStats>, x: number, y: number): void {
    this.hp = stats.hp;
    this.contactCooldownMs = 0;
    this.burn = { ...NO_BURN };
    this.bleed = { ...NO_BLEED };
    this.frost = { ...NO_FROST };
    this.stunS = 0;
    this.staggerS = 0;
    this.boulderCooldownS = 0;
    this.force = NO_FORCE;
    this.facing = DEFAULT_FACING;
    this.hurtMs = 0;
    this.flashMs = 0;
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
   * Returns the damage-over-time this frame owes — burn plus bleed — for the
   * caller to apply through the run's damage path, so a tick kill drops gems
   * like any other. A dying enemy owes nothing: its statuses stop paying out
   * the frame it dies.
   */
  chase(deltaMs: number, target: Readonly<Vec2>): number {
    if (this.dying) {
      this.force = NO_FORCE;
      this.deathMs -= deltaMs;
      if (this.deathMs <= 0) this.despawn();
      return 0;
    }
    if (this.flashMs > 0) {
      this.flashMs -= deltaMs;
      if (this.flashMs <= 0) this.refreshTint();
    }
    if (this.spawnMs > 0) {
      // Arriving: the clip plays out where it landed before the chase starts.
      // What a vortex asked meanwhile is dropped, not saved up into one lurch.
      this.force = NO_FORCE;
      this.spawnMs -= deltaMs;
      this.setVelocity(0, 0);
      if (this.spawnMs > 0) return 0;
    }
    this.hurtMs = Math.max(0, this.hurtMs - deltaMs);
    this.contactCooldownMs = tickContactCooldown(this.contactCooldownMs, deltaMs);
    const deltaS = deltaMs / 1000;
    // Three stops multiply, so an enemy under a stun and a stagger stands
    // still until the longer of the two has run out (#139).
    const speedFactor =
      frostSpeedFactor(this.frost) *
      stunSpeedFactor(this.stunS) *
      staggerSpeedFactor(this.staggerS);
    const { x, y } = this.move(this.steer(deltaS, target, speedFactor), speedFactor, deltaS);
    this.setVelocity(x, y);
    this.facing = facingFromVector({ x, y }, this.facing);
    // The fast enemy's sheet is drawn facing up; it turns to its heading.
    if (this.kind === 'fast') this.setRotation(headingRotation({ x, y }, this.rotation));
    this.show(this.clipPhase(), { x, y });
    const frost = tickFrost(this.frost, deltaS);
    this.frost = frost.state;
    const stun = tickStun(this.stunS, deltaS);
    this.stunS = stun.remainingS;
    const stagger = tickStagger(this.staggerS, deltaS);
    this.staggerS = stagger.remainingS;
    this.boulderCooldownS = tickBoulderCooldown(this.boulderCooldownS, deltaS);
    if (frost.ended || stun.ended || stagger.ended) this.refreshTint();
    const burn = tickBurn(this.burn, deltaS);
    this.burn = burn.state;
    const bleed = tickBleed(this.bleed, deltaS);
    this.bleed = bleed.state;
    return burn.damage + bleed.damage;
  }

  /**
   * The velocity this frame asks for: a straight chase at the archetype's speed,
   * scaled by whatever slow or stun holds the enemy. The boss (CO-050) overrides
   * this with its charge cycle; `deltaS` is for such stateful movers.
   */
  protected steer(_deltaS: number, target: Readonly<Vec2>, speedFactor: number): Vec2 {
    return chaseVelocity(this, target, ENEMY_ARCHETYPES[this.kind].speed * speedFactor);
  }

  /**
   * The velocity the body gets: the steering plus whatever the spells asked for
   * through `addForce` since the last step (#136), spent here. With a force in
   * play the step is kept inside the arena, the way `knockBack` clamps; a plain
   * chase is left alone, since the spawn ring sits outside the bounds.
   */
  private move(steering: Readonly<Vec2>, speedFactor: number, deltaS: number): Vec2 {
    if (this.force.x === 0 && this.force.y === 0) return { x: steering.x, y: steering.y };
    const force = heldForce(this.force, speedFactor);
    this.force = NO_FORCE;
    return confineVelocity(
      this,
      sumVelocities(steering, force),
      deltaS,
      this.scene.physics.world.bounds,
    );
  }

  /**
   * #136: ask for `velocity` on top of the chase this step. A vortex calls it
   * for every enemy it holds, every frame; several calls add up, and the next
   * `chase` spends the total and forgets it, so a pull that stops stops.
   */
  addForce(velocity: Readonly<Vec2>): void {
    this.force = sumVelocities(this.force, velocity);
  }

  /** Spec §5 Fire: set (or refresh) a burn of `dps` for `durationS` (default the global burn duration). */
  applyBurn(dps: number, durationS = BURN_DURATION): void {
    this.burn = applyBurn(this.burn, dps, durationS);
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

  /** #139: a short stop for `staggerS` s (refreshed, never stacked), on its own clock beside any stun. */
  applyStagger(staggerS: number): void {
    this.staggerS = applyStagger(this.staggerS, staggerS);
    this.refreshTint();
  }

  /** #139: set (or refresh) a bleed of `dps` for `durationS`; the stronger and longer of two hits stands. */
  applyBleed(dps: number, durationS: number): void {
    this.bleed = applyBleed(this.bleed, dps, durationS);
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

  /**
   * #125: flash white for a moment, so a hit reads on the sprite itself. Only
   * the tint changes — scale would resize the Arcade body and move the
   * collisions — and the status tint comes back when it ends. A dying enemy
   * plays its death clip instead.
   */
  flash(): void {
    if (this.dying) return;
    this.flashMs = HIT_FLASH_MS;
    this.setTintFill(HIT_FLASH_TINT);
  }

  /** The tint says which effect holds the enemy: a stop (stun or stagger) over a slow, nothing when it moves freely. */
  protected refreshTint(): void {
    if (this.stunS > 0 || this.staggerS > 0) this.setTintFill(STUN_TINT);
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
