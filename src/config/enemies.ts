import type { TextureKey } from './colors';

/**
 * Enemy archetypes (spec §5 "Enemies"). One entry per regular enemy type; the
 * boss has its own config (CO-050).
 *
 * Pure data, no Phaser import, so the numbers are unit-tested against the spec
 * table. `entities/Enemy.ts` reads an archetype on spawn and is otherwise
 * type-agnostic — a new enemy type is a row here plus a texture key.
 */
export const ENEMY_TYPES = ['swarm', 'fast', 'tank'] as const;

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
};

/**
 * Spec §5: a hard cap of 300 live enemies. The spawn director (CO-025) can ask
 * for more; requests past the cap are dropped rather than queued, so a slow
 * frame can never snowball into an unbounded crowd.
 */
export const MAX_LIVE_ENEMIES = 300;

/** Spec §5: one enemy damages the player at most once per 0.5 s. */
export const CONTACT_DAMAGE_INTERVAL_MS = 500;
