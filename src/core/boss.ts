import { BOSS } from '../config/boss';
import type { Vec2 } from './enemy';

/**
 * Boss rules that do not need an engine (spec §5 "Boss"): the charge cycle —
 * chase, 0.8 s telegraph, 0.6 s charge, every 4 s — and the movement each frame
 * of it asks for.
 *
 * `entities/Boss.ts` is the Phaser side; everything decidable without Phaser
 * lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

export type BossPhase = 'chase' | 'telegraph' | 'charge';

/**
 * Emitter event names for the boss -> Game direction, namespaced like `run:*`.
 * `died` fires once the death animation has played out, not on the killing
 * blow (CO-081): the win waits for it. `phase` fires with `{ phase }` each
 * time the charge cycle moves on (CO-102: the telegraph and charge cues).
 */
export const BOSS_EVENT = {
  died: 'boss:died',
  phase: 'boss:phase',
} as const;

export interface BossPhasePayload {
  readonly phase: BossPhase;
}

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

/** What one frame came to: the cycle after it, and the movement it asks for. */
export interface BossStep {
  readonly cycle: BossCycle;
  /**
   * Velocity to hold for the whole frame, px/s: everything the frame's phases
   * move the boss, spread evenly over its length.
   *
   * A frame is one velocity, but a frame can span several phases — at a scaled
   * clock (`?timeScale=`) one frame covers seconds of run time, several times
   * the 0.6 s charge. Charging at 400 px/s for such a frame threw the boss
   * thousands of px out of a 3000 px arena and left it walking back at 70 px/s
   * for most of the fight, out of reach of Earth's 80 px ring (#89). Averaging
   * keeps the distance each phase covers exactly what the spec says, whatever
   * the frame length, at the cost of the telegraph's stop reading as a slow
   * drift on a frame that also charges.
   */
  readonly velocity: Vec2;
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
 * Advance the cycle by one frame of `deltaS` seconds and say how to move over
 * it. A frame that outruns the current phase carries the remainder into the
 * next, so a long frame (a scaled run) keeps the 4 s period exact and moves the
 * boss by what each phase it crossed asks for — no more. The frame that ends
 * the telegraph locks the charge toward `target` as seen from `from`; nothing
 * later turns it. A bad frame leaves the cycle alone and moves nothing.
 *
 * Slows and stuns scale the movement through `speedFactor`, the charge
 * included; the cycle keeps time regardless, so a frozen boss simply charges
 * nowhere. The chase legs all aim where the target stood at the start of the
 * frame, as a regular enemy's chase does (`chaseVelocity`).
 */
export function stepBossCycle(
  cycle: BossCycle,
  deltaS: number,
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
  speedFactor = 1,
): BossStep {
  if (!(deltaS > 0) || !Number.isFinite(deltaS)) return { cycle, velocity: NO_DIRECTION };
  let { phase, remainingS, chargeDir } = cycle;
  const chaseDir = unitToward(from, target);
  let moveX = 0;
  let moveY = 0;
  let left = deltaS;
  const travel = (seconds: number): void => {
    const step = phaseSpeed(phase) * seconds;
    const direction = phase === 'charge' ? chargeDir : chaseDir;
    moveX += direction.x * step;
    moveY += direction.y * step;
  };
  while (left >= remainingS) {
    travel(remainingS);
    left -= remainingS;
    if (phase === 'telegraph') chargeDir = unitToward(from, target);
    phase = NEXT_PHASE[phase];
    remainingS = PHASE_LENGTH_S[phase];
  }
  travel(left);
  const scale = speedFactor / deltaS;
  return {
    cycle: { phase, remainingS: remainingS - left, chargeDir },
    velocity: { x: moveX * scale, y: moveY * scale },
  };
}

/** How fast the boss moves in `phase`, px/s: it stands still to telegraph (spec §5). */
function phaseSpeed(phase: BossPhase): number {
  switch (phase) {
    case 'chase':
      return BOSS.speed;
    case 'telegraph':
      return 0;
    case 'charge':
      return BOSS.chargeSpeed;
  }
}

function unitToward(from: Readonly<Vec2>, to: Readonly<Vec2>): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return NO_DIRECTION;
  return { x: dx / distance, y: dy / distance };
}
