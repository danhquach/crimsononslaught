import Phaser from 'phaser';
import { PICKUP_RADIUS } from '../config/gems';
import { PLAYER_SPEED } from '../config/player';
import { DEFAULT_FACING, facingFromVector, heroAnimation, type Facing } from '../core/animation';
import {
  PLAYER_EVENT,
  createHealth,
  flickerAlpha,
  grantMaxHp,
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
import { firstPad } from '../scenes/input';

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
  private facing: Facing = DEFAULT_FACING;
  /** Run-clock ms of death clip still to play; the death event fires when it runs out. */
  private deathMs = 0;
  private dead = false;

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
  }

  get hp(): number {
    return this.health.hp;
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

  get speed(): number {
    return this.moveSpeed;
  }

  /** How far this player pulls XP gems in from; `GemPool` is the only reader. */
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
    const { x, y } = moveVelocity(move, this.speed);
    this.setVelocity(x, y);
    this.facing = facingFromVector(move, this.facing);
    this.show({ moving: x !== 0 || y !== 0 });
  }

  /** Spec §5: a hit costs HP and grants 0.5 s of invulnerability; hits inside it are ignored. */
  takeDamage(amount: number): void {
    const { state, damaged, died } = takeDamage(this.health, amount);
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

  /**
   * Raise the maximum. The level-up fallback leaves current HP alone; a
   * Vitality rank heals for what it adds (Phase 2 spec §5).
   */
  grantMaxHp(bonus: number, heal = false): void {
    this.setHealth(grantMaxHp(this.health, bonus, heal));
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
  private show(state: { moving: boolean }): void {
    const name = heroAnimation({
      facing: this.facing,
      moving: state.moving,
      hurt: isInvulnerable(this.health),
      dead: this.dead,
    });
    showClip(this, name, BODY_RADIUS);
  }

  /**
   * HP 0: stop, play the death clip once, and only then tell the run. With no
   * atlas the clip has no length and the event fires from the same step.
   */
  private startDeath(): void {
    this.dead = true;
    this.setVelocity(0, 0);
    this.setAlpha(1);
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
