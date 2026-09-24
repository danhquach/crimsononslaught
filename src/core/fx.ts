import {
  AREA_SCALE_RADIUS,
  CHAIN_FRAME_COUNT,
  CHAIN_FRAME_RATE,
  EXPLOSION_SCALE_RADIUS,
  LARGE_BURN_MIN_RADIUS,
  NOVA_SCALE_RADIUS,
  SPIN_BASE_ORBIT_SPEED,
  TELEGRAPH_SCALE_RADIUS,
} from '../config/fx';
import type { Vec2 } from './input';

/**
 * Spell FX decisions that do not need an engine (CO-082): how big an effect
 * is drawn for the live stats, which overlay an enemy's status calls for, how
 * a chain segment lies between two enemies and which frame of it shows.
 *
 * `spells/*.ts`, `systems/FxPool.ts` and `systems/OverlayPool.ts` are the
 * Phaser side and only draw what these return. Pure TS, no Phaser import.
 */

/** Spec §5 Fire: the explosion is drawn at `aoeRadius / 40`, so a Reach perk grows the blast on screen. */
export function explosionScale(aoeRadius: number): number {
  return aoeRadius / EXPLOSION_SCALE_RADIUS;
}

/** Spec §5 Ice: the pulse is drawn at `radius / 90`, so a Reach perk grows the ring on screen. */
export function novaScale(radius: number): number {
  return radius / NOVA_SCALE_RADIUS;
}

/** #135: a ground area is drawn at `radius / 100`, so the ring is the patch that ticks. */
export function areaScale(radius: number): number {
  return Math.max(0, radius) / AREA_SCALE_RADIUS;
}

/**
 * #179: a patch's own art is drawn so its art box (`ART_BOXES`, not the frame,
 * which takes in a transparent margin) spans the patch: `artWidth` across is
 * `2 * radius` on screen.
 */
export function areaArtScale(radius: number, artWidth: number): number {
  if (!(artWidth > 0)) return 0;
  return (Math.max(0, radius) * 2) / artWidth;
}

/** #138: a strike telegraph is drawn at `radius / 100`, so the ring is the blast to come. */
export function telegraphScale(radius: number): number {
  return Math.max(0, radius) / TELEGRAPH_SCALE_RADIUS;
}

/**
 * Spec §5 Earth: the spin plays at its authored rate at the base orbit speed
 * and in proportion above it. A stopped ring shows a still boulder.
 */
export function spinTimeScale(orbitSpeed: number): number {
  return Math.max(0, orbitSpeed / SPIN_BASE_ORBIT_SPEED);
}

/** Which way art authored facing right turns to fly along `velocity`; stopped keeps `previous`. */
export function flightRotation(velocity: Readonly<Vec2>, previous: number): number {
  if (velocity.x === 0 && velocity.y === 0) return previous;
  return Math.atan2(velocity.y, velocity.x);
}

/** The knockback dust is drawn blowing the way the enemy was pushed; the sheet blows right. */
export function dustFlip(push: Readonly<Vec2>): boolean {
  return push.x < 0;
}

/** What holds an enemy this frame, as the overlay chooser needs it. */
export interface EnemyStatus {
  readonly burning: boolean;
  readonly slowed: boolean;
  readonly frozen: boolean;
  readonly stunned: boolean;
  /** In a stagger (#139): the short stop, ranked under the stun it can share the enemy with. */
  readonly staggered: boolean;
  /** Bleeding (#139): a damage-over-time, ranked under a burn. */
  readonly bleeding: boolean;
  /** Body radius: the tank and the boss burn with the big flame. */
  readonly radius: number;
}

/**
 * The one overlay an enemy shows, or null for none. A loadout carries up to
 * three spells (Phase 2), so several statuses can hold one enemy at once; the
 * harder stop wins, a stop beats a slow, and a slow beats a damage-over-time.
 * Within Ice the freeze block covers the slow; a stun outranks a stagger
 * because the enemy is stopped for longer.
 *
 * Stagger and bleed have their own clips; a burn outranks a bleed, and bleed
 * has one size for every body.
 */
export function statusOverlay(status: Readonly<EnemyStatus>): string | null {
  if (status.frozen) return 'ice.freeze';
  if (status.stunned) return 'lightning.stun';
  if (status.staggered) return 'status.stagger';
  if (status.slowed) return 'ice.slow';
  if (status.burning) {
    return status.radius >= LARGE_BURN_MIN_RADIUS ? 'fire.burnBig' : 'fire.burn';
  }
  if (status.bleeding) return 'status.bleed';
  return null;
}

/** Where a tiled chain segment lies: anchored at `from`, stretched to `to`, turned along the line. */
export interface SegmentPose {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly rotation: number;
}

export function chainSegmentPose(from: Readonly<Vec2>, to: Readonly<Vec2>): SegmentPose {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { x: from.x, y: from.y, length: Math.hypot(dx, dy), rotation: Math.atan2(dy, dx) };
}

/** Run-clock length of one pass of the chain clip, in ms — how long a segment stays up. */
export const CHAIN_CYCLE_MS = (CHAIN_FRAME_COUNT / CHAIN_FRAME_RATE) * 1000;

/**
 * Which chain frame shows `elapsedMs` into a segment's life, or null once the
 * cycle has played: the segment is stepped on the run clock, so a paused run
 * holds it and a scaled run flashes it faster.
 */
export function chainFrame(elapsedMs: number): number | null {
  if (!(elapsedMs >= 0) || elapsedMs >= CHAIN_CYCLE_MS) return null;
  return Math.min(CHAIN_FRAME_COUNT - 1, Math.floor((elapsedMs / 1000) * CHAIN_FRAME_RATE));
}
