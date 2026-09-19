import type { Vec2 } from './input';
import type { Rng } from './rng';

/**
 * Persistent ground areas (#135, Phase 2 spec §9): a patch of arena that is
 * placed once, lives for a duration on the run clock, and applies its effects
 * to whatever is standing in it every `tickEveryS` until it expires.
 *
 * Blizzard and Earthquake are both this; Tornado (#136) is this plus a drift
 * and a pull. Every spell before them resolved instantly (a nova, a bolt) or on
 * contact (a projectile, a boulder), so nothing in the game yet keeps an effect
 * alive in a place rather than on an entity.
 *
 * An area is geometry and a clock, not a body: membership is a distance test
 * against the live enemies (`pulseTargets`' rule in `core/frostNova.ts`), which
 * is what keeps `CollisionSystem` and the physics world out of it entirely. An
 * enemy walking in is caught by the next tick and one walking out stops being
 * hit the same way, with no enter/leave events to keep in step.
 *
 * Spec §6.2: an area has a finite lifetime, so it snapshots its numbers when it
 * is placed — a passive taken while a Blizzard is on the ground grows the
 * *next* one rather than the patch under the player's feet.
 *
 * Overlapping areas do not merge: each one ticks on its own clock against its
 * own members, so an enemy in two of them takes both, and the slows they carry
 * resolve to the strongest through `applyFrost` rather than stacking (spec
 * §9.3). Pure TS, no Phaser import.
 */

/** The numbers an area is placed with, as the live stat block said them at that moment. */
export interface AreaRule {
  /** `radius`: how far the patch reaches from its centre, in px. */
  readonly radius: number;
  /** `duration`: seconds of run time the patch lives for. */
  readonly durationS: number;
  /** `tickRate`: seconds between two ticks of its effects. */
  readonly tickEveryS: number;
}

/** One patch on the ground: where it is, how long it has left, and what it has paid out. */
export interface GroundArea extends AreaRule {
  readonly x: number;
  readonly y: number;
  /** Seconds of run time left before it expires. */
  readonly remainingS: number;
  /** Ticks already paid out, so a frame owes only what it crossed. */
  readonly ticksPaid: number;
}

export interface AreaStep {
  readonly area: GroundArea;
  /** Ticks this frame owes. Each one is a separate application of the effects. */
  readonly ticks: number;
  /** The frame the patch ran out; its sprite is freed and it is stepped no more. */
  readonly expired: boolean;
}

/**
 * Place a patch at `at` with the numbers `rule` holds right now.
 *
 * It starts with a full interval to pay: the first tick lands `tickEveryS` in,
 * not on the frame it was cast, the same way `CastScheduler` makes a spell wait
 * a full cooldown for its first cast. A free tick on placement would make a
 * 6 s / 0.5 s Blizzard pay 13 ticks where its block promises 12.
 */
export function createArea(at: Readonly<Vec2>, rule: Readonly<AreaRule>): GroundArea {
  return {
    x: at.x,
    y: at.y,
    radius: Math.max(0, rule.radius),
    durationS: Math.max(0, rule.durationS),
    tickEveryS: rule.tickEveryS,
    remainingS: Math.max(0, rule.durationS),
    ticksPaid: 0,
  };
}

/** Whether the patch is still on the ground and worth stepping. */
export function isLive(area: Readonly<GroundArea>): boolean {
  return area.remainingS > 0;
}

/**
 * Advance a patch by one frame of `deltaS` seconds of run time and say how many
 * ticks it owes over it.
 *
 * A frame longer than an interval pays every tick it crossed, so a 3 s frame at
 * `?timeScale=30` is worth exactly as much as the 180 small frames it stands in
 * for — the property the scaled smoke runs depend on (spec §8). A frame that
 * outruns the remaining lifetime pays only what fits inside it and expires.
 *
 * What is owed is counted from the lifetime spent rather than from an
 * accumulator, so the last frame — which lands `remainingS` on exactly 0 — pays
 * `durationS / tickEveryS` ticks to the frame, whatever rounding the hundreds
 * of frames before it accumulated. A bad or zero-length frame changes nothing.
 */
export function advanceArea(area: Readonly<GroundArea>, deltaS: number): AreaStep {
  if (!(deltaS > 0) || !Number.isFinite(deltaS) || !isLive(area)) {
    return { area, ticks: 0, expired: !isLive(area) };
  }
  const lived = Math.min(deltaS, area.remainingS);
  const remainingS = area.remainingS - lived;
  // A non-positive or missing interval would pay out forever; such a config is
  // caught at boot (spec §7), and here the patch simply sits there doing nothing.
  const owed =
    area.tickEveryS > 0 && Number.isFinite(area.tickEveryS)
      ? Math.max(0, Math.floor((area.durationS - remainingS) / area.tickEveryS) - area.ticksPaid)
      : 0;
  return {
    area: { ...area, remainingS, ticksPaid: area.ticksPaid + owed },
    ticks: owed,
    expired: remainingS <= 0,
  };
}

/**
 * Everything standing in the patch right now: every candidate within `radius`
 * of its centre, its own distance counting as inside so the stat block reads as
 * the reach it promises.
 *
 * Called fresh for every tick rather than remembered from the cast, which is
 * the whole membership rule: an enemy that wandered in is caught by the next
 * tick and never by the one before it, and an enemy that left is not hit again.
 */
export function membersOf<T extends Vec2>(
  area: Readonly<GroundArea>,
  candidates: readonly T[],
): T[] {
  const radiusSq = area.radius * area.radius;
  return candidates.filter((candidate) => {
    const dx = candidate.x - area.x;
    const dy = candidate.y - area.y;
    return dx * dx + dy * dy <= radiusSq;
  });
}

/**
 * Where to drop a patch of `radius` (spec §9.3): on the densest cluster within
 * `targetRange` of `origin` — the candidate enemy that has the most company
 * inside a patch centred on it — and on `origin` itself when the caster is
 * alone, so a cast is never wasted off in empty arena.
 *
 * Centring on an enemy rather than searching the plane keeps the choice cheap
 * and always lands the patch on at least one target. Ties are broken through
 * the run's seeded RNG, as the spec asks, and *only* when there is a tie: a
 * lone cluster draws nothing, so placing an area never shifts the sequence the
 * rest of the run reads.
 */
export function densestSpot<T extends Vec2>(
  origin: Readonly<Vec2>,
  candidates: readonly T[],
  radius: number,
  targetRange: number,
  rng: Rng,
): Vec2 {
  const rangeSq = targetRange * targetRange;
  const radiusSq = radius * radius;
  const inRange = candidates.filter((candidate) => {
    const dx = candidate.x - origin.x;
    const dy = candidate.y - origin.y;
    return dx * dx + dy * dy <= rangeSq;
  });
  let best: T[] = [];
  let bestCount = 0;
  for (const centre of inRange) {
    let count = 0;
    for (const other of candidates) {
      const dx = other.x - centre.x;
      const dy = other.y - centre.y;
      if (dx * dx + dy * dy <= radiusSq) count += 1;
    }
    if (count > bestCount) {
      best = [centre];
      bestCount = count;
    } else if (count === bestCount) {
      best.push(centre);
    }
  }
  const [first] = best;
  if (!first) return { x: origin.x, y: origin.y };
  const spot = best.length === 1 ? first : rng.pick(best);
  return { x: spot.x, y: spot.y };
}
