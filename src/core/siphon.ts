/**
 * Siphon's heal pacing (CO-235), the pure half: damage that lands is banked,
 * then paid out as HP no faster than a hard ceiling, so late-game damage in the
 * hundreds per second can never make the player unkillable.
 *
 * The bank holds at most `bankS` seconds of the ceiling, so a burst pays out
 * over about a second instead of as a spike, and a run that stops dealing
 * damage stops healing within `bankS`. Paying out drains the bank whether or not
 * the player has room, so a full-HP player cannot save healing for later.
 *
 * Pure TS, no Phaser import.
 */

export interface SiphonConfig {
  /** HP per second, whatever the rank or the damage. */
  maxHealPerS: number;
  /** Seconds of the ceiling the bank may hold. */
  bankS: number;
  /** HP healed between cues. */
  cueEveryHp: number;
}

export interface SiphonState {
  /** HP banked, waiting to be paid out. */
  pending: number;
  /** HP healed since the last cue. */
  sinceCue: number;
}

export interface SiphonDrain {
  /** HP to restore this step. */
  heal: number;
  /** Whether a heal cue is due. */
  cue: boolean;
  state: SiphonState;
}

export const NEW_SIPHON: Readonly<SiphonState> = { pending: 0, sinceCue: 0 };

export function resetSiphon(): SiphonState {
  return { ...NEW_SIPHON };
}

/**
 * Bank `share` of `landed` damage. Damage that is not a positive finite number,
 * or a share that is not, banks nothing.
 */
export function accrueSiphon(
  state: Readonly<SiphonState>,
  landed: number,
  share: number,
  cfg: SiphonConfig,
): SiphonState {
  if (!(Number.isFinite(landed) && landed > 0 && Number.isFinite(share) && share > 0)) {
    return state as SiphonState;
  }
  const bank = cfg.maxHealPerS * cfg.bankS;
  const gain = landed * share;
  return {
    ...state,
    pending: Math.min(bank, state.pending + (Number.isFinite(gain) ? gain : bank)),
  };
}

/** One step of paying the bank out; `room` is the HP the player has below max (0 when dead). */
export function drainSiphon(
  state: Readonly<SiphonState>,
  deltaS: number,
  room: number,
  cfg: SiphonConfig,
): SiphonDrain {
  if (!(deltaS > 0) || state.pending <= 0)
    return { heal: 0, cue: false, state: state as SiphonState };
  const drained = Math.min(state.pending, cfg.maxHealPerS * deltaS);
  const healed = Math.min(drained, room > 0 ? room : 0);
  const since = state.sinceCue + healed;
  const cue = healed > 0 && since >= cfg.cueEveryHp;
  return {
    heal: healed,
    cue,
    state: { pending: state.pending - drained, sinceCue: cue ? since - cfg.cueEveryHp : since },
  };
}
