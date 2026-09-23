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

/** Spec §4: every regular death's chance of dropping a consumable. Its effects are #128's. */
export const CONSUMABLE_CHANCE = 0.03;

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
export const PICKUP_TEXTURES: Readonly<Record<PickupKind, TextureKey>> = {
  ember: 'pickup_ember',
  consumable: 'pickup_consumable',
  relic: 'pickup_relic',
};
