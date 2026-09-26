import { METEOR_FALL_ANGLE_DEG, METEOR_FALL_PX } from '../config/strikes';
import type { Vec2 } from './input';
import type { Rng } from './rng';

/**
 * Sky-strike targeting (#138, Phase 2 spec §9.2): Meteor picks a ground point
 * near a target, commits to it, falls toward it for a delay on the run clock,
 * and lands there when the delay is up — whether or not the target it aimed at
 * is still alive or still standing there. Since CO-167 nothing marks the point
 * on the ground: the meteor itself, coming in along `fallPosition`'s path, is
 * the warning, and the blast falls off toward its rim (`blastFalloff`).
 *
 * No spell before it had a delayed landing: every cast so far resolved at once
 * (a nova, a bolt), on contact (a projectile) or kept ticking on a place (a
 * ground area). The boss's charge wind-up is the only telegraph in the game.
 *
 * `spells/MeteorSpell.ts` decides who is aimed at and what a landing costs the
 * crowd; `systems/TelegraphPool.ts` draws the falling meteor and steps it.
 * Pure TS, no Phaser import.
 */

/** One committed strike: where it will land, and how long until it does. */
export interface Telegraph {
  readonly x: number;
  readonly y: number;
  /** Seconds of run time left before the strike lands. */
  readonly remainingS: number;
  /** The whole fall, in seconds of run time: what `remainingS` counted down from. */
  readonly fallS: number;
  /** How far the landing reaches from its centre, in px. */
  readonly radius: number;
}

/**
 * Float noise a countdown may carry when its frames do not divide its delay:
 * thirty frames of 1/30 s leave a 1 s delay a few 1e-17 s short of 0, and a
 * strict `<= 0` would then land a frame late. A nanosecond of run time is far
 * below anything a frame can resolve and far above what rounding accumulates.
 */
const LANDING_TOLERANCE_S = 1e-9;

/** What one frame did to a list of telegraphs: those still counting down, and those that landed. */
export interface TelegraphStep {
  readonly live: Telegraph[];
  readonly landed: Telegraph[];
}

/**
 * Where a strike aimed at `target` actually lands: a point drawn uniformly from
 * the disc of radius `scatterPx` around it, through the seeded RNG, so a replay
 * of the seed puts every meteor back on the same spot. A strike with no scatter
 * lands on the target itself and draws nothing from the stream.
 *
 * Uniform over the disc, not over the radius: `sqrt` on the radial draw is what
 * keeps the points from bunching at the centre.
 */
export function pickImpactPoint(rng: Rng, target: Readonly<Vec2>, scatterPx: number): Vec2 {
  if (!(scatterPx > 0) || !Number.isFinite(scatterPx)) return { x: target.x, y: target.y };
  const angle = rng.next() * Math.PI * 2;
  const distance = Math.sqrt(rng.next()) * scatterPx;
  return { x: target.x + Math.cos(angle) * distance, y: target.y + Math.sin(angle) * distance };
}

/**
 * Commit a strike to `at`, landing `fallDelayS` from now with a `radius` reach.
 *
 * A non-positive or missing delay lands on the very next frame stepped rather
 * than never or at once: the cast still has to pass through the run clock, so
 * a paused run cannot let a zero-delay meteor through.
 */
export function createTelegraph(at: Readonly<Vec2>, fallDelayS: number, radius: number): Telegraph {
  const delay = fallDelayS > 0 && Number.isFinite(fallDelayS) ? fallDelayS : 0;
  return { x: at.x, y: at.y, remainingS: delay, fallS: delay, radius: Math.max(0, radius) };
}

/** How far through its fall a strike is, 0 at the cast to 1 on landing; a zero-length fall is already down. */
export function fallProgress(telegraph: Readonly<Telegraph>): number {
  if (!(telegraph.fallS > 0)) return 1;
  return Math.min(1, Math.max(0, 1 - telegraph.remainingS / telegraph.fallS));
}

