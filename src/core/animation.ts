import { ANIMATIONS, type Facing } from '../config/animations';
import type { EnemyType } from '../config/enemies';
import type { FrameInfo } from '../config/frames';
import type { BossPhase } from './boss';
import type { Vec2 } from './input';

export type { Facing };

/**
 * Which animation each entity shows, decided without an engine (CO-081):
 * facing from a movement vector, the clip name for a hero / enemy / boss / gem
 * state, and where a sprite's circle body sits so that changing frame never
 * moves the hitbox.
 *
 * `entities/*.ts` are the Phaser side and only play what these return.
 * Pure TS, no Phaser import.
 */

/** Spec: the hero faces down until the first move. */
export const DEFAULT_FACING: Facing = 'down';

/**
 * 4-way facing from a movement vector: the dominant axis wins, a diagonal
 * counts as horizontal, and no movement keeps the last facing.
 */
export function facingFromVector(move: Readonly<Vec2>, previous: Facing): Facing {
  const { x, y } = move;
  if (x === 0 && y === 0) return previous;
  if (Math.abs(y) > Math.abs(x)) return y > 0 ? 'down' : 'up';
  return x > 0 ? 'right' : 'left';
}

/**
 * Sprite rotation for art authored facing up (the fast enemy): turn it along
 * its velocity; standing still keeps the last heading.
 */
export function headingRotation(velocity: Readonly<Vec2>, previous: number): number {
  if (velocity.x === 0 && velocity.y === 0) return previous;
  return Math.atan2(velocity.y, velocity.x) + Math.PI / 2;
}

export interface HeroPose {
  readonly facing: Facing;
  readonly moving: boolean;
  /** Inside the 0.5 s invulnerability window. */
  readonly hurt: boolean;
  readonly dead: boolean;
}

/** Death outranks the hurt frame, which outranks walking, which outranks idling. */
export function heroAnimation(pose: Readonly<HeroPose>): string {
  if (pose.dead) return 'hero.death';
  if (pose.hurt) return `hero.hurt.${pose.facing}`;
  return `hero.${pose.moving ? 'walk' : 'idle'}.${pose.facing}`;
}

/** What a regular enemy is doing, in the order the sheet names them. */
export type EnemyPhase = 'spawn' | 'move' | 'hurt' | 'death';

export interface EnemyPose {
  readonly kind: EnemyType;
  readonly phase: EnemyPhase;
  /** Used by the tank, whose walk and hurt are drawn per facing. */
  readonly facing: Facing;
  /** Horizontal velocity sign, used by the swarm, which flips instead of turning. */
  readonly velocityX: number;
}

export interface Clip {
  readonly name: string;
  readonly flipX: boolean;
}

/**
 * Swarm and fast have one clip per phase; the tank walks and flinches per
 * facing (its sheet calls moving `walk`). The swarm mirrors itself to face its
 * direction of travel; nothing else flips, every other side is drawn.
 */
export function enemyAnimation(pose: Readonly<EnemyPose>): Clip {
  const { kind, phase, facing, velocityX } = pose;
  if (kind === 'tank') {
    if (phase === 'move') return { name: `tank.walk.${facing}`, flipX: false };
    if (phase === 'hurt') return { name: `tank.hurt.${facing}`, flipX: false };
    return { name: `tank.${phase}`, flipX: false };
  }
  return { name: `${kind}.${phase}`, flipX: kind === 'swarm' && velocityX < 0 };
}

export interface BossPose {
  readonly phase: BossPhase;
  readonly facing: Facing;
  /** Inside the hurt flash after a hit. */
  readonly hurt: boolean;
  readonly dead: boolean;
}

/**
 * The telegraph and charge always show — the warning is the point of them
 * (spec §5) — so the hurt frame only interrupts the walk.
 */
export function bossAnimation(pose: Readonly<BossPose>): string {
  if (pose.dead) return 'boss.death';
  if (pose.phase !== 'chase') return `boss.${pose.phase}.${pose.facing}`;
  if (pose.hurt) return `boss.hurt.${pose.facing}`;
  return `boss.walk.${pose.facing}`;
}

export interface GemPose {
  /** Inside the player's pickup radius and drifting in. */
  readonly drifting: boolean;
  /** Touched by the player; bursting before it leaves the pool. */
  readonly collected: boolean;
}

export function gemAnimation(pose: Readonly<GemPose>): string {
  if (pose.collected) return 'gem.pickup';
  return pose.drifting ? 'gem.drift' : 'gem.idle';
}

const DURATIONS_MS = new Map(
  ANIMATIONS.map((anim) => [anim.name, (anim.frames.length / anim.frameRate) * 1000]),
);

/**
 * How long one pass of `name` takes, in ms; 0 for a name the atlas does not
 * have, so an entity with no clip to show moves on at once. Timed on the run
 * clock by the entities, so a paused run holds a death mid-frame.
 */
export function animationDurationMs(name: string): number {
  return DURATIONS_MS.get(name) ?? 0;
}

/**
 * Where a frame's anchor sits, as a fraction of the frame — the sprite origin
 * that keeps the drawn character on the sprite's position whatever the frame
 * was trimmed to.
 */
export function frameOrigin(info: Readonly<FrameInfo>): Vec2 {
  return { x: info.anchorX / info.w, y: info.anchorY / info.h };
}

/**
 * Top-left of a circle body of `radius` inside the frame, so the body's centre
 * is the frame's anchor: the hitbox stays on the sprite's position when the
 * frame changes size (CO-081), and its radius is the config's, not the art's.
 */
export function bodyOffset(info: Readonly<FrameInfo>, radius: number): Vec2 {
  return { x: info.anchorX - radius, y: info.anchorY - radius };
}

/**
 * Where an Arcade circle body ends up for a sprite at `position`: Arcade
 * places the body at `position - origin * size + offset`, and the circle's
 * centre is one radius in from there.
 */
export function bodyCentre(
  position: Readonly<Vec2>,
  info: Readonly<FrameInfo>,
  radius: number,
): Vec2 {
  const origin = frameOrigin(info);
  const offset = bodyOffset(info, radius);
  return {
    x: position.x - origin.x * info.w + offset.x + radius,
    y: position.y - origin.y * info.h + offset.y + radius,
  };
}
