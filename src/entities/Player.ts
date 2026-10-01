import Phaser from 'phaser';
import { PICKUP_RADIUS } from '../config/gems';
import { BASE_DASH, DASH_CUE, DASH_TRAIL, type DashStats } from '../config/dash';
import { PLAYER_SPEED } from '../config/player';
import { DEFAULT_FACING, facingFromVector, heroAnimation, type Facing } from '../core/animation';
import {
  DASH_EVENT,
  IDLE_DASH,
  cooldownProgress,
  dashVelocity,
  isDashInvulnerable,
  isDashReady,
  sanitizeDashStats,
  tickDash,
  tryStartDash,
  type DashState,
} from '../core/dash';
import {
  PLAYER_EVENT,
  createHealth,
  flickerAlpha,
  grantMaxHp,
  heal,
  isInvulnerable,
  regenHealth,
  takeDamage,
  tickHealth,
  type HealthState,
} from '../core/health';
import {
  clampMoveSpeed,
  directionVector,
  moveVelocity,
  padVector,
  resolveMove,
  stickVector,
  type Vec2,
} from '../core/input';
import { emitRunEvent } from '../core/runEvents';
import { clipDurationMs, showClip } from '../render/animate';
import { firstPad, watchPadButton, type StartButtonWatch } from '../scenes/input';

/** Half the 28 px placeholder circle; the atlas frames are placed around it (CO-081). */
const BODY_RADIUS = 14;

const DEATH_CLIP = 'hero.death';

