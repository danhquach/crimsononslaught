import { CONTACT_DAMAGE_INTERVAL_MS, MAX_LIVE_ENEMIES } from '../config/enemies';
import type { Vec2 } from './input';

export type { Vec2 };

/**
 * Enemy rules that do not need an engine (spec §5 "Enemies"): the chase vector,
 * the contact-damage cadence, the HP/death math and the live-enemy cap.
 *
 * `entities/Enemy.ts` and `systems/EnemyPool.ts` are the Phaser side; everything
 * decidable without Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import. The tunables themselves live in `config/enemies.ts`.
 */

/**
 * Velocity that moves straight at the target at `speed` px/s (spec §5: "move
 * directly toward player each frame"). Standing on the target — or a
 * non-positive speed — yields no movement rather than a divide by zero.
 */
export function chaseVelocity(from: Readonly<Vec2>, to: Readonly<Vec2>, speed: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || speed <= 0) return { x: 0, y: 0 };
  return { x: (dx / distance) * speed, y: (dy / distance) * speed };
}

/** Whether another enemy may be spawned; at the cap the request is dropped (spec §5). */
export function canSpawn(liveCount: number, cap: number = MAX_LIVE_ENEMIES): boolean {
  return liveCount < cap;
}

/** Drain an enemy's contact cooldown by one frame's delta. */
export function tickContactCooldown(cooldownMs: number, deltaMs: number): number {
  return Math.max(0, cooldownMs - deltaMs);
}

/**
 * Try to land a contact tick. A hit opens this enemy's own 0.5 s window;
 * touches inside it are ignored and do not extend it, so an enemy glued to the
 * player deals exactly one tick per 0.5 s.
 */
export function tryContact(cooldownMs: number): { cooldownMs: number; hit: boolean } {
  if (cooldownMs > 0) return { cooldownMs, hit: false };
  return { cooldownMs: CONTACT_DAMAGE_INTERVAL_MS, hit: true };
}

/**
 * Apply `amount` damage to an enemy. `died` is set only on the blow that takes
 * HP to 0, so a death is handled exactly once however many hits land after.
 */
export function damageEnemy(hp: number, amount: number): { hp: number; died: boolean } {
  if (hp <= 0 || !(amount > 0)) return { hp: Math.max(0, hp), died: false };
  const next = Math.max(0, hp - amount);
  return { hp: next, died: next === 0 };
}
