import Phaser from 'phaser';
import {
  PLAYER_EVENT,
  createHealth,
  flickerAlpha,
  grantMaxHp,
  takeDamage,
  tickHealth,
  type HealthState,
} from '../core/health';
import {
  PLAYER_SPEED,
  directionVector,
  moveVelocity,
  padVector,
  resolveMove,
  stickVector,
  type Vec2,
} from '../core/input';
import { emitRunEvent } from '../core/runEvents';
import { firstPad } from '../scenes/input';

/** Half the 28 px placeholder circle, so the body matches what is drawn. */
const BODY_RADIUS = 14;

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
 * emits `PLAYER_EVENT.died` once. Every HP change is published as a `run:hp`
 * event, so the HUD never reads this entity.
 *
 * `update` is driven by `GameScene`, not by Phaser, so a paused Game (level-up
 * overlay) freezes the player with it.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly wasd: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key> | undefined;
  private health: HealthState = createHealth();
  /** px/s before diagonal normalization; the Move Speed perk raises it (CO-042). */
  speed = PLAYER_SPEED;

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

  override update(deltaMs = 0): void {
    this.setHealth(tickHealth(this.health, deltaMs));
    const { x, y } = moveVelocity(resolveMove(this.keyboardMove(), this.padMove()), this.speed);
    this.setVelocity(x, y);
  }

  /** Spec §5: a hit costs HP and grants 0.5 s of invulnerability; hits inside it are ignored. */
  takeDamage(amount: number): void {
    const { state, damaged, died } = takeDamage(this.health, amount);
    this.setHealth(state);
    if (!damaged) return;
    emitRunEvent(this.scene.events, 'hp', { hp: state.hp, maxHp: state.maxHp });
    if (died) this.scene.events.emit(PLAYER_EVENT.died);
  }

  /** Level-up fallback (spec §5): raise the maximum, leaving current HP alone. */
  grantMaxHp(bonus: number): void {
    this.setHealth(grantMaxHp(this.health, bonus));
    emitRunEvent(this.scene.events, 'hp', { hp: this.health.hp, maxHp: this.health.maxHp });
  }

  private setHealth(state: HealthState): void {
    this.health = state;
    this.setAlpha(flickerAlpha(state));
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
