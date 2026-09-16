import Phaser from 'phaser';
import {
  directionVector,
  moveVelocity,
  padVector,
  resolveMove,
  stickVector,
  type Vec2,
} from '../core/input';
import { firstPad } from '../scenes/input';

/** Half the 28 px placeholder circle, so the body matches what is drawn. */
const BODY_RADIUS = 14;

/**
 * The player character (spec §5): WASD or arrows on the keyboard, left stick or
 * D-pad on a gamepad, both live at once. Speed is 180 px/s with diagonals
 * normalized; an Arcade body collides with the world bounds, so the arena edge
 * stops the player rather than a clamp in `update`.
 *
 * `update` is driven by `GameScene`, not by Phaser, so a paused Game (level-up
 * overlay) freezes the player with it.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly wasd: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key> | undefined;

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

  override update(): void {
    const { x, y } = moveVelocity(resolveMove(this.keyboardMove(), this.padMove()));
    this.setVelocity(x, y);
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
