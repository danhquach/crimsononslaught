import {
  AFTERSHOCK,
  EARTH_COMPANION_SWEEP,
  BOULDER_SPLIT,
  LANDSLIDE,
  QUAKE_SPLIT,
  RUT_VARIANTS,
  SEISMIC_SLAM,
  SPIKES_PER_CAST,
  SPLINTER,
  SPIKE_FAN,
  STONE_SHOCK,
} from '../config/earthLevels';
import type { SpellLevel } from '../config/spellLevels';
import { areaStaggerS, densestSpot, type AreaRule } from './groundArea';
import { fanHeadings } from './iceLevels';
import type { Vec2 } from './input';
import { rollsOnLevelStream, sweepTargets, tornadoHeadings } from './lightningLevels';
import { knockbackVector } from './orbitingBoulders';
import type { Rng } from './rng';

/**
 * The Earth spells' level 2 and 3 rules that do not need an engine (#330):
 * which cast a level changes, the geometry of what it adds, and what each new
 * hit leaves. The level a spell holds reaches it through `Spell.level`; each
 * spell asks these with that level at the cast or launch, so a pick taken
 * mid-flight changes the next cast and never one already in the air.
 *
 * Earth Spike rolls bleed once per strike, so a second spike would shift the
 * run's RNG. The first spike of a fan keeps the run's stream; every spike the
 * level added rolls on a stream of its own (`spikeRollsOnLevelStream`), so a
 * level-1 run replays its seed unchanged. The Earthquake's second patch picks
 * its centre on a stream of its own for the same reason (`quakeSpots`). Every
 * other rule here is deterministic and draws nothing, and none stuns.
 *
 * Pure TS, no Phaser import; the numbers live in `config/earthLevels.ts`. The
 * report log (`recordCapped`, `LEVEL_REPORT_CAP`) is `core/fireLevels.ts`'s.
 */

/** The angle that spreads successive points round a circle without ever lining up: the golden angle. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** A thing with a position and, optionally, a body the rules measure to the edge of. */
type Body = Vec2 & { bodyRadius?: number };

/** How many spikes an Earth Spike cast at `level` flings. */
export function spikesPerCast(level: SpellLevel): number {
  return SPIKES_PER_CAST[level];
}

/**
 * The headings (radians) of a cast's spikes, symmetric about `aimRad`,
 * `spreadDeg` from the first to the last. Level 1 is `[aimRad]` exactly, the
 * heading the plain cast takes.
 */
export function spikeHeadings(
  aimRad: number,
  level: SpellLevel,
  spreadDeg: number = SPIKE_FAN.spreadDeg,
): number[] {
  return fanHeadings(aimRad, spikesPerCast(level), spreadDeg);
}

/**
 * Whether the bleed roll of spike number `index` (0-based, in the order the
 * cast flings them) is drawn from the level's own stream rather than the run's:
 * true for every spike past the first, which is all a level-1 cast has.
 */
export function spikeRollsOnLevelStream(index: number): boolean {
  return rollsOnLevelStream(index, 1);
}

/** Whether an Earth Spike flung at `level` breaks on its first hit and splinters. */
export function hasSplinter(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * Everything a Splinter at `at` catches: every enemy but those in `exclude`
 * (the one the spike struck) whose body edge is within `radiusPx` of `at`, the
 * radius itself counting as in, the nearest edge first (input order on a tie).
 */
export function splinterTargets<T extends Body>(
  at: Readonly<Vec2>,
  enemies: readonly T[],
  exclude: ReadonlySet<T> | readonly T[] = [],
  radiusPx: number = SPLINTER.radiusPx,
): T[] {
  if (!(radiusPx >= 0)) return [];
  const skip = new Set<T>(exclude);
  const caught: { enemy: T; edge: number }[] = [];
  for (const enemy of enemies) {
    if (skip.has(enemy)) continue;
    const edge = Math.hypot(enemy.x - at.x, enemy.y - at.y) - (enemy.bodyRadius ?? 0);
    if (edge <= radiusPx) caught.push({ enemy, edge });
  }
  return caught.sort((a, b) => a.edge - b.edge).map((entry) => entry.enemy);
}

/** What a Splinter deals to each enemy it catches: a multiple of the spike that broke. */
export function splinterDamage(
  spikeDamage: number,
  factor: number = SPLINTER.damageFactor,
): number {
  return spikeDamage * factor;
}

/** The shove a Splinter gives `enemy`: `px` straight out from `at`, none for an enemy dead on it. */
export function splinterPush(
  at: Readonly<Vec2>,
  enemy: Readonly<Vec2>,
  px: number = SPLINTER.knockbackPx,
): Vec2 {
  return knockbackVector(at, enemy, px, at);
}

/** How many boulders a Boulder cast at `level` throws. */
export function bouldersPerCast(level: SpellLevel): number {
  return level >= 2 ? BOULDER_SPLIT.count : 1;
}

/**
 * The unit headings of a cast's `count` boulders from `caster`: one at each of
 * the nearest distinct enemies within `range`, nearest first, the leftovers
 * fanned `fallbackSpreadDeg` off the first (`tornadoHeadings`' rule). A single
 * boulder heads exactly where `rollTarget` sends level 1's; nothing in range is
 * no heading at all.
 */
export function boulderHeadings<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  count: number,
  range: number,
  fallbackSpreadDeg: number = BOULDER_SPLIT.fallbackSpreadDeg,
): Vec2[] {
  return tornadoHeadings(caster, enemies, count, range, fallbackSpreadDeg);
}

