import type { Vec2 } from './input';
import { nearestEnemies } from './spell';

/**
 * Fire Wave rules that do not need an engine (CO-143, #218; Phase 2 spec
 * §9.2): who a wave is aimed at, and which enemies its rim sweeps over.
 *
 * A wave is a pie slice with its tip at the caster: `arc` degrees wide,
 * centred on the heading to the nearest enemy in range and locked at the
 * cast. Its curved rim grows outward at `speed` until it reaches `range`, and
 * every enemy it sweeps over is hit once. Only the rim hits — an enemy that
 * walks into the slice behind it is safe.
 *
 * `spells/FireWaveSpell.ts` is the Phaser side; everything decidable without
 * Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Waves in flight the spell may ever hold. A wave lives about 0.7 s (its
 * 180 px `range` at 260 px/s) against a 2.2 s cooldown, so one is out at a
 * time; the cap leaves room for a Haste build. A cast past it is dropped.
 */
export const MAX_LIVE_WAVES = 4;

/**
 * The wave's target: the nearest enemy within `range` of the caster, or
 * `undefined` with none in range.
 */
export function waveTarget<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  range: number,
): T | undefined {
  return nearestEnemies(caster, enemies, 1, range)[0];
}

/** Heading from the caster to the target, in radians (Phaser's rotation). */
export function waveHeading(caster: Readonly<Vec2>, target: Readonly<Vec2>): number {
  return Math.atan2(target.y - caster.y, target.x - caster.x);
}

/**
 * Whether an enemy lies inside the slice, by its body: its centre is within
 * `halfArc` radians of `heading`, or its body reaches over either straight
 * edge (within `bodyRadius` of the edge ray, on the ray's outward side). So
 * an enemy half-inside the edge counts.
 */
export function inArc(
  caster: Readonly<Vec2>,
  heading: number,
  halfArc: number,
  enemy: Readonly<Vec2>,
  bodyRadius: number,
): boolean {
  const dx = enemy.x - caster.x;
  const dy = enemy.y - caster.y;
  if (Math.abs(angleBetween(Math.atan2(dy, dx), heading)) <= halfArc) return true;
  const r = Math.max(0, bodyRadius);
  for (const edge of [heading - halfArc, heading + halfArc]) {
    const ux = Math.cos(edge);
    const uy = Math.sin(edge);
    const along = dx * ux + dy * uy;
    // Distance to the ray, not the whole line: behind the caster it is the
    // distance to the tip itself.
    const off = along > 0 ? Math.abs(dx * uy - dy * ux) : Math.hypot(dx, dy);
    if (off <= r) return true;
  }
  return false;
}

/**
 * Whether the rim swept over an enemy this frame: its body, `dist ± bodyRadius`
 * from the caster, overlaps the band `[prevR, r]` the rim covered. The whole
 * band is tested, not a thin ring at `r`, so a long frame (`?timeScale=10`
 * moves the rim 40+ px) cannot step over an enemy.
 */
export function sweptThisFrame(
  prevR: number,
  r: number,
  dist: number,
  bodyRadius: number,
): boolean {
  const body = Math.max(0, bodyRadius);
  return dist - body <= r && dist + body >= prevR;
}

/** One wave in flight: where it started, where it points and how far its rim has got. */
export interface Wave<T> {
  /** The caster's position at the cast; the slice's tip. */
  readonly origin: Readonly<Vec2>;
  /** Radians, locked at the cast. */
  readonly heading: number;
  /** The rim's distance from `origin`, in px. */
  r: number;
  /** Everyone this wave has already hit; none is hit twice. */
  readonly hit: Set<T>;
}

export function newWave<T>(origin: Readonly<Vec2>, heading: number): Wave<T> {
  return { origin: { x: origin.x, y: origin.y }, heading, r: 0, hit: new Set() };
}

/**
 * Grow the rim by `grow` px, never past `range`, and return the enemies it
 * swept over this frame that it had not hit yet — each marked as hit, so a
 * wave lands at most once on anyone.
 */
export function advanceWave<T extends Vec2>(
  wave: Wave<T>,
  enemies: readonly T[],
  grow: number,
  range: number,
  halfArc: number,
  bodyRadiusOf: (enemy: T) => number,
): T[] {
  const prevR = wave.r;
  wave.r = Math.min(range, prevR + Math.max(0, grow));
  // Enemies are pooled: one that left the crowd (dead, dying) may come back
  // as a fresh spawn inside this wave's life, and must not be skipped then.
  if (wave.hit.size > 0) {
    const present = new Set(enemies);
    for (const enemy of wave.hit) if (!present.has(enemy)) wave.hit.delete(enemy);
  }
  const struck: T[] = [];
  for (const enemy of enemies) {
    if (wave.hit.has(enemy)) continue;
    const body = bodyRadiusOf(enemy);
    const dist = Math.hypot(enemy.x - wave.origin.x, enemy.y - wave.origin.y);
    if (!sweptThisFrame(prevR, wave.r, dist, body)) continue;
    if (!inArc(wave.origin, wave.heading, halfArc, enemy, body)) continue;
    wave.hit.add(enemy);
    struck.push(enemy);
  }
  return struck;
}

/** Whether the rim has reached `range` and the wave is done. */
export function waveDone(wave: Wave<unknown>, range: number): boolean {
  return wave.r >= range;
}

/** Signed difference `a − b`, wrapped into (−π, π]. */
function angleBetween(a: number, b: number): number {
  const TAU = Math.PI * 2;
  let d = (a - b) % TAU;
  if (d <= -Math.PI) d += TAU;
  else if (d > Math.PI) d -= TAU;
  return d;
}
