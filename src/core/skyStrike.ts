import type { Vec2 } from './input';
import type { Rng } from './rng';

/**
 * Sky-strike targeting (#138, Phase 2 spec §9.2): Meteor picks a ground point
 * near a target, commits to it, shows a telegraph there for a delay on the run
 * clock, and lands there when the delay is up — whether or not the target it
 * aimed at is still alive or still standing there.
 *
 * No spell before it had a delayed landing: every cast so far resolved at once
 * (a nova, a bolt), on contact (a projectile) or kept ticking on a place (a
 * ground area). The boss's charge wind-up is the only telegraph in the game.
 *
 * `spells/MeteorSpell.ts` decides who is aimed at and what a landing costs the
 * crowd; `systems/TelegraphPool.ts` draws the marker and steps it. Pure TS, no
 * Phaser import.
 */

/** One committed strike: where it will land, and how long until it does. */
export interface Telegraph {
  readonly x: number;
  readonly y: number;
  /** Seconds of run time left before the strike lands. */
  readonly remainingS: number;
  /** How far the landing reaches from its centre, in px — what the marker outlines. */
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
  return { x: at.x, y: at.y, remainingS: delay, radius: Math.max(0, radius) };
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
 * not an enemy, so the whole crowd under it takes the same blast.
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