/** Whether a Boulder thrown at `level` leaves a Landslide rut. */
export function hasLandslide(level: SpellLevel): boolean {
  return level >= 3;
}

/**
 * How many rut tiles a boulder that has now rolled `travelledPx` still owes,
 * when it has laid `laid` (0 before the first): tile number `n` (0-based) lies
 * `n x spacingPx` along its path, the first at the throw point, so it owes
 * `floor(travelled / spacing) + 1` in all however the frames fall, and none
 * below level 3. A bad distance, or a spacing that is not positive, owes none.
 */
export function rutTilesDue(
  level: SpellLevel,
  travelledPx: number,
  laid: number,
  spacingPx: number = LANDSLIDE.spacingPx,
): number {
  if (!hasLandslide(level) || !(spacingPx > 0)) return 0;
  if (!Number.isFinite(travelledPx) || travelledPx < 0) return 0;
  return Math.max(0, Math.floor(travelledPx / spacingPx + 1e-9) + 1 - laid);
}

/** One tile of rut on the ground: its centre, the unit heading it lies along and what one tick on it costs. */
export interface RutTile {
  readonly x: number;
  readonly y: number;
  /** Unit heading of the boulder that laid it. */
  readonly dirX: number;
  readonly dirY: number;
  readonly tickDamage: number;
}

/** The distance from `(px, py)` to the segment from `(ax, ay)` to `(bx, by)`. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const sx = bx - ax;
  const sy = by - ay;
  const lengthSq = sx * sx + sy * sy;
  const along = lengthSq > 0 ? ((px - ax) * sx + (py - ay) * sy) / lengthSq : 0;
  const t = Math.max(0, Math.min(1, along));
  return Math.hypot(px - (ax + sx * t), py - (ay + sy * t));
}

/**
 * The tiles `enemy` stands on: those whose segment (the tile's centre, half
 * `tileLengthPx` either way along its heading) passes within `halfWidthPx` of
 * the enemy's centre plus its body radius, the edge itself counting as on.
 */
export function ruttedBy(
  enemy: Body,
  tiles: readonly RutTile[],
  halfWidthPx: number = LANDSLIDE.widthPx / 2,
  tileLengthPx: number = LANDSLIDE.tileLengthPx,
): RutTile[] {
  const reach = halfWidthPx + (enemy.bodyRadius ?? 0);
  const half = tileLengthPx / 2;
  return tiles.filter(
    (tile) =>
      distanceToSegment(
        enemy.x,
        enemy.y,
        tile.x - tile.dirX * half,
        tile.y - tile.dirY * half,
        tile.x + tile.dirX * half,
        tile.y + tile.dirY * half,
      ) <= reach,
  );
}

/** Whether `enemy` stands on any of `tiles`. */
export function onRut(
  enemy: Body,
  tiles: readonly RutTile[],
  halfWidthPx: number = LANDSLIDE.widthPx / 2,
  tileLengthPx: number = LANDSLIDE.tileLengthPx,
): boolean {
  return ruttedBy(enemy, tiles, halfWidthPx, tileLengthPx).length > 0;
}

/**
 * What one rut tick costs an enemy standing on `tiles`: the most any one of them
 * asks, never the sum, so crossing trails do not stack. 0 for none.
 */
export function rutTickDamage(tiles: readonly RutTile[]): number {
  return tiles.reduce((most, tile) => Math.max(most, tile.tickDamage), 0);
}

/**
 * A tile's opacity `ageS` after it was laid: full until the last `fadeS` of its
 * `durationS`, then falling in a straight line to 0, and 0 from then on.
 */
export function rutAlpha(
  ageS: number,
  durationS: number = LANDSLIDE.durationS,
  fadeS: number = LANDSLIDE.fadeS,
): number {
  if (!(ageS < durationS)) return 0;
  if (!(fadeS > 0) || ageS <= durationS - fadeS) return 1;
  return Math.max(0, (durationS - ageS) / fadeS);
}

/** The stop one rut tick applies: its `staggerS`, held under the area rule's share of the tick. */
export function rutStaggerS(): number {
  return areaStaggerS(LANDSLIDE.staggerS, LANDSLIDE.tickEveryS);
}

