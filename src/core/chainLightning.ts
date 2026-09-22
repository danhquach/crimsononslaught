import type { Vec2 } from './input';
import type { Rng } from './rng';
import { nearestEnemies } from './spell';
import type { ChainLightningStats, LightningStats } from './spellStats';

/**
 * Lightning Bolt and Chain Lightning rules that do not need an engine (Phase 2
 * spec §9.4, #142): where each bolt starts, who it jumps to, what every hit pays
 * out, whether a hit stuns, and how the stun it leaves on an enemy runs out.
 *
 * The two spells are one rule: a bolt with no chain fields is Lightning Bolt
 * (`lightning`), and one with them is Chain Lightning (`lightning_chain`).
 * `spells/ChainLightningSpell.ts` is the Phaser side of both; everything
 * decidable without Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * The numbers a cast is resolved from: Lightning Bolt's block, or Chain
 * Lightning's with its jumps. A missing `chains` is no jump at all.
 */
export type BoltStats = Readonly<LightningStats & Partial<ChainLightningStats>>;

/** One enemy struck by a bolt and what it took. */
export interface BoltHit<T extends Vec2> {
  target: T;
  damage: number;
}

/** One bolt of a cast: its first target, then each chain jump, in the order the arc ran. */
export type Bolt<T extends Vec2> = BoltHit<T>[];

/**
 * Spec §9.4: the first target takes `damage`; every enemy the bolt chains to
 * takes `damage * chainFalloff` (80% at base, 100% with no falloff). The
 * falloff is flat per chained hit, not compounded per jump — the spec reads
 * "each chain damage * 0.8". A block with no falloff field chains at full damage.
 */
export function hitDamage(stats: BoltStats, chained: boolean): number {
  return stats.damage * (chained ? (stats.chainFalloff ?? 1) : 1);
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
 * at the nearest enemy within `targetRange` that nothing in this cast has
 * struck yet (the stat block's "its own target where possible") and chains
 * among the enemies still unhit, so a Forked cast spreads across a crowd
 * instead of arcing the same path twice. Once every enemy in range has been
 * struck, a further bolt lands on the nearest enemy again with nothing left to
 * chain to — extra strikes are never wasted against a lone target. With no
 * enemy in range there are no bolts, and the cast is spent on nothing.
 *
 * A Lightning Bolt block has no chain fields, so its bolts are single hits.
 */
export function resolveCast<T extends Vec2>(
  origin: Readonly<Vec2>,
  enemies: readonly T[],
  stats: BoltStats,
): Bolt<T>[] {
  const bolts: Bolt<T>[] = [];
  const hit = new Set<T>();
  const inRange = nearestEnemies(origin, enemies, enemies.length, stats.targetRange);
  for (let strike = 0; strike < Math.floor(stats.strikes); strike += 1) {
    const unhit = inRange.filter((enemy) => !hit.has(enemy));
    // Everything in range already struck: this bolt lands on the nearest enemy
    // again, and `chainPath` finds nothing left to jump to, so it is a single hit.
    const [first] = unhit.length > 0 ? unhit : inRange;
    if (!first) break;
    const path = chainPath(first, enemies, stats.chains ?? 0, stats.chainRange ?? 0, hit);
    for (const target of path) hit.add(target);
    bolts.push(path.map((target, i) => ({ target, damage: hitDamage(stats, i > 0) })));
  }
  return bolts;
}

/**
 * One enemy's stun roll (spec §9.4: "small stun chance"). A block with no
 * chance draws nothing, so a spell that cannot stun never shifts the seeded
 * sequence the rest of the run reads — the rule `rollFreeze` set.
 */
export function rollStun(rng: Rng, stunChance: number): boolean {
  if (!(stunChance > 0)) return false;
  return rng.next() < stunChance;
}

/**
 * A stun is a full stop (spec §9.4 `stunDuration`). A fresh hit brings the
 * remaining stop up to `stunS` and never shortens it, so stuns refresh rather
 * than stack. `stunS` 0 is no stun: nothing happens.
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
