import {
  COMPANION_SWEEP,
  FORK,
  STORM_CELL,
  SWORD_ARC,
  SWORD_HIT_WINDOW_S,
  THUNDERBOLT,
  THUNDERCLAP,
  TORNADO_SPLIT,
} from '../config/lightningLevels';
import type { RosterSpellId } from '../config/loadout';
import type { SpellStatField } from '../config/spellFields';
import {
  SPELL_LEVEL_STATS,
  type SpellLevel,
  type SpellLevelStatTable,
} from '../config/spellLevels';
import { chainPath } from './chainLightning';
import { spawnsDue } from './iceStorm';
import type { Vec2 } from './input';
import { strikeTargets } from './skyStrike';
import { nearestEnemies } from './spell';
import { levelStatAdds } from './spellLevelStats';

/**
 * The Lightning spells' level 2 and 3 rules that do not need an engine (#329):
 * which cast a level changes, the geometry of what it adds, and what each new
 * hit leaves. The level a spell holds reaches it through `Spell.level`; each
 * spell asks these with that level at the cast or launch, so a pick taken
 * mid-flight changes the next cast and never one already in the air.
 *
 * Bolt and Chain roll `rollStun` once per enemy struck, so a level that adds
 * hits would shift the run's RNG. A hit the level-1 cast would have made keeps
 * the run's stream; a hit the level added rolls on a stream of its own
 * (`levelOneCount`, `rollsOnLevelStream`), so a level-1 run replays its seed
 * unchanged. Every other rule here is deterministic and draws nothing.
 *
 * Pure TS, no Phaser import; the numbers live in `config/lightningLevels.ts`.
 * The report log (`recordCapped`, `LEVEL_REPORT_CAP`) is `core/fireLevels.ts`'s.
 */

const DEG = Math.PI / 180;

/**
 * How many strikes (or chain jumps) a spell at `level` would make with no stat
 * add from its levels: `total`, the count it makes now, less what levels 2 to
 * `level` added to `field`. At level 1 nothing was added, so it is `total`.
 */
export function levelOneCount(
  total: number,
  id: RosterSpellId,
  level: SpellLevel,
  field: SpellStatField,
  table: SpellLevelStatTable = SPELL_LEVEL_STATS,
): number {
  const added = levelStatAdds(table, id, level)[field] ?? 0;
  return Math.max(0, Math.floor(total) - added);
}

/**
 * Whether the stun roll of hit number `index` (0-based, in the order the cast
 * resolves them) is drawn from a level's own stream rather than the run's:
 * true for every hit past the `levelOneHits` a level-1 cast would have made.
 */
export function rollsOnLevelStream(index: number, levelOneHits: number): boolean {
  return index >= levelOneHits;
}