/**
 * Which slice of the rut art a tile shows: tile `tileIndex` (0-based, in the
 * order a boulder lays them) takes the `(tileIndex / variants)`th window, of
 * `windowPx`, across an art box `artPx` wide, wrapping. A window wider than the
 * art shows all of it from the start. Returns the window's offset in px.
 */
export function rutWindowOffset(
  tileIndex: number,
  artPx: number,
  windowPx: number,
  variants: number = RUT_VARIANTS,
): number {
  const windows = Math.floor(artPx / windowPx);
  if (windows <= 1 || !(variants > 0)) return 0;
  return (Math.floor(tileIndex / variants) % windows) * windowPx;
}

/** Whether an Earth Shield at `level` ends in a stone shock. */
export function hasStoneShock(level: SpellLevel): boolean {
  return level >= 3;
}

/** One enemy a stone shock catches, and the stone that catches it. */
export interface StoneShockHit<T, S> {
  readonly enemy: T;
  readonly stone: S;
}

/**
 * Everything a stone shock catches: every enemy whose body edge is within
 * `radius` of some stone, the radius itself counting as in, paired with the
 * nearest such stone (the earlier on a tie), once per enemy, in enemy order.
 */
export function stoneShockHits<T extends Body, S extends Vec2>(
  stones: readonly S[],
  enemies: readonly T[],
  radius: number = STONE_SHOCK.radius,
): StoneShockHit<T, S>[] {
  const hits: StoneShockHit<T, S>[] = [];
  for (const enemy of enemies) {
    let nearest: S | undefined;
    let nearestEdge = Infinity;
    for (const stone of stones) {
      const edge = Math.hypot(enemy.x - stone.x, enemy.y - stone.y) - (enemy.bodyRadius ?? 0);
      if (edge <= radius && edge < nearestEdge) {
        nearest = stone;
        nearestEdge = edge;
      }
    }
    if (nearest) hits.push({ enemy, stone: nearest });
  }
  return hits;
}

/**
 * The shove a stone shock gives `enemy`: `px` straight out from `stone`, none
 * for an enemy dead on it; `caster` breaks that tie.
 */
export function stoneShockPush(
  stone: Readonly<Vec2>,
  enemy: Readonly<Vec2>,
  caster: Readonly<Vec2>,
  px: number = STONE_SHOCK.knockbackPx,
): Vec2 {
  return knockbackVector(stone, enemy, px, caster);
}

/** How many quakes an Earthquake cast at `level` opens. */
export function quakesPerCast(level: SpellLevel): number {
  return level >= 2 ? QUAKE_SPLIT.count : 1;
}

/**
 * Where a cast's `count` quakes open. The first is `densestSpot` called exactly
 * as level 1 calls it, so it reads `rng` on a tie and on nothing else. Each
 * further one is the densest centre among the enemies within `targetRange` of
 * `origin` that lies at least `minGapFactor x radius` from every centre chosen
 * before it, counting only the enemies outside all of those (a patch that only
 * re-hits the first is worth nothing). Ties there draw `levelRng`, never `rng`.
 * With no such centre the quake is left out, so the list can be shorter than
 * `count`; `count` 1 never touches `levelRng`.
 */
export function quakeSpots<T extends Vec2>(
  origin: Readonly<Vec2>,
  candidates: readonly T[],
  radius: number,
  targetRange: number,
  count: number,
  rng: Rng,
  levelRng: Rng,
  minGapFactor: number = QUAKE_SPLIT.minGapFactor,
): Vec2[] {
  const spots = [densestSpot(origin, candidates, radius, targetRange, rng)];
  const gap = minGapFactor * radius;
  const rangeSq = targetRange * targetRange;
  const radiusSq = radius * radius;
  const within = (a: Vec2, b: Vec2, sq: number): boolean => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy <= sq;
  };
  for (let n = 1; n < Math.floor(count); n += 1) {
    const uncovered = candidates.filter((c) => !spots.some((spot) => within(c, spot, radiusSq)));
    let best: T[] = [];
    let bestCount = 0;
    for (const centre of uncovered) {
      if (!within(centre, origin, rangeSq)) continue;
      if (spots.some((spot) => Math.hypot(centre.x - spot.x, centre.y - spot.y) < gap)) continue;
      const company = uncovered.filter((other) => within(other, centre, radiusSq)).length;
      if (company > bestCount) {
        best = [centre];
        bestCount = company;
      } else if (company === bestCount) {
        best.push(centre);
      }
    }
    const [first] = best;
    if (!first) break;
    const chosen = best.length === 1 ? first : levelRng.pick(best);
    spots.push({ x: chosen.x, y: chosen.y });
  }
  return spots;
}