/**
 * The unit heading a meteor falls along (CO-167): down and to the right,
 * `angleDeg` off vertical, in screen coordinates where y grows downward.
 */
export function fallHeading(angleDeg = METEOR_FALL_ANGLE_DEG): Vec2 {
  const angle = (angleDeg * Math.PI) / 180;
  return { x: Math.sin(angle), y: Math.cos(angle) };
}

/**
 * Where a meteor aimed at `impact` is drawn at `progress` 0-1 through its fall
 * (CO-167, rework spec §3): a straight line in from `lengthPx` back along the
 * heading, at constant speed, reaching the point exactly at 1. Progress outside
 * 0-1 is held to the ends, so a meteor never overshoots its point.
 */
export function fallPosition(
  impact: Readonly<Vec2>,
  progress: number,
  angleDeg = METEOR_FALL_ANGLE_DEG,
  lengthPx = METEOR_FALL_PX,
): Vec2 {
  const t = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
  const heading = fallHeading(angleDeg);
  const back = (1 - t) * lengthPx;
  return { x: impact.x - heading.x * back, y: impact.y - heading.y * back };
}

/**
 * How far to turn art drawn falling straight down, rock at the bottom, so the
 * rock leads along the heading: `-angleDeg`, in radians, since a positive
 * rotation turns clockwise on screen.
 */
export function fallRotation(angleDeg = METEOR_FALL_ANGLE_DEG): number {
  return (-angleDeg * Math.PI) / 180;
}

/**
 * The share of a blast's centre damage an enemy `distance` px from the point
 * takes (CO-167): 1 at the centre, falling linearly to `edgeFactor` at
 * `radius`, and nothing beyond it. A zero-radius blast still hits what stands
 * on the point, in full.
 */
export function blastFalloff(distance: number, radius: number, edgeFactor: number): number {
  const d = Math.max(0, distance);
  if (!(d <= radius)) return 0;
  if (!(radius > 0)) return 1;
  return 1 + (edgeFactor - 1) * (d / radius);
}

/**
 * Advance every telegraph by one frame of `deltaS` seconds and say which ones
 * landed in it. A telegraph lands in the first frame that spends its remaining
 * delay, so across frames of any length — a 60 fps step or a scaled run's long
 * one — it lands in the frame the run clock crosses its due time, never a frame
 * late and never before. The order of the input is kept in both lists, so two
 * strikes cast in one frame land in the order they were cast.
 *
 * A bad or zero-length frame leaves everything as it was: nothing counts down,
 * nothing lands.
 */
export function advanceTelegraphs(telegraphs: readonly Telegraph[], deltaS: number): TelegraphStep {
  if (!(deltaS > 0) || !Number.isFinite(deltaS)) return { live: [...telegraphs], landed: [] };
  const live: Telegraph[] = [];
  const landed: Telegraph[] = [];
  for (const telegraph of telegraphs) {
    const remainingS = telegraph.remainingS - deltaS;
    if (remainingS <= LANDING_TOLERANCE_S) landed.push({ ...telegraph, remainingS: 0 });
    else live.push({ ...telegraph, remainingS });
  }
  return { live, landed };
}

/**
 * Everything a landing at `center` reaches: every candidate within `radius`,
 * its own distance counting as inside so a stat reads as the reach it says.
 * Nothing is singled out as the direct hit — the strike was aimed at a point,
 * not an enemy — and how hard each is hit is `blastFalloff`'s, by its distance.
 */
export function strikeTargets<T extends Vec2>(
  center: Readonly<Vec2>,
  candidates: readonly T[],
  radius: number,
): T[] {
  if (!(radius >= 0)) return [];
  const radiusSq = radius * radius;
  return candidates.filter((candidate) => {
    const dx = candidate.x - center.x;
    const dy = candidate.y - center.y;
    return dx * dx + dy * dy <= radiusSq;
  });
}
