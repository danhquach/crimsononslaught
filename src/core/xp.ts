/**
 * The XP curve and what a pickup does to it (spec §5 "XP and level-up").
 *
 * `RunState` (CO-030) holds the level and the progress inside it; this module
 * is the arithmetic between them, kept pure so the carry-over and multi-level
 * cases are unit-tested rather than inferred from a running game.
 *
 * Pure TS, no Phaser import. The curve's parameters live in
 * `config/progression.ts`.
 */

import { XP_CURVE } from '../config/progression';

/**
 * Spec §5: `xpToNext(level) = 10 + level * 5` — the XP needed to leave `level`
 * for the next one. Levels start at 1, so the first one costs 15 and every one
 * after it costs 5 more.
 */
export function xpToNext(level: number): number {
  return XP_CURVE.base + level * XP_CURVE.perLevel;
}

/** Where a run sits on the curve: `xp` is progress inside `level`, not the run total. */
export interface XpProgress {
  level: number;
  xp: number;
}

/** `XpProgress` after a gain, plus how many level-ups it crossed. */
export interface XpGain extends XpProgress {
  levelsGained: number;
}

/**
 * Apply collected XP to a level and its progress.
 *
 * Thresholds are crossed one at a time (spec §5: a pickup that covers several
 * levels grants them sequentially), with the remainder carried into the new
 * level — 100 XP at level 1 is 4 level-ups and 10 XP toward the fifth, not one
 * level and a discarded surplus. `levelsGained` is what the caller owes the
 * player in level-up offers.
 *
 * A non-positive or non-finite amount changes nothing; the run's XP only ever
 * goes up.
 */
export function applyXpGain(progress: XpProgress, amount: number): XpGain {
  let { level, xp } = progress;
  if (!(amount > 0) || !Number.isFinite(amount)) return { level, xp, levelsGained: 0 };

  let levelsGained = 0;
  xp += amount;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    levelsGained += 1;
  }
  return { level, xp, levelsGained };
}
