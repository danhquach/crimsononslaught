import {
  DEEP_FREEZE,
  FROST_ORB,
  ICE_SHIELD_WAVE,
  ICE_WAVE_ART,
  SHATTER,
  ICE_ARROW_FAN,
} from '../config/iceLevels';
import type { SpellLevel } from '../config/spellLevels';
import type { FrostHit } from './frostNova';

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

/** Whether a Frost Nova Bomb launched at `level` ends its roll in a full-circle cold wave. */
export function hasNovaWave(level: SpellLevel): boolean {
  return level >= 3;
}

/** The wave fades out over the last fifth of its reach. */
const WAVE_FADE_FROM = 0.8;

/**
 * Which `ice.wave` frame (0-based) a ring at radius `r` of its `range` wears:
 * frame 0, the core burst, as it starts, then one per quarter of the reach, so
 * the last (the widest ring) shows near the end. Driven by the wave's own
 * progress, not a free-running clock, so it pauses and scales with the run.
 */
export function iceWaveFrame(r: number, range: number): number {
  const last = ICE_WAVE_ART.outerRadius.length - 1;
  if (!(range > 0)) return last;
  const progress = Math.min(1, Math.max(0, r / range));
  return Math.min(last, Math.floor(progress * (last + 1)));
}

/** The sprite scale that puts frame `frame`'s drawn outer edge on radius `r`. */
export function iceWaveScale(r: number, frame: number): number {
  const outer = ICE_WAVE_ART.outerRadius[frame] ?? ICE_WAVE_ART.outerRadius[0];
  return Math.max(0, r) / outer;
}

/** 1 until the wave has covered 80% of its reach, then linearly to 0 at the end. */
export function iceWaveFade(r: number, range: number): number {
  if (!(range > 0)) return 0;
  return Math.min(1, Math.max(0, (range - r) / (range * (1 - WAVE_FADE_FROM))));
}

/** Whether an Ice Shield held at `level` ends in a small cold wave from each diamond. */
export function hasDiamondWave(level: SpellLevel): boolean {
  return level >= 3;
}

/** What one diamond's wave deals to each enemy it sweeps over: a multiple of the diamond's own damage. */
export function diamondWaveDamage(
  diamondDamage: number,
  factor: number = ICE_SHIELD_WAVE.damageFactor,
): number {
  return diamondDamage * factor;
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
