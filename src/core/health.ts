/**
 * Player health and damage intake (spec §5 "Player"): HP 100, and a hit opens
 * a 0.5 s invulnerability window during which further hits are ignored and the
 * sprite flickers.
 *
 * The state is a plain value and every function returns a new one, so the rules
 * are testable without Phaser and the entity (`entities/Player.ts`) stays a thin
 * renderer of whatever the current state says.
 *
 * Pure TS, no Phaser import. The tunables themselves live in `config/player.ts`.
 */

import { INVULN_MS, PLAYER_MAX_HP } from '../config/player';

/** Alpha the sprite drops to on the dark half of a flicker. */
export const FLICKER_ALPHA = 0.3;

/** Length of one flicker half-cycle; 5 blinks across the window. */
export const FLICKER_PERIOD_MS = 100;

export interface HealthState {
  hp: number;
  maxHp: number;
  /** Milliseconds of invulnerability left; 0 means the next hit lands. */
  invulnMs: number;
}

export interface DamageResult {
  state: HealthState;
  /** The hit landed — it was not swallowed by i-frames, a dead player or a non-positive amount. */
  damaged: boolean;
  /** Set only on the hit that takes HP to 0, so `died` can be emitted exactly once. */
  died: boolean;
}

export function createHealth(maxHp: number = PLAYER_MAX_HP): HealthState {
  return { hp: maxHp, maxHp, invulnMs: 0 };
}

export function isDead(state: Readonly<HealthState>): boolean {
  return state.hp <= 0;
}

export function isInvulnerable(state: Readonly<HealthState>): boolean {
  return state.invulnMs > 0;
}

/**
 * Apply `amount` damage. Hits during the invulnerability window are ignored
 * outright — they neither damage nor refresh the window — so a swarm standing
 * on the player still only lands one hit per 0.5 s.
 */
export function takeDamage(state: Readonly<HealthState>, amount: number): DamageResult {
  const blocked = !(amount > 0) || isInvulnerable(state) || isDead(state);
  if (blocked) return { state: { ...state }, damaged: false, died: false };

  const hp = Math.max(0, state.hp - amount);
  return {
    state: { ...state, hp, invulnMs: INVULN_MS },
    damaged: true,
    died: hp === 0,
  };
}

/** Drain the invulnerability window by one frame's delta. */
export function tickHealth(state: Readonly<HealthState>, deltaMs: number): HealthState {
  if (state.invulnMs === 0) return state as HealthState;
  return { ...state, invulnMs: Math.max(0, state.invulnMs - deltaMs) };
}

/** Sprite alpha for the current state: opaque unless the hit flicker is running. */
export function flickerAlpha(state: Readonly<HealthState>): number {
  if (!isInvulnerable(state)) return 1;
  const elapsed = INVULN_MS - state.invulnMs;
  const half = Math.floor(elapsed / FLICKER_PERIOD_MS);
  return half % 2 === 0 ? FLICKER_ALPHA : 1;
}

/** Level-up fallback (spec §5): +10 max HP, no heal. */
export function grantMaxHp(state: Readonly<HealthState>, bonus: number): HealthState {
  return { ...state, maxHp: state.maxHp + bonus };
}

/** Emitter event names for the player -> Game direction, namespaced like `run:*`. */
export const PLAYER_EVENT = {
  died: 'player:died',
} as const;
