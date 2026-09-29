import { PROFILE_CLAMPS, type PlayerProfile, type ProfileField } from '../config/passives';

/**
 * Whether one more rank of a profile step would change nothing (#227, #315):
 * the field already sits on its `PROFILE_CLAMPS` bound in the direction the
 * step moves it. Shared by the relic offer and the level-up offer, so neither
 * hands out a pick the clamp would swallow.
 *
 * Pure TS, no Phaser import.
 */

/** The part of a passive or relic buff that says which way it moves a field. */
export interface ProfileStep {
  readonly field: ProfileField;
  readonly op: 'add' | 'mul';
  readonly amount: number;
}

/**
 * True when `step`'s field sits at the clamp in the direction the step moves
 * it — Hourglass and Haste lower `cooldownMul` towards its floor, Windstep
 * raises `moveSpeed` towards its ceiling. A field with no clamp that way never
 * caps.
 */
export function atCap(step: ProfileStep, profile: Readonly<PlayerProfile>): boolean {
  const clamp = PROFILE_CLAMPS[step.field];
  const value = profile[step.field];
  const lowers = step.op === 'mul' ? step.amount < 1 : step.amount < 0;
  if (lowers) return clamp?.min !== undefined && value <= clamp.min;
  return clamp?.max !== undefined && value >= clamp.max;
}
