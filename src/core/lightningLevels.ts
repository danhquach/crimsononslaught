import {
  COMPANION_ARC,
  COMPANION_FRENZY,
  FORK,
  STORM_CELL,
  SWORD_ARC,
  THUNDERBOLT,
  THUNDERCLAP,
  TWIN_TORNADO,
} from '../config/lightningLevels';
import type { SpellLevel } from '../config/spellLevels';
import { chainPath, hitDamage, type BoltStats } from './chainLightning';
import type { Vec2 } from './input';
import { nearestEnemies } from './spell';

/**
 * The Lightning spells' level 2 and 3 rules that do not need an engine (#329):
 * which cast a level changes, the geometry of what it adds, and who each new
 * source strikes. The level a spell holds reaches it through `Spell.level`;
 * each spell asks these with that level at the cast or launch, so a pick taken
 * mid-flight changes the next cast and never one already out.
 *
 * Nothing here draws from an RNG. Every target is the nearest one by the
 * `nearestEnemies` rule (ties keep the caller's order), so a seed reproduces
 * every strike. The stun rolls a levelled bolt still makes are the spell's, on
 * the stream `stunStream` names, so a level never shifts the run's own draws.
 *
 * Pure TS, no Phaser import; the numbers live in `config/lightningLevels.ts`.
 * The report log (`recordCapped`) is `core/fireLevels.ts`'s.
 */

const DEG = Math.PI / 180;

/**
 * Which stream a Lightning Bolt or Chain Lightning at `level` rolls its stuns
 * on: the run's own at level 1, exactly as before levels existed, and the
 * levels' own from level 2. The extra strikes and chains a level adds so never
 * move the draws the run's spawns and offers read.
 */
export function stunStream<R>(level: SpellLevel, run: R, levelled: R): R {
  return level >= 2 ? levelled : run;
}

/** Whether Lightning Bolt cast number `castNumber` (1-based, casts that sent a bolt) calls a Thunderbolt. */
export function isThunderboltCast(
  castNumber: number,
  level: SpellLevel,
  every: number = THUNDERBOLT.every,
): boolean {
  return level >= 3 && castNumber >= 1 && castNumber % every === 0;
}

/** Everything a sky strike at `centre` reaches: every enemy whose body is within `radius`, inclusive. */
export function skyStrikeTargets<T extends Vec2 & { readonly bodyRadius: number }>(
  centre: Readonly<Vec2>,
  enemies: readonly T[],
  radius: number = THUNDERBOLT.radius,
): T[] {
  return enemies.filter(
    (enemy) => Math.hypot(enemy.x - centre.x, enemy.y - centre.y) <= radius + enemy.bodyRadius,
  );
}

/** What a sky strike deals: a multiple of the bolt that called it. */
export function thunderboltDamage(
  boltDamage: number,
  factor: number = THUNDERBOLT.damageFactor,
): number {
  return boltDamage * factor;
}

