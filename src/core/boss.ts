import { BOSS } from '../config/boss';
import { chaseVelocity, type Vec2 } from './enemy';

/**
 * Boss rules that do not need an engine (spec §5 "Boss"): the charge cycle —
 * chase, 0.8 s telegraph, 0.6 s charge, every 4 s — and the velocity each phase
 * asks for.
 *
 * `entities/Boss.ts` is the Phaser side; everything decidable without Phaser
 * lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

export type BossPhase = 'chase' | 'telegraph' | 'charge';

export interface BossCycle {
  readonly phase: BossPhase;
  /** Seconds left in `phase`. */
  readonly remainingS: number;
  /**
   * Unit vector of the charge, locked as the telegraph ends toward where the
   * player stood (spec §5). Zero outside a charge, and zero when the player
   * stood on the boss at that instant — nowhere to charge.
   */
  readonly chargeDir: Vec2;
}

const NO_DIRECTION: Vec2 = { x: 0, y: 0 };

/** Seconds of plain chase between a charge ending and the next telegraph. */
const CHASE_S = BOSS.cycleS - BOSS.telegraphS - BOSS.chargeS;

const PHASE_LENGTH_S: Readonly<Record<BossPhase, number>> = {
  chase: CHASE_S,
  telegraph: BOSS.telegraphS,
  charge: BOSS.chargeS,
};

const NEXT_PHASE: Readonly<Record<BossPhase, BossPhase>> = {
  chase: 'telegraph',
  telegraph: 'charge',
  charge: 'chase',
};

/** A fresh boss opens with a chase; the first telegraph comes `cycleS - telegraphS - chargeS` s in. */
export function startBossCycle(): BossCycle {
  return { phase: 'chase', remainingS: CHASE_S, chargeDir: NO_DIRECTION };
}

/**
 * Advance the cycle by one frame of `deltaS` seconds. A frame that outruns the
 * current phase carries the remainder into the next, so a long frame (a scaled
 * run) keeps the 4 s period exact. The frame that ends the telegraph locks the
 * charge toward `target` as seen from `from`; nothing later turns it. A bad
 * frame leaves the cycle alone.
 */
export function stepBossCycle(
  cycle: BossCycle,
  deltaS: number,
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
): BossCycle {
  if (!(deltaS > 0) || !Number.isFinite(deltaS)) return cycle;
  let { phase, remainingS, chargeDir } = cycle;
  let left = deltaS;
  while (left >= remainingS) {
    left -= remainingS;
    if (phase === 'telegraph') chargeDir = unitToward(from, target);
    phase = NEXT_PHASE[phase];
    remainingS = PHASE_LENGTH_S[phase];
  }
  return { phase, remainingS: remainingS - left, chargeDir };
}

/**
 * The velocity the current phase asks for: a straight chase at the boss speed,
 * a dead stop for the telegraph, or the locked charge at `chargeSpeed`. Slows
 * and stuns scale it through `speedFactor` like any other enemy's movement —
 * the cycle keeps time regardless, so a frozen boss simply charges nowhere.
 */
export function bossVelocity(
  cycle: BossCycle,
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
  speedFactor = 1,
): Vec2 {
  switch (cycle.phase) {
    case 'chase':
      return chaseVelocity(from, target, BOSS.speed * speedFactor);
    case 'telegraph':
      return { x: 0, y: 0 };
    case 'charge': {
      const speed = BOSS.chargeSpeed * speedFactor;
      return { x: cycle.chargeDir.x * speed, y: cycle.chargeDir.y * speed };
    }
  }
}

function unitToward(from: Readonly<Vec2>, to: Readonly<Vec2>): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return NO_DIRECTION;
  return { x: dx / distance, y: dy / distance };
}