/** Whether a Lightning Bolt launched at `level` can drop a Thunderbolt. */
export function hasThunderbolt(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * Whether Lightning Bolt cast number `castNumber` (1-based, counting the casts
 * that launched a bolt) is the Thunderbolt one: every `every`th, from level 3.
 */
export function isThunderboltCast(
  castNumber: number,
  level: SpellLevel,
  every: number = THUNDERBOLT.every,
): boolean {
  return hasThunderbolt(level) && castNumber >= 1 && castNumber % every === 0;
}

/**
 * Everything a Thunderbolt at `target` catches: every enemy within `radius` of
 * it, its own distance counting as inside. The target is always caught, even
 * if it has already left `enemies`, and comes first.
 */
export function thunderboltTargets<T extends Vec2>(
  target: T,
  enemies: readonly T[],
  radius: number = THUNDERBOLT.radius,
): T[] {
  const caught = strikeTargets(target, enemies, radius).filter((enemy) => enemy !== target);
  return [target, ...caught];
}

/** What a Thunderbolt deals to each enemy it catches: a multiple of the bolt that called it. */
export function thunderboltDamage(
  boltDamage: number,
  factor: number = THUNDERBOLT.damageFactor,
): number {
  return boltDamage * factor;
}

/** Whether a Chain Lightning bolt cast at `level` forks at its first hit. */
export function hasFork(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * The two branches of one bolt from `first`. Below level 3 there is one, the
 * plain `chainPath` (`b` is empty). From level 3 the bolt splits at `first`:
 * `a` (which starts with `first`) jumps to the nearest enemy unhit, `b` to the
 * second nearest, and the branches then grow one jump at a time, A, B, A, B,
 * each to the nearest unhit enemy within `chainRange` of its own tip, up to
 * `chains` jumps each and `maxHits` enemies in all, `first` included. No enemy
 * is on a branch twice, and none of `alreadyHit`. With a single neighbour
 * there is one branch; a branch whose tip has nothing in reach stops, and the
 * other goes on. `b` lists its jumps only: `first` is `a[0]`.
 */
export function forkPaths<T extends Vec2>(
  level: SpellLevel,
  first: T,
  enemies: readonly T[],
  chains: number,
  chainRange: number,
  alreadyHit: ReadonlySet<T> = new Set(),
  maxHits: number = FORK.maxHits,
): { a: T[]; b: T[] } {
  if (!hasFork(level))
    return { a: chainPath(first, enemies, chains, chainRange, alreadyHit), b: [] };
  const a: T[] = [first];
  const b: T[] = [];
  const hit = new Set<T>(alreadyHit);
  hit.add(first);
  const tips: [T, T] = [first, first];
  const done = [false, false];
  const jumps = Math.floor(chains);
  const branches = [a, b] as const;
  let turn = 0;
  while (a.length + b.length < Math.floor(maxHits) && !(done[0] && done[1])) {
    const side = turn % 2;
    turn += 1;
    const branch = branches[side] as T[];
    if (done[side]) continue;
    const jumped = side === 0 ? a.length - 1 : b.length;
    const [next] =
      jumped >= jumps
        ? []
        : nearestEnemies(
            tips[side] as T,
            enemies.filter((enemy) => !hit.has(enemy)),
            1,
            chainRange,
          );
    if (!next) {
      done[side] = true;
      continue;
    }
    branch.push(next);
    hit.add(next);
    tips[side] = next;
  }
  return { a, b };
}

/** How many funnels a Tornado cast at `level` sends. */
export function tornadoesPerCast(level: SpellLevel): number {
  return level >= 2 ? TORNADO_SPLIT.count : 1;
}

/**
 * The unit headings of a cast's `count` funnels from `caster`: one at each of
 * the nearest distinct enemies within `range`, nearest first. When fewer
 * enemies than funnels are in range, the ones left over fan off the first
 * heading by `fallbackSpreadDeg`, alternately + and -. Nothing in range is no
 * heading at all: the cast is spent on nothing, as level 1's is. An enemy
 * standing on the caster has no direction and is skipped.
 */
export function tornadoHeadings<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  count: number,
  range: number,
  fallbackSpreadDeg: number = TORNADO_SPLIT.fallbackSpreadDeg,
): Vec2[] {
  const wanted = Math.max(0, Math.floor(count));
  const apart = enemies.filter((enemy) => enemy.x !== caster.x || enemy.y !== caster.y);
  // The same division `tornadoHeading` makes, so a single funnel heads exactly where level 1's does.
  const headings = nearestEnemies(caster, apart, wanted, range).map((enemy) => {
    const dx = enemy.x - caster.x;
    const dy = enemy.y - caster.y;
    const distance = Math.hypot(dx, dy);
    return { x: dx / distance, y: dy / distance };
  });
  const [first] = headings;
  if (first === undefined) return [];
  for (let extra = 1; headings.length < wanted; extra += 1) {
    const side = extra % 2 === 1 ? 1 : -1;
    const turn = side * Math.ceil(extra / 2) * fallbackSpreadDeg * DEG;
    headings.push({
      x: first.x * Math.cos(turn) - first.y * Math.sin(turn),
      y: first.x * Math.sin(turn) + first.y * Math.cos(turn),
    });
  }
  return headings;
}

/** Whether a Tornado cast at `level` carries a Storm cell. */
export function hasStormCell(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * How many storm bolts fall due in the step from `elapsedS` to `elapsedS +
 * deltaS` of a funnel's life, one every `everyS`: every whole one the step
 * crossed. Summed over a funnel's life it is `floor(life / everyS)` however the
 * frames fall, and a paused step pays none.
 */
export function stormBoltsDue(
  elapsedS: number,
  deltaS: number,
  everyS: number = STORM_CELL.everyS,
): number {
  return everyS > 0 ? spawnsDue(elapsedS, deltaS, 1 / everyS) : 0;
}

/**
 * The enemy a storm bolt is thrown at: the nearest within `range` of the
 * funnel's `centre` that is outside its eye (the pull parks enemies there, so
 * they would be hit every bolt), else the nearest inside it. `undefined` with
 * nothing in range.
 */
export function stormCellTarget<T extends Vec2>(
  centre: Readonly<Vec2>,
  eyeRadius: number,
  enemies: readonly T[],
  range: number = STORM_CELL.range,
): T | undefined {
  const near = nearestEnemies(centre, enemies, enemies.length, range);
  const eyeSq = eyeRadius * eyeRadius;
  const outside = near.find((enemy) => {
    const dx = enemy.x - centre.x;
    const dy = enemy.y - centre.y;
    return dx * dx + dy * dy > eyeSq;
  });
  return outside ?? near[0];
}

/** What a storm bolt deals: a multiple of the funnel's tick damage. */
export function stormBoltDamage(
  tickDamage: number,
  factor: number = STORM_CELL.damageFactor,
): number {
  return tickDamage * factor;
}

/** Whether `id` at `level` attacks at the Lightning Companion's doubled pace. */
function hasDoubledPace(id: string, level: SpellLevel): boolean {
  return id === 'lightning_companion' && level >= 2;
}

/**
 * Seconds between a companion's attacks: `base`, halved for the Lightning
 * Companion from level 2. Every other companion, and level 1, is `base`.
 */
export function companionAttackCooldown(
  id: string,
  base: number,
  level: SpellLevel,
  factor: number = COMPANION_SWEEP.cooldownFactor,
): number {
  return hasDoubledPace(id, level) ? base * factor : base;
}

/** Whether a Lightning Companion at `level` arcs across the front of a landed swing. */
export function hasCompanionSweep(level: SpellLevel): boolean {
  return level >= 2;
}

/**
 * The enemies a landed swing's front arc catches: within `halfArcDeg` either
 * side of `aimRad` (inclusive) and within `reachPx` of `pos` to the enemy's own
 * edge, nearest first (input order on a tie), never one of `exclude` (the enemy
 * the swing landed on), at most `max`. An enemy on top of `pos` has no bearing
 * and counts as in the arc.
 */
export function sweepTargets<T extends Vec2 & { bodyRadius?: number }>(
  pos: Readonly<Vec2>,
  aimRad: number,
  enemies: readonly T[],
  reachPx: number = COMPANION_SWEEP.reachPx,
  halfArcDeg: number = COMPANION_SWEEP.halfArcDeg,
  exclude: ReadonlySet<T> | readonly T[] = [],
  max: number = COMPANION_SWEEP.maxTargets,
): T[] {
  const skip = new Set<T>(exclude);
  const halfArc = halfArcDeg * DEG;
  const caught = enemies.filter((enemy) => {
    if (skip.has(enemy)) return false;
    const dx = enemy.x - pos.x;
    const dy = enemy.y - pos.y;
    const distance = Math.hypot(dx, dy);
    if (distance - (enemy.bodyRadius ?? 0) > reachPx) return false;
    if (distance === 0) return true;
    // The smallest turn between the bearing and the aim, wrapped into [0, PI].
    const gap = Math.atan2(dy, dx) - aimRad;
    return Math.abs(Math.atan2(Math.sin(gap), Math.cos(gap))) <= halfArc + 1e-9;
  });
  return nearestEnemies(pos, caught, max);
}

/**
 * The two ends of the strip that draws a swing's front arc: the points at
 * `reachPx` on each edge of the cone, so the strip spans the arc's chord.
 */
export function sweepChord(
  pos: Readonly<Vec2>,
  aimRad: number,
  reachPx: number = COMPANION_SWEEP.reachPx,
  halfArcDeg: number = COMPANION_SWEEP.halfArcDeg,
): { from: Vec2; to: Vec2 } {
  const edge = (angle: number): Vec2 => ({
    x: pos.x + Math.cos(angle) * reachPx,
    y: pos.y + Math.sin(angle) * reachPx,
  });
  return { from: edge(aimRad - halfArcDeg * DEG), to: edge(aimRad + halfArcDeg * DEG) };
}

/** Whether a Lightning Companion at `level` chains a Thunderclap from each landed swing. */
export function hasThunderclap(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * The enemies a Thunderclap reaches from the swing's `target`: up to `jumps`
 * links, each to the nearest enemy within `range` of the last that neither the
 * chain nor `alreadyHit` (the target and the swept) has touched. The target is
 * not in the list.
 */
export function thunderclapPath<T extends Vec2>(
  target: T,
  enemies: readonly T[],
  alreadyHit: ReadonlySet<T> = new Set(),
  jumps: number = THUNDERCLAP.jumps,
  range: number = THUNDERCLAP.range,
): T[] {
  return chainPath(target, enemies, jumps, range, alreadyHit).slice(1);
}

/**
 * The per-enemy window between two cuts of a sword at `level`: the shorter of
 * its own `base` and the level's, so the extra blades' cuts are not swallowed.
 * Level 1 is `base`.
 */
export function swordHitCooldown(
  base: number,
  level: SpellLevel,
  windows: Readonly<Record<number, number>> = SWORD_HIT_WINDOW_S,
): number {
  const window = level >= 2 ? windows[level] : undefined;
  return window === undefined ? base : Math.min(base, window);
}

/** Whether a Lightning Sword at `level` arcs from each cut. */
export function hasSwordArc(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * Who a blade's arc reaches after it cut `cutEnemy`: up to `jumps` enemies, the
 * first the nearest to the blade within `range`, each next the nearest to the
 * one before within `range`; never the cut enemy or one of `exclude`. Empty
 * with nothing in reach.
 */
export function swordArcPath<T extends Vec2>(
  bladePos: Readonly<Vec2>,
  cutEnemy: T,
  enemies: readonly T[],
  range: number = SWORD_ARC.range,
  jumps: number = SWORD_ARC.jumps,
  exclude: ReadonlySet<T> | readonly T[] = [],
): T[] {
  const hit = new Set<T>(exclude);
  hit.add(cutEnemy);
  const path: T[] = [];
  let from: Readonly<Vec2> = bladePos;
  for (let jump = 0; jump < Math.floor(jumps); jump += 1) {
    const [next] = nearestEnemies(
      from,
      enemies.filter((enemy) => !hit.has(enemy)),
      1,
      range,
    );
    if (!next) break;
    path.push(next);
    hit.add(next);
    from = next;
  }
  return path;
}

/** Whether a blade whose arc window has `remainingS` left may arc again. */
export function bladeArcReady(remainingS: number | undefined): boolean {
  return !(remainingS !== undefined && remainingS > 0);
}
