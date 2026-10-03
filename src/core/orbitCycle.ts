/**
 * The out-and-recharge cycle of a ring spell (#406): Lightning Sword's blades
 * and Earth Shield's stones are out for `uptime` seconds, gone for `recharge`
 * seconds, and out again, for as long as the spell is equipped.
 *
 * The rule is not part of the state: both lengths are read from the live stat
 * block every frame and handed to each call, so a Duration or Haste passive
 * taken mid-run lengthens or shortens the phase the ring is already in, the
 * way `Spell.cooldown` is read fresh per frame. `leftS` is the countdown to the
 * next change.
 *
 * Pure TS, no Phaser import.
 */

export type OrbitPhase = 'out' | 'recharge';

export interface OrbitCycleState {
  readonly phase: OrbitPhase;
  /** Seconds until the phase changes. */
  readonly leftS: number;
}

/** The two lengths a cycle runs on, as the live stat block says them. */
export interface OrbitCycleRule {
  /** `uptime`: seconds the pieces stay out. */
  readonly uptime: number;
  /** `recharge`: seconds they stay gone. */
  readonly recharge: number;
}

export interface OrbitCycleStep {
  readonly state: OrbitCycleState;
  /** The pieces came back during this step. */
  readonly appeared: boolean;
  /** The pieces went away during this step. */
  readonly vanished: boolean;
}

/** Phase changes one step may take: a rule of two zero lengths would otherwise never end. */
const MAX_CHANGES_PER_STEP = 4;

function length(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** A cycle at the start of its uptime: how a spell begins when it is equipped. */
export function startOrbitCycle(rule: Readonly<OrbitCycleRule>): OrbitCycleState {
  return { phase: 'out', leftS: length(rule.uptime) };
}

/**
 * Advance the cycle by `deltaS` of run time. A step that spans a boundary
 * carries the remainder into the next phase, so the cycle keeps its period
 * however the frames fall, and reports every change it crossed: a step long
 * enough to cross two says both `vanished` and `appeared`, in that order. A
 * step that is not a positive, finite time changes nothing.
 */
export function stepOrbitCycle(
  state: Readonly<OrbitCycleState>,
  deltaS: number,
  rule: Readonly<OrbitCycleRule>,
): OrbitCycleStep {
  if (!(deltaS > 0) || !Number.isFinite(deltaS)) {
    return { state: { ...state }, appeared: false, vanished: false };
  }
  let { phase, leftS } = state;
  let remaining = deltaS;
  let appeared = false;
  let vanished = false;
  for (let changes = 0; remaining >= leftS && changes < MAX_CHANGES_PER_STEP; changes += 1) {
    remaining -= leftS;
    if (phase === 'out') {
      phase = 'recharge';
      leftS = length(rule.recharge);
      vanished = true;
    } else {
      phase = 'out';
      leftS = length(rule.uptime);
      appeared = true;
    }
  }
  return { state: { phase, leftS: Math.max(0, leftS - remaining) }, appeared, vanished };
}

/**
 * End the uptime now: the pieces vanish and the recharge starts. A ring that is
 * already recharging is left alone and reports nothing vanished.
 */
export function endEarly(
  state: Readonly<OrbitCycleState>,
  recharge: number,
): { state: OrbitCycleState; vanished: boolean } {
  if (state.phase === 'recharge') return { state: { ...state }, vanished: false };
  return { state: { phase: 'recharge', leftS: length(recharge) }, vanished: true };
}

/** Whether the pieces are out. */
export function isOut(state: Readonly<OrbitCycleState>): boolean {
  return state.phase === 'out';
}
