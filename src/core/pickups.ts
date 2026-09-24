import type { EnemyType } from '../config/enemies';
import {
  CONSUMABLE_CHANCE,
  CONSUMABLE_KINDS,
  CONSUMABLE_WEIGHTS,
  ELITE_CHEST_CHANCE,
  EMBER_DROPS,
  MAX_LIVE_PICKUPS,
  RELIC_PLACEMENT,
  type ConsumableKind,
  type RegularConsumableKind,
} from '../config/pickups';
import type { Vec2 } from './input';
import type { Rng } from './rng';

/**
 * Floor pickup rules that do not need an engine (#195, 20-minute run spec
 * §3–§5): what a death drops, whether the pool has room for it, and where the
 * relics go at run start.
 *
 * Every draw here comes from the run's pickups stream
 * (`createRng(deriveSeed(seed, 'pickups'))`), never from the run RNG, so drops
 * cannot move an existing seed's spawns or level-up offers.
 *
 * Pure TS, no Phaser import. The tunables live in `config/pickups.ts`.
 */

/** Emitter event names for picking up a floor pickup, namespaced like `run:*`. */
export const PICKUP_EVENT = {
  consumable: 'pickup:consumable',
  relic: 'pickup:relic',
} as const;

/** What one regular death drops beside its gems. */
export interface DropRoll {
  /** Embers the one Ember pickup is worth; 0 is no Ember pickup. */
  embers: number;
  /** The consumable it drops, or `null` for none. */
  consumable: ConsumableKind | null;
}

/**
 * Spec §4: one roll per regular death. Always exactly two draws, whatever the
 * type and whatever they land on, so the draws after it on the stream do not
 * depend on what dropped.
 *
 * #128: the consumable draw also picks the kind (`consumableFor`), so the
 * kinds cost no draw of their own and a seed's Embers are the ones it dropped
 * before consumables had kinds. An elite rolls for a chest instead (#126 sets
 * `elite`).
 */
export function rollDrops(rng: Rng, type: EnemyType, elite = false): DropRoll {
  const ember = EMBER_DROPS[type];
  const emberDraw = rng.next();
  const consumableDraw = rng.next();
  return {
    embers: emberDraw < ember.chance ? ember.value : 0,
    consumable: consumableFor(consumableDraw, elite),
  };
}

/**
 * #128: which consumable one draw in [0, 1) lands on. An elite's is a chest
 * with `ELITE_CHEST_CHANCE`, and nothing otherwise. A regular death's drops
 * with `CONSUMABLE_CHANCE`; the draw's place inside that chance, which is
 * uniform, walks `CONSUMABLE_WEIGHTS` to pick the kind.
 */
export function consumableFor(draw: number, elite = false): ConsumableKind | null {
  if (elite) return draw < ELITE_CHEST_CHANCE ? 'chest' : null;
  if (!(draw < CONSUMABLE_CHANCE)) return null;
  // Walked in `CONSUMABLE_KINDS` order, not the weights' key order, so
  // reordering that literal cannot move which kind a draw lands on.
  const kinds = CONSUMABLE_KINDS.filter((k): k is RegularConsumableKind => k !== 'chest');
  const total = kinds.reduce((sum, kind) => sum + CONSUMABLE_WEIGHTS[kind], 0);
  let at = (draw / CONSUMABLE_CHANCE) * total;
  for (const kind of kinds) {
    at -= CONSUMABLE_WEIGHTS[kind];
    if (at < 0) return kind;
  }
  // Floating-point slack at the top of the range lands on the last kind.
  return kinds[kinds.length - 1] ?? null;
}

/** Spec §4: whether another Ember or consumable may go on the floor, with `live` already there. */
export function canDrop(live: number, cap: number = MAX_LIVE_PICKUPS): boolean {
  return live < cap;
}

/** Where one death's drop goes: onto the floor, or straight to the run. */
export interface DropPlan {
  /** Worth of the Ember pickup to place; 0 is none. */
  ember: number;
  /** Embers the floor had no room for, credited to the run instead. */
  credit: number;
  /** The consumable to place, or `null`. One with no room is lost. */
  consumable: ConsumableKind | null;
}

/**
 * Spec §4: settle a roll against the drop cap, with `live` drops already on
 * the floor. The Ember takes a free slot first. An Ember with no slot is
 * credited to the run, so the cap never costs the player Embers; a consumable
 * with no slot is dropped.
 */
export function planDrop(roll: DropRoll, live: number, cap: number = MAX_LIVE_PICKUPS): DropPlan {
  let room = Math.max(0, cap - live);
  const ember = roll.embers > 0 && room > 0 ? roll.embers : 0;
  if (ember > 0) room -= 1;
  return { ember, credit: roll.embers - ember, consumable: room > 0 ? roll.consumable : null };
}

/**
 * #128: a magnet's time left after one step of `deltaMs` run time, never
 * below 0. Run time, not wall time, so a pause or a hit-stop holds it.
 */
export function tickMagnet(msLeft: number, deltaMs: number): number {
  return Math.max(0, msLeft - deltaMs);
}

/** The camera's view of the world, as `Phaser.Cameras.Scene2D.Camera#worldView` gives it. */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * #128: what a bomb hits — every one of `live` on screen, edges included,
 * except those `spared` says to leave alone (the boss).
 */
export function bombTargets<T extends Readonly<Vec2>>(
  live: readonly T[],
  view: ViewRect,
  spared: (target: T) => boolean = () => false,
): T[] {
  const inside = (t: T): boolean =>
    t.x >= view.x && t.x <= view.x + view.width && t.y >= view.y && t.y <= view.y + view.height;
  return live.filter((t) => inside(t) && !spared(t));
}

export interface PlacementRules {
  minFromStart: number;
  minApart: number;
  edgeMargin: number;
  maxAttempts: number;
}

/**
 * Spec §5: up to `count` relic spots in a `world`-sized arena, each at least
 * `minFromStart` from `start`, `minApart` from every other, and `edgeMargin`
 * inside the edge. Rejection sampling: a candidate that breaks a rule is
 * thrown away. After `maxAttempts` candidates in all it returns the spots it
 * has, fewer than `count`, rather than looping forever on an arena that cannot
 * hold them.
 */
export function placeRelics(
  rng: Rng,
  world: { readonly width: number; readonly height: number },
  start: Readonly<Vec2>,
  count: number,
  rules: PlacementRules = RELIC_PLACEMENT,
): Vec2[] {
  const { minFromStart, minApart, edgeMargin, maxAttempts } = rules;
  const spanX = world.width - 2 * edgeMargin;
  const spanY = world.height - 2 * edgeMargin;
  const spots: Vec2[] = [];
  if (spanX < 0 || spanY < 0) return spots;
  const clear = (a: Readonly<Vec2>, b: Readonly<Vec2>, gap: number): boolean =>
    Math.hypot(a.x - b.x, a.y - b.y) >= gap;
  for (let attempt = 0; attempt < maxAttempts && spots.length < count; attempt++) {
    const spot = { x: edgeMargin + rng.next() * spanX, y: edgeMargin + rng.next() * spanY };
    if (!clear(spot, start, minFromStart)) continue;
    if (spots.some((other) => !clear(spot, other, minApart))) continue;
    spots.push(spot);
  }
  return spots;
}
