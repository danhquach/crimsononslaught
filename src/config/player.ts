/**
 * Player tunables (spec §5 "Player" and "Input").
 *
 * Pure data, no Phaser import, so the numbers are unit-tested against the spec
 * table. `core/health.ts` and `core/input.ts` are the rules that read them —
 * the same split as `config/enemies.ts` ↔ `core/enemy.ts`.
 */

/** Spec §5: the player starts a run with 100 HP. */
export const PLAYER_MAX_HP = 100;

/** Spec §5: one hit grants 0.5 s of invulnerability. */
export const INVULN_MS = 500;

/** Spec §5: player move speed in px/s. */
export const PLAYER_SPEED = 180;
