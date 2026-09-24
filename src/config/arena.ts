import type { FrameName } from './frames';

/**
 * The arena's dressing (#120): the ground tile, the edge band and the scatter
 * props `GameScene.buildArena` draws from the atlas, and how the props are
 * spread. Pure data, no Phaser import; `core/arenaDressing.ts` places them.
 */

/** One tile repeated over the whole floor. */
export const ARENA_GROUND_FRAME: FrameName = 'arena.ground.0';

/** One tile repeated along a band inside each arena edge. */
export const ARENA_EDGE_FRAME: FrameName = 'arena.edge.0';

/** Width of the edge band, in px. Half the edge tile, so its rocks read whole. */
export const ARENA_EDGE_BAND = 64;

/** The scatter props, one frame each, in the prop sheet's cell order. */
export const ARENA_PROP_FRAMES = [
  'arena.rocks.0',
  'arena.rubble.0',
  'arena.bones.0',
  'arena.tree.0',
  'arena.pillar.0',
  'arena.column.0',
  'arena.gravestone.0',
  'arena.bush.0',
] as const satisfies readonly FrameName[];

/** How many props a run tries to scatter. About one per 300 px square of floor. */
export const ARENA_PROP_COUNT = 100;

/** How the props are spread over the arena, in px. */
export const ARENA_PROP_PLACEMENT = {
  /**
   * Kept clear around the player's start and around each relic, so no prop
   * covers the hero at spawn or sits under a relic.
   */
  clearRadius: 160,
  /** From every other prop, so they read as landmarks rather than clutter. */
  spacing: 150,
  /** Inside the arena edge: past the edge band and a prop's own half-width. */
  edgeMargin: ARENA_EDGE_BAND + 48,
  /** Candidate spots tried in all before placement settles for fewer props. */
  maxAttempts: 2000,
} as const;
