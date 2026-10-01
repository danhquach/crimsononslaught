import type { DashStats } from '../config/dash';
import type { Facing } from './animation';
import type { Vec2 } from './input';

/**
 * The dash rules (#384), without an engine: a fixed-distance burst along a
 * direction, an invulnerability window on its own clock, and a cooldown.
 * `entities/Player.ts` feeds in the press and the step and moves the body by
 * what comes back.
 *
 * Everything is a function of the state and the step length, so a long step —
 * a slow frame, or `?timeScale=` — gives the same dash as many short ones: the
 * last step of a burst is scaled to land on the exact distance, and the trail
 * is placed by interpolating along the path, not by counting steps.
 *
 * The window is not `core/health.ts`'s 0.5 s after a hit: it neither extends
 * nor resets that one, and a hit does not touch this.
 *
 * Pure TS, no Phaser import. The numbers live in `config/dash.ts`.
 */

export interface DashState {
  /** Ms of cooldown still to run; 0 is ready. */
  readonly cooldownMs: number;
  /** Ms of the burst already played; meaningful only while `dashing`. */
  readonly elapsedMs: number;
  readonly dashing: boolean;
  /** Ms of invulnerability left; 0 means a hit lands. */
  readonly invulnMs: number;
  /** Unit direction of the burst. */
  readonly dir: Readonly<Vec2>;
  /** px of the burst already carried out. */
  readonly traveledPx: number;
  /** Ghosts of this burst already placed. */
  readonly trailPlaced: number;
}

export const IDLE_DASH: DashState = {
  cooldownMs: 0,
  elapsedMs: 0,
  dashing: false,
  invulnMs: 0,
  dir: { x: 0, y: 1 },
  traveledPx: 0,
  trailPlaced: 0,
};

const FACING_VECTOR: Readonly<Record<Facing, Readonly<Vec2>>> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The unit vector a facing points along. */
export function facingVector(facing: Facing): Readonly<Vec2> {
  return FACING_VECTOR[facing];
}

/**
 * The direction a dash goes: along the move being held (normalised, so a
 * half-pushed stick dashes as far as a key), else the way the hero last faced.
 */
export function dashDirection(move: Readonly<Vec2>, facing: Facing): Readonly<Vec2> {
  const length = Math.hypot(move.x, move.y);
  if (!(length > 0)) return facingVector(facing);
  return { x: move.x / length, y: move.y / length };
}

export function isDashing(state: Readonly<DashState>): boolean {
  return state.dashing;
}

/** Whether a hit would be ignored by the dash's own window. */
export function isDashInvulnerable(state: Readonly<DashState>): boolean {
  return state.invulnMs > 0;
}

/** Whether a press now would start a dash. */
export function isDashReady(state: Readonly<DashState>): boolean {
  return !state.dashing && state.cooldownMs <= 0;
}

/** 0 right after a dash, 1 when ready: how much of the cooldown has run. */
export function cooldownProgress(state: Readonly<DashState>, stats: Readonly<DashStats>): number {
  if (state.cooldownMs <= 0 || !(stats.cooldownMs > 0)) return 1;
  return Math.min(1, Math.max(0, 1 - state.cooldownMs / stats.cooldownMs));
}

export interface StartResult {
  readonly state: DashState;
  /** The press started a dash; false when it came during a dash or the cooldown. */
  readonly started: boolean;
}

/**
 * A press. It starts a dash only when ready; during a dash or the cooldown it
 * changes nothing. The cooldown runs from the press.
 */
export function tryStartDash(
  state: Readonly<DashState>,
  stats: Readonly<DashStats>,
  move: Readonly<Vec2>,
  facing: Facing,
): StartResult {
  if (!isDashReady(state)) return { state, started: false };
  return {
    started: true,
    state: {
      cooldownMs: stats.cooldownMs,
      elapsedMs: 0,
      dashing: true,
      invulnMs: stats.invulnMs,
      dir: dashDirection(move, facing),
      traveledPx: 0,
      trailPlaced: 0,
    },
  };
}

