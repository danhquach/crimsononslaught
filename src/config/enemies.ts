import type { TextureKey } from './colors';

/**
 * Enemy archetypes (spec §5 "Enemies"). One entry per regular enemy type; the
 * boss has its own config (CO-050).
 *
 * Pure data, no Phaser import, so the numbers are unit-tested against the spec
 * table. `entities/Enemy.ts` reads an archetype on spawn and is otherwise
 * type-agnostic — a new enemy type is a row here plus a texture key.
 */
export const ENEMY_TYPES = ['swarm', 'fast', 'tank', 'ranged'] as const;

export type EnemyType = (typeof ENEMY_TYPES)[number];

export function isEnemyType(value: unknown): value is EnemyType {
  return typeof value === 'string' && (ENEMY_TYPES as readonly string[]).includes(value);
}

export interface EnemyArchetype {
  hp: number;
  /** Chase speed in px/s. */
  speed: number;
  /** Damage dealt to the player on contact, at most once per 0.5 s per enemy. */
  contactDamage: number;
  /** Body radius in px; the hitbox, independent of the placeholder art's size. */
  radius: number;
  texture: TextureKey;
}

export const ENEMY_ARCHETYPES: Readonly<Record<EnemyType, EnemyArchetype>> = {
  swarm: { hp: 10, speed: 90, contactDamage: 3, radius: 10, texture: 'enemy_swarm' },
  fast: { hp: 8, speed: 170, contactDamage: 3, radius: 8, texture: 'enemy_fast' },
  tank: { hp: 60, speed: 50, contactDamage: 15, radius: 20, texture: 'enemy_tank' },
  // #126: frail and slow, so a player who closes in wins; its threat is `RANGED_ATTACK`.
  ranged: { hp: 12, speed: 80, contactDamage: 3, radius: 11, texture: 'enemy_ranged' },
};

/**
 * #126: how a ranged enemy fights. It walks in until the player is
 * `keepDistance` away, backs off inside `keepDistance - band`, and holds in
 * between; while the player is within `fireDistance` it fires one shot every
 * `fireIntervalMs` at where the player stands. `fireDistance` is under half
 * the 540 px view's height, so a shot never comes from off screen: the player
 * can always see who fired it. The shot does not steer, and
 * flies slightly faster than the player walks, so moving sideways dodges it
 * and standing still does not.
 *
 * `shotDamage` is scaled by the spawning wave's `damageMul`, like contact damage.
 */
export interface RangedAttack {
  keepDistance: number;
  band: number;
  fireDistance: number;
  fireIntervalMs: number;
  shotDamage: number;
  /** px/s. */
  shotSpeed: number;
  /** How far a shot flies before it is spent, in px. */
  shotRange: number;
}

export const RANGED_ATTACK: Readonly<RangedAttack> = {
  keepDistance: 240,
  band: 40,
  fireDistance: 260,
  fireIntervalMs: 2500,
  shotDamage: 5,
  shotSpeed: 200,
  shotRange: 420,
};

/**
 * #126: enemy shots in the air at once. Past it a shot is dropped, not queued,
 * like the enemy cap: a crowd of ranged enemies cannot fill the screen.
 */
export const MAX_LIVE_ENEMY_SHOTS = 60;

/**
 * Spec §5: a hard cap of 300 live enemies. The spawn director (CO-025) can ask
 * for more; requests past the cap are dropped rather than queued, so a slow
 * frame can never snowball into an unbounded crowd.
 */
export const MAX_LIVE_ENEMIES = 300;

/** Spec §5: one enemy damages the player at most once per 0.5 s. */
export const CONTACT_DAMAGE_INTERVAL_MS = 500;

/** How long an enemy shows its hurt frame after a hit (CO-081). */
export const ENEMY_HURT_MS = 100;
