import type { Vec2 } from './input';
import type { Rng } from './rng';

/**
 * How an ice storm is drawn (#219): sleet streaking across the patch like
 * heavy rain slanted by the wind, fading out toward the rim so the storm has
 * no drawn border, ice bursting where it lands, and the whole storm fading in
 * and out. `systems/AreaPool.ts` draws what these return.
 *
 * Every clock here is the run clock the pool is stepped with, so a paused run
 * holds the storm and a `?timeScale=` run plays it faster. Pure TS, no Phaser
 * import.
 */

/** A storm that fades in when it lands and out as it runs down. */
export interface StormFade {
  readonly fadeInS: number;
  readonly fadeOutS: number;
}

/**
 * The storm's alpha `elapsedS` into a patch with `remainingS` left: ramping up
 * over `fadeInS` and down over the last `fadeOutS`, full between. A patch too
 * short for both takes the lower ramp.
 */
export function stormAlpha(
  elapsedS: number,
  remainingS: number,
  fade: Readonly<StormFade>,
): number {
  const rampIn = fade.fadeInS > 0 ? elapsedS / fade.fadeInS : 1;
  const rampOut = fade.fadeOutS > 0 ? remainingS / fade.fadeOutS : 1;
  return Math.max(0, Math.min(1, rampIn, rampOut));
}

/**
 * How many spawns fall due in the step from `elapsedS` to `elapsedS + deltaS`
 * at `perSecond`: every whole one the window crossed, so a long frame pays all
 * it stands in for and a paused one (`deltaS` 0) none.
 */
export function spawnsDue(elapsedS: number, deltaS: number, perSecond: number): number {
  if (!(deltaS > 0) || !(perSecond > 0)) return 0;
  const before = Math.floor(Math.max(0, elapsedS) * perSecond + 1e-9);
  const after = Math.floor((Math.max(0, elapsedS) + deltaS) * perSecond + 1e-9);
  return after - before;
}

/** A spot uniform over the disc of `reach` round `centre`, drawn from the run's rng. */
export function spotInDisc(centre: Readonly<Vec2>, reach: number, rng: Rng): Vec2 {
  const r = Math.max(0, reach) * Math.sqrt(rng.next());
  const angle = rng.next() * Math.PI * 2;
  return { x: centre.x + Math.cos(angle) * r, y: centre.y + Math.sin(angle) * r };
}

/** What the sleet rules need of `config/areas.ts`'s `SleetRule`. */
export interface SleetShape {
  readonly velocity: Readonly<Vec2>;
  readonly speedJitter: number;
  readonly lifeS: number;
  /** Pieces in the air on average per 1000 px² of patch. */
  readonly density: number;
  readonly rimFade: number;
}

/** Pieces a storm of `radius` sends up per second, so it stays as thick at any size. */
export function sleetRate(radius: number, sleet: Readonly<SleetShape>): number {
  if (!(radius > 0) || !(sleet.lifeS > 0)) return 0;
  return (sleet.density * Math.PI * radius * radius) / 1000 / sleet.lifeS;
}

/** One piece of sleet: where it starts, how it falls, which frame it is drawn with. */
export interface SleetPiece {
  readonly x0: number;
  readonly y0: number;
  readonly vx: number;
  readonly vy: number;
  readonly lifeS: number;
  /** The art is drawn flying right; this turns it along its fall. */
  readonly rotation: number;
  readonly frame: number;
}

/**
 * A new piece for a storm on `centre` of `radius`: the middle of its fall is a
 * spot inside the patch, so every piece crosses the storm rather than starting
 * at its edge, and its speed varies by up to `speedJitter` either way.
 */
export function sleetPiece(
  centre: Readonly<Vec2>,
  radius: number,
  sleet: Readonly<SleetShape>,
  frames: number,
  rng: Rng,
): SleetPiece {
  const mid = spotInDisc(centre, radius, rng);
  const speed = 1 + sleet.speedJitter * (rng.next() * 2 - 1);
  const vx = sleet.velocity.x * speed;
  const vy = sleet.velocity.y * speed;
  const half = sleet.lifeS / 2;
  return {
    x0: mid.x - vx * half,
    y0: mid.y - vy * half,
    vx,
    vy,
    lifeS: sleet.lifeS,
    rotation: Math.atan2(vy, vx),
    frame: Math.min(frames - 1, Math.floor(rng.next() * frames)),
  };
}

/** Where a piece is `ageS` into its fall. */
export function sleetPose(piece: Readonly<SleetPiece>, ageS: number): Vec2 {
  return { x: piece.x0 + piece.vx * ageS, y: piece.y0 + piece.vy * ageS };
}

/** The share of a fall, at each end, over which a piece appears and vanishes. */
const PIECE_RAMP = 0.2;

/**
 * How opaque a piece is `ageS` into its fall: it appears and vanishes over the
 * ends of its fall, and fades out over the last `rimFade` of the radius so
 * nothing is seen at or past the edge that ticks.
 */
export function sleetAlpha(
  piece: Readonly<SleetPiece>,
  ageS: number,
  centre: Readonly<Vec2>,
  radius: number,
  rimFade: number,
): number {
  if (!(radius > 0) || !(piece.lifeS > 0)) return 0;
  const t = ageS / piece.lifeS;
  const ends = Math.min(1, t / PIECE_RAMP, (1 - t) / PIECE_RAMP);
  const at = sleetPose(piece, ageS);
  const inFromRim = radius - Math.hypot(at.x - centre.x, at.y - centre.y);
  const rim = rimFade > 0 ? inFromRim / (rimFade * radius) : inFromRim > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, ends, rim));
}