export interface TickResult {
  readonly state: DashState;
  /** How far the body moves this step, px; zero when not dashing. */
  readonly displacement: Vec2;
  /** The burst finished on this step. */
  readonly ended: boolean;
  /** The cooldown reached zero on this step: true on exactly one step per dash. */
  readonly ready: boolean;
  /** Distances from the take-off point, px, of the ghosts to lay this step. */
  readonly trail: readonly number[];
}

/**
 * One simulation step of `deltaMs`. The burst advances linearly, and the step
 * that finishes it carries exactly what is left, so the distance is
 * `stats.distancePx` whatever the step size. Ghosts go every `spacingMs` of
 * burst, the first at the take-off, interpolated along the path.
 */
export function tickDash(
  state: Readonly<DashState>,
  stats: Readonly<DashStats>,
  deltaMs: number,
  spacingMs: number,
): TickResult {
  const delta = Math.max(0, deltaMs);
  const cooldownMs = Math.max(0, state.cooldownMs - delta);
  const ready = state.cooldownMs > 0 && cooldownMs === 0;
  const invulnMs = Math.max(0, state.invulnMs - delta);
  if (!state.dashing) {
    return {
      state: { ...state, cooldownMs, invulnMs },
      displacement: { x: 0, y: 0 },
      ended: false,
      ready,
      trail: [],
    };
  }

  const elapsedMs = Math.min(stats.durationMs, state.elapsedMs + delta);
  const ended = elapsedMs >= stats.durationMs;
  const traveledPx = ended ? stats.distancePx : stats.distancePx * (elapsedMs / stats.durationMs);
  const carried = traveledPx - state.traveledPx;

  const trail: number[] = [];
  let placed = state.trailPlaced;
  if (spacingMs > 0) {
    // The ghost at the very end of the burst is the hero's own place: stop short of it.
    while (placed * spacingMs <= elapsedMs && placed * spacingMs < stats.durationMs) {
      trail.push(stats.distancePx * ((placed * spacingMs) / stats.durationMs));
      placed += 1;
    }
  }

  return {
    state: {
      ...state,
      cooldownMs,
      invulnMs,
      elapsedMs,
      dashing: !ended,
      traveledPx,
      trailPlaced: placed,
    },
    displacement: { x: state.dir.x * carried, y: state.dir.y * carried },
    ended,
    ready,
    trail,
  };
}

/** The velocity that carries `displacement` over a step of `deltaMs`; zero for an empty step. */
export function dashVelocity(displacement: Readonly<Vec2>, deltaMs: number): Vec2 {
  if (!(deltaMs > 0)) return { x: 0, y: 0 };
  const seconds = deltaMs / 1000;
  return { x: displacement.x / seconds, y: displacement.y / seconds };
}

/** Event names on the Game scene's emitter for the dash's sound, trail and ready cue. */
export const DASH_EVENT = {
  /** A dash started: `{ x, y }`, the take-off point. */
  start: 'dash:start',
  /** A ghost to lay: `{ x, y }`. */
  trail: 'dash:trail',
  /** The cooldown ran out. */
  ready: 'dash:ready',
} as const;

/** `patch` laid over `base`, each field kept only if usable: a spell cannot leave the dash frozen, endless or divide by zero. */
export function sanitizeDashStats(patch: Partial<DashStats>, base: Readonly<DashStats>): DashStats {
  const positive = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  const atLeastZero = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  const durationMs = positive(patch.durationMs, base.durationMs);
  const cooldownMs = atLeastZero(patch.cooldownMs, base.cooldownMs);
  return {
    distancePx: positive(patch.distancePx, base.distancePx),
    durationMs,
    invulnMs: atLeastZero(patch.invulnMs, base.invulnMs),
    // A cooldown that ended mid-burst would ring the ready cue before the dash
    // can be used; 0 still means no cooldown at all.
    cooldownMs: cooldownMs === 0 ? 0 : Math.max(cooldownMs, durationMs),
  };
}
