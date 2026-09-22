/**
 * Lightning Sword rules that do not need an engine (#142, Phase 2 spec §9.4).
 *
 * The blade rides Earth's orbiting ring — spacing, the turn and the position
 * are `core/orbitingBoulders.ts`'s, and the per-enemy window between two cuts
 * is `core/fireColumn.ts`'s `tryHit`, kept by the spell per enemy the way a
 * column keeps its own. What is the sword's alone is here: how the blade lies
 * on the ring, and what a cut leaves behind.
 *
 * `spells/LightningSwordSpell.ts` is the Phaser side; everything decidable
 * without Phaser lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

/**
 * The blade's facing for a body at `orbitAngle` on the ring: along the orbit,
 * a quarter turn on from the radius, so the bar reads as a sword sweeping round
 * rather than a spoke. Wrapped into [0, 2π).
 */
export function bladeRotation(orbitAngle: number): number {
  const TAU = Math.PI * 2;
  const turned = (orbitAngle + Math.PI / 2) % TAU;
  return turned < 0 ? turned + TAU : turned;
}

/**
 * What a cut leaves on the enemy struck: the spell's stagger, a short stop that
 * refreshes rather than stacks (`core/status.ts`). No knockback — the sword
 * holds the crowd where the blade can cut it again, the opposite of Earth's
 * ring — and no stun: that is the bolts' identity (spec §9.4).
 */
export function swordCut(stats: { readonly damage: number; readonly staggerDuration: number }): {
  damage: number;
  staggerS: number;
} {
  return { damage: stats.damage, staggerS: Math.max(0, stats.staggerDuration) };
}
