import { CATACLYSM, DRAGON_PIERCE, EMBER, FIRE_WAVE_ART_ARC_DEG } from '../config/fireLevels';
import type { SpellLevel } from '../config/spellLevels';
import type { Vec2 } from './input';

/**
 * The Fire spells' level 3 rules that do not need an engine (#327): which cast
 * or attack a level empowers, and the geometry of what it adds. The level a
 * spell holds reaches it through `Spell.level`; each spell asks these with that
 * level at the cast or launch, so a pick taken mid-flight changes the next cast
 * and never one already in the air (spec §6.2).
 *
 * None of these draws from the RNG, so a level-1 run replays its seed unchanged.
 *
 * Pure TS, no Phaser import; the numbers live in `config/fireLevels.ts`.
 */

/** Whether a Fire Bolt blast throws embers. */
export function hasEmberSplit(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * Where each of `count` embers goes from a blast at `centre`: evenly spaced round
 * the circle, the first along the bolt's own `heading`, each `range` px out.
 */
export function emberLaunches(
  centre: Readonly<Vec2>,
  heading: number,
  count: number,
  range: number,
): { to: Vec2; heading: number }[] {
  const out: { to: Vec2; heading: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = heading + (i * Math.PI * 2) / count;
    out.push({
      to: { x: centre.x + Math.cos(angle) * range, y: centre.y + Math.sin(angle) * range },
      heading: angle,
    });
  }
  return out;
}

/** What one ember deals: a fraction of the bolt that threw it. */
export function emberDamage(boltDamage: number, factor: number = EMBER.damageFactor): number {
  return boltDamage * factor;
}

/**
 * Whether a Meteor cast is the giant one: every `every`th cast that committed,
 * from level 3. `castNumber` is 1-based.
 */
export function isCataclysmCast(
  castNumber: number,
  level: SpellLevel,
  every: number = CATACLYSM.every,
): boolean {
  return level >= 3 && castNumber >= 1 && castNumber % every === 0;
}

/** A strike's size, in px, and the pond it leaves. */
export interface StrikeShape {
  radius: number;
  blast: number;
  pondRadius: number;
  pondDuration: number;
  pondTickDamage: number;
  pondTickRate: number;
}

/**
 * The giant strike: blast radius and blast damage doubled, the pond wider, its
 * duration and tick untouched (`rule` says by how much).
 */
export function giantStrike(
  normal: Readonly<StrikeShape>,
  rule: typeof CATACLYSM = CATACLYSM,
): StrikeShape {
  return {
    ...normal,
    radius: normal.radius * rule.radiusMul,
    blast: normal.blast * rule.damageMul,
    pondRadius: normal.pondRadius * rule.pondRadiusMul,
  };
}

/**
 * Where each drawn front of an `arcDeg` wide wave points. The art is cut for
 * `artArcDeg`, so a wider arc is drawn with several copies, centred so the outer
 * edges meet the arc: 150 degrees is two fronts at the heading plus and minus
 * 27.5 degrees. One front, on the heading, when the art already covers the arc.
 */
export function waveFrontAngles(
  heading: number,
  arcDeg: number,
  artArcDeg = FIRE_WAVE_ART_ARC_DEG,
): number[] {
  const n = Math.max(1, Math.ceil(arcDeg / artArcDeg));
  if (n === 1) return [heading];
  const step = ((arcDeg - artArcDeg) / (n - 1)) * (Math.PI / 180);
  return Array.from({ length: n }, (_, i) => heading + (i - (n - 1) / 2) * step);
}

/** Whether attack number `attackNumber` (1-based) is the empowered one: every `every`th, from level 3. */
export function isEmpoweredAttack(attackNumber: number, level: SpellLevel, every: number): boolean {
  return level >= 3 && attackNumber >= 1 && attackNumber % every === 0;
}

/** How many different enemies a dragon launched at `level` strikes before it is spent. */
export function dragonHitsPerFlight(level: SpellLevel, rule = DRAGON_PIERCE): number {
  return level >= 3 ? rule.hitsPerFlight : 1;
}

/**
 * One overlap between a dragon and `enemy`: it strikes unless it already struck
 * that enemy (it flies on, unspent), and is spent when that strike is its last.
 * `strikes` is how many it has made so far: the set may have dropped enemies
 * that left the crowd (pooled, so one can return), so its size is not the count.
 * An allowance below one, or not a number, counts as one.
 */
export function dragonStrike<T>(
  struck: ReadonlySet<T>,
  strikes: number,
  enemy: T,
  hitsPerFlight: number,
): { strikes: boolean; spent: boolean } {
  const strikesNow = !struck.has(enemy);
  const allowed = Number.isFinite(hitsPerFlight) ? Math.max(1, Math.floor(hitsPerFlight)) : 1;
  return { strikes: strikesNow, spent: strikesNow && strikes + 1 >= allowed };
}

/** Entries a level report keeps, so a long run's test hook stays small. */
export const LEVEL_REPORT_CAP = 16;

/** Append `entry` to `log`, dropping the oldest past `LEVEL_REPORT_CAP`. */
export function recordCapped<T>(log: T[], entry: T): void {
  log.push(entry);
  if (log.length > LEVEL_REPORT_CAP) log.shift();
}
