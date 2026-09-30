import {
  CLUSTER,
  DEEP_FREEZE,
  FROST_ORB,
  SHATTER,
  SHATTER_RING,
  ICE_ARROW_FAN,
} from '../config/iceLevels';
import type { SpellLevel } from '../config/spellLevels';
import type { FrostHit } from './frostNova';
import type { Vec2 } from './input';

/**
 * The Ice spells' level 2 and 3 rules that do not need an engine (#328): which
 * cast a level changes, the geometry of what it adds, and the frost each new
 * source leaves. The level a spell holds reaches it through `Spell.level`; each
 * spell asks these with that level at the cast or launch, so a pick taken
 * mid-flight changes the next cast and never one already in the air.
 *
 * Nothing here draws from the RNG except by being handed a stream (the hail's
 * pick is the spell's, from its own stream), so a level-1 run replays its seed
 * unchanged. Every freeze returned goes through `Enemy.applyFrost`, which is
 * what the boss's diminishing returns hook.
 *
 * Pure TS, no Phaser import; the numbers live in `config/iceLevels.ts`. The
 * report log (`recordCapped`, `LEVEL_REPORT_CAP`) is `core/fireLevels.ts`'s.
 */

const DEG = Math.PI / 180;

/**
 * `count` headings symmetric about `aimRad`, `spreadDeg` from the first to the
 * last: two arrows at the default fan sit 6 degrees either side of the aim.
 * One heading is the aim itself.
 */
export function fanHeadings(
  aimRad: number,
  count: number,
  spreadDeg: number = ICE_ARROW_FAN.spreadDeg,
): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n <= 1) return n === 1 ? [aimRad] : [];
  return Array.from({ length: n }, (_, i) => aimRad + (i / (n - 1) - 0.5) * spreadDeg * DEG);
}

/** Whether an Ice Arrow launched at `level` splits on a slowed enemy. */
export function hasShatter(level: SpellLevel): boolean {
  return level >= 3;
}

/** Where a Shatter's `count` shards go: a forward cone of `spreadDeg` about the arrow's own `heading`. */
export function shatterHeadings(
  heading: number,
  count: number = SHATTER.count,
  spreadDeg: number = SHATTER.spreadDeg,
): number[] {
  return fanHeadings(heading, count, spreadDeg);
}

/** What one shard deals: a fraction of the arrow that threw it. */
export function shardDamage(arrowDamage: number, factor: number = SHATTER.damageFactor): number {
  return arrowDamage * factor;
}

/** Whether a Frost Nova Bomb launched at `level` rolls out urchins when it bursts. */
export function hasCluster(level: SpellLevel): boolean {
  return level >= 3;
}

/** The angle the first urchin leaves at, past the bomb's aim, so they do not ride the icicle spiral's first ray. */
const CLUSTER_START_RAD = 60 * DEG;

/** Where `count` urchins go: evenly spaced round the circle, the first 60 degrees past `aimRad`. */
export function clusterHeadings(aimRad: number, count: number = CLUSTER.count): number[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => aimRad + CLUSTER_START_RAD + (i * Math.PI * 2) / n);
}

/** The bomb's own block, as far as an urchin's burst reads it. */
export interface ClusterSource {
  radius: number;
  damage: number;
  slowPct: number;
  slowDuration: number;
}

/**
 * One urchin's burst: half the bomb's radius and 40% of its damage, with its
 * slow. Slow only, no freeze roll, so a cluster draws nothing from the RNG.
 */
export function clusterBurst(
  stats: Readonly<ClusterSource>,
  rule: typeof CLUSTER = CLUSTER,
): ClusterSource {
  return {
    radius: stats.radius * rule.radiusFactor,
    damage: stats.damage * rule.damageFactor,
    slowPct: stats.slowPct,
    slowDuration: stats.slowDuration,
  };
}

/** Whether an Ice Shield held at `level` chills what touches it while it is up. */
export function hasFrostAura(level: SpellLevel): boolean {
  return level >= 2;
}

/** The aura reaches `radius` past the enemy's own body, so a big enemy is chilled as soon as it touches. */
export function inAura(
  centre: Readonly<Vec2>,
  enemy: Readonly<Vec2 & { bodyRadius: number }>,
  radius: number,
): boolean {
  return Math.hypot(enemy.x - centre.x, enemy.y - centre.y) <= radius + enemy.bodyRadius;
}

/** Where a break's `count` icicles go: evenly spaced round the circle, the first at angle 0. */
export function shatterRingHeadings(count: number = SHATTER_RING.icicles): number[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => (i * Math.PI * 2) / n);
}

/**
 * What a shield's break leaves on each enemy inside `breakRadius`: its slow,
 * plus from level 3 a freeze of `SHATTER_RING.freezeS`. Below level 3 this is
 * exactly the hit the break has always applied.
 */
export function shatterRingFrost(
  stats: Readonly<{ slowPct: number; slowDuration: number }>,
  level: SpellLevel,
): FrostHit {
  const hit: FrostHit = { slowPct: stats.slowPct, slowDuration: stats.slowDuration, freeze: false };
  if (level < 3) return hit;
  return { ...hit, freeze: true, freezeDuration: SHATTER_RING.freezeS };
}

/** What a frost orb leaves on the enemy it lands on: the companion's own slow and a fixed freeze. */
export function frostOrbHit(
  stats: Readonly<{ slowPct?: number; slowDuration?: number }>,
): FrostHit {
  return {
    slowPct: stats.slowPct ?? 0,
    slowDuration: stats.slowDuration ?? 0,
    freeze: true,
    freezeDuration: FROST_ORB.freezeS,
  };
}

/**
 * How many hailstones fall due on tick `tickNumber` (1-based) of a patch that
 * ticks every `tickEveryS` and drops one every `everyS`: the whole stones the
 * clock crossed between the previous tick and this one. Summed over a patch's
 * ticks it is `floor(duration / everyS)`, however the two intervals line up.
 */
export function hailsDue(tickNumber: number, tickEveryS: number, everyS: number): number {
  if (!(tickNumber >= 1) || !(tickEveryS > 0) || !(everyS > 0)) return 0;
  const stones = (n: number): number => Math.floor((n * tickEveryS) / everyS + 1e-9);
  return stones(tickNumber) - stones(tickNumber - 1);
}

/**
 * How many ticks a patch of `durationS` pays over its whole life: what
 * `advanceArea` pays out by the frame it expires, `floor(duration / interval)`.
 * 0 for an interval that pays nothing.
 */
export function stormTickCount(durationS: number, tickEveryS: number): number {
  if (!(tickEveryS > 0) || !Number.isFinite(tickEveryS) || !(durationS > 0)) return 0;
  return Math.floor(durationS / tickEveryS);
}

/** Whether tick `tickNumber` is the last one the patch pays, at a level with Deep freeze. */
export function isDeepFreezeTick(tickNumber: number, count: number, level: SpellLevel): boolean {
  return level >= 3 && count >= 1 && tickNumber === count;
}

/** The freeze a Deep freeze leaves, as a frost hit on top of the storm's own slow. */
export function deepFreezeHit(
  stats: Readonly<{ slowPct: number; slowDuration: number }>,
): FrostHit {
  return {
    slowPct: stats.slowPct,
    slowDuration: stats.slowDuration,
    freeze: true,
    freezeDuration: DEEP_FREEZE.freezeS,
  };
}