/** Whether an Earthquake at `level` erupts as it ends. */
export function hasAftershock(level: SpellLevel): boolean {
  return level >= 3;
}

/** What an Aftershock deals to each enemy inside: a multiple of the quake's tick damage. */
export function aftershockDamage(
  tickDamage: number,
  factor: number = AFTERSHOCK.damageFactor,
): number {
  return tickDamage * factor;
}

/**
 * The displacement an Aftershock throws `enemy` by: straight out from `centre`
 * to `edgePadPx` past the rim of a quake of `radius`, measured to the enemy's
 * own edge, so it ends outside. An enemy already there is not moved. One dead
 * on the centre has no outward, so it goes along `index x` the golden angle:
 * deterministic, distinct per index, and drawing nothing from any RNG. A boss
 * (`isBoss`) is moved at most `bossMaxThrowPx`.
 */
export function aftershockThrow(
  centre: Readonly<Vec2>,
  enemy: Body,
  radius: number,
  index: number,
  isBoss: boolean,
  rule: Readonly<
    Pick<Record<keyof typeof AFTERSHOCK, number>, 'edgePadPx' | 'bossMaxThrowPx'>
  > = AFTERSHOCK,
): Vec2 {
  const dx = enemy.x - centre.x;
  const dy = enemy.y - centre.y;
  const distance = Math.hypot(dx, dy);
  const goal = radius + (enemy.bodyRadius ?? 0) + rule.edgePadPx;
  if (distance >= goal) return { x: 0, y: 0 };
  const angle = distance === 0 ? index * GOLDEN_ANGLE : Math.atan2(dy, dx);
  const throwPx = goal - distance;
  const length = isBoss ? Math.min(throwPx, rule.bossMaxThrowPx) : throwPx;
  return { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
}

/**
 * Seconds between an Earth Companion's attacks: `base`, halved for the Earth
 * Companion from level 2. Every other companion, and level 1, is `base`; a
 * caller composes it over Lightning's `companionAttackCooldown`.
 */
export function earthCompanionAttackCooldown(
  id: string,
  base: number,
  level: SpellLevel,
  factor: number = EARTH_COMPANION_SWEEP.cooldownFactor,
): number {
  return id === 'earth_companion' && level >= 2 ? base * factor : base;
}

/** Whether an Earth Companion at `level` sweeps an arc from a landed swing. */
export function hasEarthSweep(level: SpellLevel): boolean {
  return level >= 2;
}

/** The enemies a landed swing's arc catches: `sweepTargets` with the Earth Companion's reach, arc and cap. */
export function earthSweepTargets<T extends Body>(
  pos: Readonly<Vec2>,
  aimRad: number,
  enemies: readonly T[],
  exclude: ReadonlySet<T> | readonly T[] = [],
): T[] {
  return sweepTargets(
    pos,
    aimRad,
    enemies,
    EARTH_COMPANION_SWEEP.reachPx,
    EARTH_COMPANION_SWEEP.halfArcDeg,
    exclude,
    EARTH_COMPANION_SWEEP.maxTargets,
  );
}

/** The shove a swept enemy takes: the companion's `knockback`, cut by `knockbackFactor`, away from `pos`. */
export function earthSweepPush(
  pos: Readonly<Vec2>,
  enemy: Readonly<Vec2>,
  knockback: number,
  caster: Readonly<Vec2>,
): Vec2 {
  return knockbackVector(pos, enemy, knockback * EARTH_COMPANION_SWEEP.knockbackFactor, caster);
}

/** Whether an Earth Companion at `level` leaves a Seismic slam patch. */
export function hasSeismicSlam(level: SpellLevel): boolean {
  return level >= 3;
}

/** The numbers a Seismic patch is placed with, in the shape `createArea` reads. */
export function seismicPatchRule(): AreaRule {
  return {
    radius: SEISMIC_SLAM.radius,
    durationS: SEISMIC_SLAM.durationS,
    tickEveryS: SEISMIC_SLAM.tickEveryS,
  };
}

/** The stop one Seismic tick applies: its `staggerS`, held under the area rule's share of the tick. */
export function seismicStaggerS(): number {
  return areaStaggerS(SEISMIC_SLAM.staggerS, SEISMIC_SLAM.tickEveryS);
}

/**
 * Whether a ground patch of `radius` may be placed at `at`: not at the cap
 * (`live` holds the centres of the patches of its kind on the ground), and not
 * overlapping one, that is with no live centre closer than `2 * radius` to `at`,
 * so no enemy stands in two. The Seismic slam's rule.
 */
export function patchAllowed(
  at: Readonly<Vec2>,
  live: readonly Vec2[],
  cap: number,
  radius: number,
): boolean {
  if (live.length >= cap) return false;
  return !live.some((centre) => Math.hypot(centre.x - at.x, centre.y - at.y) < 2 * radius);
}
