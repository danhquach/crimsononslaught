import type { Vec2 } from './input';
import { nearestEnemies } from './spell';
import type { LightningStats } from './spellStats';

/**
 * Chain Lightning rules that do not need an engine (spec §5 "Lightning — Chain
 * Lightning"): where each bolt starts, who it jumps to, what every hit pays out,
 * and how the stun it leaves on an enemy runs out.
 *
 * `spells/ChainLightningSpell.ts` is the Phaser side; everything decidable
 * without Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/** One enemy struck by a bolt and what it took. */
export interface BoltHit<T extends Vec2> {
  target: T;
  damage: number;
}

/** One bolt of a cast: its first target, then each chain jump, in the order the arc ran. */
export type Bolt<T extends Vec2> = BoltHit<T>[];

/**
 * Spec §5: the first target takes `damage`; every enemy the bolt chains to
 * takes `damage * chainFalloff` (80%, or 100% with No Falloff). The falloff is
 * flat per chained hit, not compounded per jump — the spec reads "each chain
 * damage * 0.8".
 */
export function hitDamage(stats: Readonly<LightningStats>, chained: boolean): number {
  return stats.damage * (chained ? stats.chainFalloff : 1);
}

/**
 * The path one bolt takes from `first`: up to `chains` jumps, each to the
 * nearest enemy within `chainRange` (inclusive) of the enemy just struck that
 * neither this bolt nor `alreadyHit` has touched. The arc stops early when
 * nothing unhit is in reach. `first` heads the list.
 */
export function chainPath<T extends Vec2>(
  first: T,
  enemies: readonly T[],
  chains: number,
  chainRange: number,
  alreadyHit: ReadonlySet<T> = new Set(),
): T[] {
  const path = [first];
  const hit = new Set<T>(alreadyHit);
  hit.add(first);
  let from: T = first;
  for (let jump = 0; jump < Math.floor(chains); jump += 1) {
    const candidates = enemies.filter((enemy) => !hit.has(enemy));
    const [next] = nearestEnemies(from, candidates, 1, chainRange);
    if (!next) break;
    path.push(next);
    hit.add(next);
    from = next;
  }
  return path;
}

/**
 * One cast from `origin`: `strikes` bolts, resolved in order. Each bolt starts
 * at the nearest enemy nothing in this cast has struck yet (the stat block's
 * "its own target where possible") and chains among the enemies still unhit,
 * so a Forked cast spreads across a crowd instead of arcing the same path
 * twice. Once every enemy has been struck, a further bolt lands on the nearest
 * enemy again with nothing left to chain to — extra strikes are never wasted
 * against a lone target. With no enemy at all there are no bolts.
 *
 * The first target has no range: the spec gives Lightning none, so a bolt
 * always finds the nearest enemy in the arena.
 */
export function resolveCast<T extends Vec2>(
  origin: Readonly<Vec2>,
  enemies: readonly T[],
  stats: Readonly<LightningStats>,
): Bolt<T>[] {
  const bolts: Bolt<T>[] = [];
  const hit = new Set<T>();
  for (let strike = 0; strike < Math.floor(stats.strikes); strike += 1) {
    const unhit = enemies.filter((enemy) => !hit.has(enemy));
    // Everything already struck: this bolt lands on the nearest enemy again, and
    // `chainPath` finds nothing left to jump to, so it is a single hit.
    const [first] = nearestEnemies(origin, unhit.length > 0 ? unhit : enemies, 1);
    if (!first) break;
    const path = chainPath(first, enemies, stats.chains, stats.chainRange, hit);
    for (const target of path) hit.add(target);
    bolts.push(path.map((target, i) => ({ target, damage: hitDamage(stats, i > 0) })));
  }
  return bolts;
}

/**
 * A stun is a full stop (spec §5 "Stun 0.3 s"). A fresh hit brings the
 * remaining stop up to `stunS` and never shortens it, so stuns refresh rather
 * than stack. `stunS` 0 is the unperked spell: nothing happens.
 */
export function applyStun(remainingS: number, stunS: number): number {
  if (!(stunS > 0)) return remainingS;
  return Math.max(remainingS, stunS);
}

/** Multiply the chase speed by this: 0 while stunned, 1 otherwise. */
export function stunSpeedFactor(remainingS: number): number {
  return remainingS > 0 ? 0 : 1;
}

/**
 * Advance the stun by one frame. `ended` is true on the frame the enemy comes
 * back to full speed, so the caller can clear whatever marks a stunned enemy.
 */
export function tickStun(
  remainingS: number,
  deltaS: number,
): { remainingS: number; ended: boolean } {
  if (!(deltaS > 0)) return { remainingS, ended: false };
  const next = Math.max(0, remainingS - deltaS);
  return { remainingS: next, ended: remainingS > 0 && next === 0 };
}