/** Whether a Chain Lightning cast at `level` forks at its first target. */
export function hasFork(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * The two branches of a forked bolt from `first`: they take turns, each jumping
 * from its own last enemy to the nearest one within `chainRange` that nothing
 * has struck, up to `chains` jumps a branch, and stop once the bolt has struck
 * `maxHits` enemies, `first` included. The first branch jumps first, so with
 * one enemy in reach it is the first branch's. Neither list includes `first`.
 */
export function forkPaths<T extends Vec2>(
  first: T,
  enemies: readonly T[],
  chains: number,
  chainRange: number,
  alreadyHit: ReadonlySet<T> = new Set(),
  maxHits: number = FORK.maxHits,
): [T[], T[]] {
  const branches: [T[], T[]] = [[], []];
  const hit = new Set<T>(alreadyHit);
  hit.add(first);
  const tips: [T, T] = [first, first];
  const cap = Number.isFinite(maxHits) ? Math.max(1, Math.floor(maxHits)) : 1;
  let struck = 1;
  for (let jump = 0; jump < Math.floor(chains); jump += 1) {
    for (const b of [0, 1] as const) {
      if (struck >= cap) return branches;
      const candidates = enemies.filter((enemy) => !hit.has(enemy));
      const [next] = nearestEnemies(tips[b], candidates, 1, chainRange);
      if (!next) continue;
      branches[b].push(next);
      hit.add(next);
      tips[b] = next;
      struck += 1;
    }
  }
  return branches;
}

/** One enemy a forked bolt struck: what it took, where the strike came from (`null` is the caster) and its branch. */
export interface ForkHit<T extends Vec2> {
  target: T;
  damage: number;
  from: T | null;
  /** `null` for the first target, which both branches leave from. */
  branch: 0 | 1 | null;
}

/**
 * One level 3 cast, `resolveCast`'s rule with the chain forked: `strikes`
 * bolts, each at the nearest enemy in `targetRange` nothing in this cast has
 * struck (the nearest again once all have been), each forking there by
 * `forkPaths` among the enemies still unhit. The first target takes `damage`
 * and every branch hit `damage * chainFalloff`, as a chained hit always has.
 */
export function forkCast<T extends Vec2>(
  origin: Readonly<Vec2>,
  enemies: readonly T[],
  stats: BoltStats,
  maxHits: number = FORK.maxHits,
): ForkHit<T>[][] {
  const bolts: ForkHit<T>[][] = [];
  const hit = new Set<T>();
  const inRange = nearestEnemies(origin, enemies, enemies.length, stats.targetRange);
  for (let strike = 0; strike < Math.floor(stats.strikes); strike += 1) {
    const unhit = inRange.filter((enemy) => !hit.has(enemy));
    const [first] = unhit.length > 0 ? unhit : inRange;
    if (!first) break;
    const branches = forkPaths(
      first,
      enemies,
      stats.chains ?? 0,
      stats.chainRange ?? 0,
      hit,
      maxHits,
    );
    const bolt: ForkHit<T>[] = [
      { target: first, damage: hitDamage(stats, false), from: null, branch: null },
    ];
    hit.add(first);
    for (const b of [0, 1] as const) {
      let from = first;
      for (const target of branches[b]) {
        bolt.push({ target, damage: hitDamage(stats, true), from, branch: b });
        hit.add(target);
        from = target;
      }
    }
    bolts.push(bolt);
  }
  return bolts;
}

/** How many tornadoes a cast at `level` sends. */
export function tornadoesPerCast(level: SpellLevel): number {
  return level >= 2 ? TWIN_TORNADO.count : 1;
}

/**
 * The headings `count` tornadoes leave on: `heading` itself for one, else a fan
 * symmetric about it, `spreadDeg` from the first to the last. Unit vectors.
 */
export function twinHeadings(
  heading: Readonly<Vec2>,
  count: number,
  spreadDeg: number = TWIN_TORNADO.spreadDeg,
): Vec2[] {
  const n = Math.max(0, Math.floor(count));
  if (n <= 1) return n === 1 ? [{ x: heading.x, y: heading.y }] : [];
  const aim = Math.atan2(heading.y, heading.x);
  return Array.from({ length: n }, (_, i) => {
    const angle = aim + (i / (n - 1) - 0.5) * spreadDeg * DEG;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
}

/** Whether a tornado sent at `level` is a storm cell. */
export function hasStormCell(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * How many storm cell bolts fall due as a funnel's life runs from `prevS` to
 * `nowS`: the whole `everyS` marks the clock crossed. Summed over a funnel's
 * frames it is `floor(life / everyS)`, however the frames split it.
 */
export function stormBoltsDue(
  prevS: number,
  nowS: number,
  everyS: number = STORM_CELL.everyS,
): number {
  if (!(everyS > 0) || !(nowS > prevS) || !Number.isFinite(nowS) || !Number.isFinite(prevS)) {
    return 0;
  }
  const marks = (s: number): number => Math.floor(Math.max(0, s) / everyS + 1e-9);
  return marks(nowS) - marks(prevS);
}

/**
 * Who a storm cell's bolt goes for: the nearest enemy within `range` of the
 * funnel's `centre` that stands outside its eye (`eyeRadius`), else the nearest
 * one inside. `undefined` with nothing in range.
 */
export function stormCellTarget<T extends Vec2>(
  centre: Readonly<Vec2>,
  enemies: readonly T[],
  eyeRadius: number,
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

/** What one storm cell bolt deals: a multiple of the tornado's tick. */
export function stormBoltDamage(
  tickDamage: number,
  factor: number = STORM_CELL.damageFactor,
): number {
  return tickDamage * factor;
}

/** The Lightning Companion's time between attacks at `level`: level 2 attacks twice as fast. */
export function frenzyCooldown(attackCooldown: number, level: SpellLevel): number {
  return level >= 2 ? attackCooldown * COMPANION_FRENZY.cooldownFactor : attackCooldown;
}

/** Whether a Lightning Companion swinging at `level` also strikes the arc in front of it. */
export function hasCompanionArc(level: SpellLevel): boolean {
  return level >= 2;
}

/**
 * The enemies in the arc in front of an ally at `from` swinging at `target`:
 * each other enemy whose edge is within `rule.radius` of the ally and whose
 * centre is within `rule.halfAngleDeg` of the line to the target, nearest
 * first, at most `rule.maxTargets`. A target on the ally's own spot has no
 * front, so nothing else is struck.
 */
export function arcTargets<T extends Vec2 & { readonly bodyRadius: number }>(
  from: Readonly<Vec2>,
  target: T,
  enemies: readonly T[],
  rule: typeof COMPANION_ARC = COMPANION_ARC,
): T[] {
  const aim = Math.atan2(target.y - from.y, target.x - from.x);
  if (target.x === from.x && target.y === from.y) return [];
  const half = rule.halfAngleDeg * DEG;
  const inArc = enemies.filter((enemy) => {
    if (enemy === target) return false;
    const dx = enemy.x - from.x;
    const dy = enemy.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance > rule.radius + enemy.bodyRadius) return false;
    if (distance === 0) return true;
    return Math.abs(angleBetween(Math.atan2(dy, dx), aim)) <= half;
  });
  return nearestEnemies(from, inArc, rule.maxTargets);
}

/** The signed difference `a - b`, wrapped into [-pi, pi]. */
function angleBetween(a: number, b: number): number {
  const TAU = Math.PI * 2;
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Whether a Lightning Companion swinging at `level` ends its charge in a Thunderclap. */
export function hasThunderclap(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * A Thunderclap's chain from the enemy the swing landed on: up to
 * `rule.chains` jumps, each to the nearest enemy within `rule.chainRange` of
 * the last that neither the chain nor `alreadyHit` (the swing's arc) has
 * struck. The struck enemy is not in the list.
 */
export function thunderclapPath<T extends Vec2>(
  target: T,
  enemies: readonly T[],
  rule: typeof THUNDERCLAP = THUNDERCLAP,
  alreadyHit: ReadonlySet<T> = new Set(),
): T[] {
  return chainPath(target, enemies, rule.chains, rule.chainRange, alreadyHit).slice(1);
}

/**
 * Thunderbolt's cast count (#329): casts that sent a bolt, counted from the
 * cast the spell first went out at level 3, so the first sky strike is exactly
 * the `every`th cast after the pick. Below level 3 the count stays at 0.
 */
export function nextThunderboltCount(count: number, level: SpellLevel): number {
  return level >= 3 ? count + 1 : 0;
}

/** Whether a Lightning Sword cut at `level` arcs a chain from its blade. */
export function hasSwordArc(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * A blade's arc after cutting `cut`: from the blade at `blade` to the nearest
 * other enemy whose body is within `rule.range` (to its edge, as the arc and
 * the sky strike measure), then on from that one the same way, up to
 * `rule.maxTargets` enemies. The cut enemy is never among them, nor any enemy
 * twice.
 */
export function swordArcPath<T extends Vec2 & { readonly bodyRadius: number }>(
  blade: Readonly<Vec2>,
  cut: T,
  enemies: readonly T[],
  rule: typeof SWORD_ARC = SWORD_ARC,
): T[] {
  const path: T[] = [];
  const struck = new Set<T>([cut]);
  let from: Readonly<Vec2> = blade;
  for (let i = 0; i < Math.floor(rule.maxTargets); i += 1) {
    const reach = enemies.filter(
      (enemy) =>
        !struck.has(enemy) &&
        Math.hypot(enemy.x - from.x, enemy.y - from.y) <= rule.range + enemy.bodyRadius,
    );
    const [next] = nearestEnemies(from, reach, 1);
    if (!next) break;
    path.push(next);
    struck.add(next);
    from = next;
  }
  return path;
}
