/**
 * XP curve parameters (spec §5 "XP and level-up").
 *
 * Pure data, no Phaser import, so the numbers are unit-tested against the spec.
 * The curve *function* lives in `core/xp.ts` and reads these — the same split as
 * `config/enemies.ts` ↔ `core/enemy.ts`.
 */

/** Spec §5: `xpToNext(level) = 10 + level * 5`. */
export const XP_CURVE = {
  /** XP cost at level 0; a run starts at level 1, so the first level costs 15. */
  base: 10,
  /** Extra XP each level adds to the previous level's cost. */
  perLevel: 5,
} as const;