/**
 * The player character (spec §5): WASD or arrows on the keyboard, left stick or
 * D-pad on a gamepad, both live at once. Speed is 180 px/s with diagonals
 * normalized; an Arcade body collides with the world bounds, so the arena edge
 * stops the player rather than a clamp in `update`.
 *
 * Move speed, max HP and pickup radius are the run's stats, not constants: the
 * generic perks raise them, and `GameScene` pushes each change here (CO-042).
 *
 * HP and damage intake live in `core/health.ts`: `takeDamage` applies a hit at
 * most once per 0.5 s, the sprite flickers for that window, and the killing blow
 * emits `PLAYER_EVENT.died` once — after the death clip has played, when the
 * atlas supplied one (CO-081). Every HP change is published as a `run:hp`
 * event, so the HUD never reads this entity.
 *
 * The hero faces where they last moved and shows the atlas clip for what they
 * are doing (`core/animation.ts`); with no atlas the placeholder circle stands
 * still and the run plays exactly as before.
 *
 * The dash (#384, `core/dash.ts`) is a built-in move: Space or pad A starts a
 * burst of `DashStats.distancePx` along the held direction, whose velocity
 * replaces the walk velocity for its length, so the arena edge stops it like a
 * step. The hero keeps its facing for the whole burst and wears a tint for the
 * dash's own invulnerability window; `GameScene` reads `dashInvulnerable` ahead
 * of the run's defences. The stats are the run's copy, so a later spell can
 * change them through `setDashStats`.
 *
 * `update` is driven by `GameScene`, not by Phaser, so a paused Game (level-up
 * overlay) freezes the player with it.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly wasd: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key> | undefined;
  private health: HealthState = createHealth();
  /** px/s before diagonal normalization; the Swift passive raises it (CO-110). */
  private moveSpeed = PLAYER_SPEED;
  /** px the player attracts XP gems from; the Magnet passive widens it (CO-110). */
  private gemPickupRadius = PICKUP_RADIUS;
  /** HP per second healed continuously; the Regeneration passive raises it (CO-110). */
  private hpRegenPerSecond = 0;
  /** Fraction of each hit removed before HP; the Ward passive raises it (#139, spec §4.1). */
  private damageReduction = 0;
  private facing: Facing = DEFAULT_FACING;
  /** Run-clock ms of death clip still to play; the death event fires when it runs out. */
  private deathMs = 0;
  private dead = false;
  private dashStats: DashStats = BASE_DASH;
  private dash: DashState = IDLE_DASH;
  /** Where the current burst took off, for laying its trail. */
  private dashFrom = { x: 0, y: 0 };
  /** A Space press since the last step; set by the key event, only while the scene runs. */
  private dashQueued = false;
  private readonly padDash: StartButtonWatch;
  /** Whether the invulnerability tint is on now. */
  private dashCued = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BODY_RADIUS);
    body.setCollideWorldBounds(true);

    const keyboard = scene.input.keyboard ?? undefined;
    this.cursors = keyboard?.createCursorKeys();
    this.wasd = keyboard?.addKeys('W,A,S,D') as
      Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key> | undefined;
    // Space as an event, not a polled key: a tap shorter than a frame is down and
    // up again before the step reads it. A press while the scene is paused (the
    // level-up overlay, the pause screen) is not a dash.
    keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
      if (!event.repeat && scene.scene.isActive()) this.dashQueued = true;
    });
    this.padDash = watchPadButton(scene, 'A');
  }

  get hp(): number {
    return this.health.hp;
  }

  /** At 0 HP and playing the death clip out; the run reads it to stop paying out (#315). */
  get isDead(): boolean {
    return this.dead;
  }

  get maxHp(): number {
    return this.health.maxHp;
  }

  /**
   * Whether the 0.5 s window from the last hit is still running. `GameScene`
   * reads it to drop a contact before it reaches the run's defences (#134): a
   * hit the player is immune to must not be paid for out of a shield's pool.
   */
  get immune(): boolean {
    return isInvulnerable(this.health);
  }

  /** Test hook (#315): drop the 0.5 s window from the last hit, so the next one lands. */
  endImmunity(): void {
    this.setHealth({ ...this.health, invulnMs: 0 });
  }

  /** Inside the dash's own invulnerability window (#384); `GameScene` drops every hit while it runs. */
  get dashInvulnerable(): boolean {
    return isDashInvulnerable(this.dash);
  }

  /** The run's dash numbers right now. */
  get dashNumbers(): Readonly<DashStats> {
    return this.dashStats;
  }

  /** The HUD's view of the cooldown: share run, and whether a press would dash. */
  get dashCooldown(): { progress: number; ready: boolean } {
    return { progress: cooldownProgress(this.dash, this.dashStats), ready: isDashReady(this.dash) };
  }

  /** Test hook (#384): the dash as the browser suite reads it, in one object. */
  get dashReport(): {
    state: 'dashing' | 'cooldown' | 'ready';
    anim: string;
    tinted: boolean;
    invulnerable: boolean;
    progress: number;
    facing: Facing;
  } {
    const ready = isDashReady(this.dash);
    return {
      state: this.dash.dashing ? 'dashing' : ready ? 'ready' : 'cooldown',
      anim: this.anims.currentAnim?.key ?? '',
      tinted: this.dashCued,
      invulnerable: this.dashInvulnerable,
      progress: cooldownProgress(this.dash, this.dashStats),
      facing: this.facing,
    };
  }

  /**
   * Passive- or spell-driven dash numbers (#384): the only write path. A field
   * that is not usable keeps its current value.
   */
  setDashStats(stats: Partial<DashStats>): void {
    this.dashStats = sanitizeDashStats(stats, this.dashStats);
  }

  /**
   * Forget a Space or A press made while the scene was not running. Called on
   * resume: the pad is read through `watchPadButton`'s skipped first poll, since
   * Phaser refreshes pads after the scene's update and the A that confirmed a
   * level-up card would otherwise read as a press (CO-179).
   */
  resetDashInput(): void {
    this.dashQueued = false;
    this.padDash.reset();
  }

  get speed(): number {
    return this.moveSpeed;
  }

  /** How far this player pulls XP gems, Embers and consumables in from; `GemPool` and `PickupPool` read it. */
  get pickupRadius(): number {
    return this.gemPickupRadius;
  }

  override update(deltaMs = 0): void {
    if (this.dead) {
      this.deathMs -= deltaMs;
      if (this.deathMs <= 0) this.finishDeath();
      return;
    }
    this.setHealth(tickHealth(this.health, deltaMs));
    this.regenerate(deltaMs);
    const move = resolveMove(this.keyboardMove(), this.padMove());
    const pressed = this.dashPressed();
    if (pressed) this.startDash(move);
    // True on the step that finishes the burst too: it still carries the last of the distance.
    const bursting = this.dash.dashing;
    const tick = tickDash(this.dash, this.dashStats, deltaMs, DASH_TRAIL.spacingMs);
    this.dash = tick.state;

    // The burst replaces the walk, and holds the facing it took off with.
    const { x, y } = bursting
      ? dashVelocity(tick.displacement, deltaMs)
      : moveVelocity(move, this.speed);
    this.setVelocity(x, y);
    if (!bursting) this.facing = facingFromVector(move, this.facing);
    this.cueDash();
    this.show({ moving: x !== 0 || y !== 0, dashing: bursting });
    this.announceDash(tick.trail, tick.ready);
  }

  /** Both inputs are read every step so the pad's edge tracker never misses a poll. */
  private dashPressed(): boolean {
    const key = this.dashQueued;
    this.dashQueued = false;
    return this.padDash.pressed() || key;
  }

  private startDash(move: Vec2): void {
    const { state, started } = tryStartDash(this.dash, this.dashStats, move, this.facing);
    if (!started) return;
    this.dash = state;
    this.dashFrom = { x: this.x, y: this.y };
    this.facing = facingFromVector(state.dir, this.facing);
    this.scene.events.emit(DASH_EVENT.start, { x: this.x, y: this.y });
  }

  /** The tint is on exactly while the window runs; a tint, so it never fights the hit flicker's alpha. */
  private cueDash(): void {
    const cued = isDashInvulnerable(this.dash);
    if (cued === this.dashCued) return;
    this.dashCued = cued;
    if (cued) this.setTint(DASH_CUE.tint);
    else this.clearTint();
  }

  /** After the pose is shown, so a ghost copies the frame the hero is in. */
  private announceDash(trail: readonly number[], ready: boolean): void {
    const bounds = this.scene.physics.world.bounds;
    for (const along of trail) {
      const x = this.dashFrom.x + this.dash.dir.x * along;
      const y = this.dashFrom.y + this.dash.dir.y * along;
      this.scene.events.emit(DASH_EVENT.trail, {
        x: Math.min(bounds.right, Math.max(bounds.x, x)),
        y: Math.min(bounds.bottom, Math.max(bounds.y, y)),
      });
    }
    if (ready) this.scene.events.emit(DASH_EVENT.ready);
  }

  /** Spec §5: a hit costs HP, less the profile's damage reduction (#139), and grants 0.5 s of invulnerability; hits inside it are ignored. */
  takeDamage(amount: number): void {
    const { state, damaged, died } = takeDamage(this.health, amount, this.damageReduction);
    this.setHealth(state);
    if (!damaged) return;
    emitRunEvent(this.scene.events, 'hp', { hp: state.hp, maxHp: state.maxHp });
    if (died) this.startDeath();
  }

  /**
   * Passive-driven move speed (spec §4.1): the only write path, so a caller cannot
   * leave the player frozen or teleporting. Anything unusable keeps the base
   * speed rather than being stored.
   */
  setMoveSpeed(pxPerSecond: number): void {
    this.moveSpeed = clampMoveSpeed(pxPerSecond);
  }

  /**
   * Passive-driven pickup radius (spec §4.1), set outright like the move speed.
   * The gem pool reads it off the player it is already given, so nothing else
   * has to carry the number.
   */
  setPickupRadius(px: number): void {
    this.gemPickupRadius = px;
  }

  /** Passive-driven regeneration in HP per second (spec §4.1); 0 is none. */
  setHpRegen(hpPerSecond: number): void {
    this.hpRegenPerSecond = Math.max(0, hpPerSecond);
  }

  /** Passive-driven damage reduction, 0–1 (spec §4.1); `core/status.ts` clamps what it is handed. */
  setDamageReduction(fraction: number): void {
    this.damageReduction = fraction;
  }

  /**
   * Raise the maximum. The level-up fallback leaves current HP alone; a
   * Vitality rank heals for what it adds (Phase 2 spec §5).
   */
  grantMaxHp(bonus: number, heal = false): void {
    this.setHealth(grantMaxHp(this.health, bonus, heal));
    emitRunEvent(this.scene.events, 'hp', { hp: this.health.hp, maxHp: this.health.maxHp });
  }

  /** Restore `amount` HP at once (#128, a health pickup), capped at the maximum. */
  heal(amount: number): void {
    this.setHealth(heal(this.health, amount));
    emitRunEvent(this.scene.events, 'hp', { hp: this.health.hp, maxHp: this.health.maxHp });
  }

  /**
   * One step of Regeneration. Healing is continuous but the HUD is told only
   * when the HP it would draw changes, so a scaled run does not emit an event
   * per simulation step for a fraction of a point.
   */
  private regenerate(deltaMs: number): void {
    const before = Math.ceil(this.health.hp);
    this.setHealth(regenHealth(this.health, this.hpRegenPerSecond, deltaMs));
    if (Math.ceil(this.health.hp) === before) return;
    emitRunEvent(this.scene.events, 'hp', { hp: this.health.hp, maxHp: this.health.maxHp });
  }

  private setHealth(state: HealthState): void {
    this.health = state;
    this.setAlpha(flickerAlpha(state));
  }

  /** The clip for this step's state; the hurt frame rides on top of the flicker. */
  private show(state: { moving: boolean; dashing?: boolean }): void {
    const pose = {
      facing: this.facing,
      moving: state.moving,
      hurt: isInvulnerable(this.health),
      dead: this.dead,
      dashing: state.dashing ?? false,
    };
    // Without the dash clip in the atlas the hero keeps walking through it.
    if (!showClip(this, heroAnimation(pose), BODY_RADIUS) && pose.dashing) {
      showClip(this, heroAnimation({ ...pose, dashing: false, moving: true }), BODY_RADIUS);
    }
  }

  /**
   * HP 0: stop, play the death clip once, and only then tell the run. With no
   * atlas the clip has no length and the event fires from the same step.
   */
  private startDeath(): void {
    this.dead = true;
    this.dash = IDLE_DASH;
    this.setVelocity(0, 0);
    this.setAlpha(1);
    this.clearTint();
    this.dashCued = false;
    this.show({ moving: false });
    this.deathMs = clipDurationMs(this.scene, DEATH_CLIP);
    if (this.deathMs <= 0) this.finishDeath();
  }

  private finishDeath(): void {
    this.deathMs = Number.POSITIVE_INFINITY;
    this.scene.events.emit(PLAYER_EVENT.died);
  }

  private keyboardMove(): Vec2 {
    const { cursors, wasd } = this;
    return directionVector({
      up: isDown(cursors?.up) || isDown(wasd?.W),
      down: isDown(cursors?.down) || isDown(wasd?.S),
      left: isDown(cursors?.left) || isDown(wasd?.A),
      right: isDown(cursors?.right) || isDown(wasd?.D),
    });
  }

  private padMove(): Vec2 {
    const pad = firstPad(this.scene);
    if (!pad) return { x: 0, y: 0 };
    return padVector(
      { up: pad.up, down: pad.down, left: pad.left, right: pad.right },
      stickVector(pad.leftStick.x, pad.leftStick.y),
    );
  }
}

const isDown = (key: Phaser.Input.Keyboard.Key | undefined): boolean => key?.isDown ?? false;
