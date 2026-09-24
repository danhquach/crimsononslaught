import type { TextureKey } from './colors';
import type { EnemyType } from './enemies';

/**
 * Everything on the floor but XP gems (#195, 20-minute run spec §3–§5): what
 * monsters drop, how many the arena holds, and where the relics are placed.
 *
 * Pure data, no Phaser import. `core/pickups.ts` holds the rules that read it,
 * and `systems/PickupPool.ts` is the Phaser side.
 */

export const PICKUP_KINDS = ['ember', 'consumable', 'relic'] as const;

export type PickupKind = (typeof PICKUP_KINDS)[number];

/** One enemy type's Ember drop: the chance a death drops one, and what that one is worth. */
export interface EmberDrop {
  /** In [0, 1]; 1 always drops. */
  chance: number;
  /** Embers the one pickup is worth (a tank's is a single pickup worth 3). */
  value: number;
}

/**
 * Spec §4. A `Record`, so a new enemy type cannot land without its own row.
 *
 * Starting values: a perfect 20-minute clear is a few thousand Embers, most of
 * them from tanks, against a store that costs 6,760 in total. See
 * `docs/tuning/embers-economy.md`.
 */
export const EMBER_DROPS: Readonly<Record<EnemyType, EmberDrop>> = {
  swarm: { chance: 0.2, value: 1 },
  fast: { chance: 0.2, value: 1 },
  tank: { chance: 1, value: 3 },
};

/** Spec §4: the boss pays this on the killing blow, credited to the run rather than dropped. */
export const BOSS_EMBERS = 100;

/**
 * Every regular death's chance of dropping a consumable. #128 cut spec §4's 3 %
 * to 0.3 %: a consumable is a rare find, about a dozen in a full 20-minute run
 * of ~4,000 kills, not one every few seconds.
 */
export const CONSUMABLE_CHANCE = 0.003;

/**
 * What a consumable does on pickup (#128): heal, pull every gem in, blast the
 * screen, or pay Embers. A chest is an elite's drop only; the other three are
 * what a regular death's consumable roll lands on.
 */
export const CONSUMABLE_KINDS = ['health', 'magnet', 'bomb', 'chest'] as const;

export type ConsumableKind = (typeof CONSUMABLE_KINDS)[number];

/** The kinds a regular death can drop. */
export type RegularConsumableKind = Exclude<ConsumableKind, 'chest'>;

/**
 * #128: which kind a regular death's consumable is, by relative weight inside
 * the `CONSUMABLE_CHANCE` roll. Health is the heaviest so a player in trouble
 * has something to reach for, and the bomb the lightest, since it clears the
 * screen. A draw walks them in `CONSUMABLE_KINDS` order.
 */
export const CONSUMABLE_WEIGHTS: Readonly<Record<RegularConsumableKind, number>> = {
  health: 0.45,
  magnet: 0.35,
  bomb: 0.2,
};

/** #128: an elite's chance of dropping a chest, in place of the regular consumable roll. */
export const ELITE_CHEST_CHANCE = 1;

/** #128: HP a health pickup restores, capped at the player's maximum. */
export const HEAL_AMOUNT = 30;

/**
 * #128: how long a magnet pulls every gem on the map, in run time. Long enough
 * for a gem in the far corner of the 3000 px arena to reach a player standing
 * in the other at `GEM_DRIFT_SPEED`.
 */
export const MAGNET_DURATION_MS = 11_000;

/**
 * #128: what a bomb deals every regular enemy on screen, as one un-crittable
 * hit. It clears the screen: more than a tank has at the last wave's `hpMul`.
 */
export const BOMB_DAMAGE = 200;

/** #128: Embers a chest pays on pickup. */
export const CHEST_EMBERS = 25;

/**
 * Spec §4: live Ember and consumable drops at once. Past it an Ember is
 * credited straight to the run and a consumable is lost. Relics sit on top of
 * this in slots of their own.
 */
export const MAX_LIVE_PICKUPS = 500;

/** Spec §5: relics placed in the arena at run start. */
export const RELIC_COUNT = 8;

/** Spec §5: how the relics are spread over the arena, in px. */
export const RELIC_PLACEMENT = {
  /** Clear of the player's start, so none is picked up by standing still. */
  minFromStart: 400,
  /** From every other relic. */
  minApart: 500,
  /** Inside the arena edge. */
  edgeMargin: 100,
  /**
   * Candidate spots tried in all before placement settles for fewer relics.
   * A 3000 px arena meets the spacing in a few dozen; the cap only bounds an
   * arena that cannot.
   */
  maxAttempts: 1000,
} as const;

/** Each kind's placeholder look (`config/colors.ts`); real art comes later. */
export const PICKUP_TEXTURES: Readonly<Record<Exclude<PickupKind, 'consumable'>, TextureKey>> = {
  ember: 'pickup_ember',
  relic: 'pickup_relic',
};

/** #128: a consumable looks like what it does, so each kind has a placeholder of its own. */
export const CONSUMABLE_TEXTURES: Readonly<Record<ConsumableKind, TextureKey>> = {
  health: 'pickup_health',
  magnet: 'pickup_magnet',
  bomb: 'pickup_bomb',
  chest: 'pickup_chest',
};
