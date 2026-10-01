/**
 * The dash (#384): the base move every loadout carries. Distance, speed,
 * invulnerability and cooldown live here and nowhere else, so a later spell
 * that upgrades or replaces the dash changes the run's copy of `DashStats`
 * through `Player.setDashStats` and touches no rule. The look of the effect is
 * kept apart (`DASH_TRAIL`, `DASH_CUE`) so a spell can swap it without
 * redrawing the hero's dash pose.
 *
 * Pure data, no Phaser import. `core/dash.ts` holds the rules.
 */

export interface DashStats {
  /** How far a dash carries the hero, px. */
  readonly distancePx: number;
  /** How long that takes, ms; the speed is the two together. */
  readonly durationMs: number;
  /** The window with no damage from contact, shots or the boss, ms. It runs on its own clock, beside the 0.5 s after a hit. */
  readonly invulnMs: number;
  /** From the press until the next dash may start, ms. */
  readonly cooldownMs: number;
}

/** The run's starting dash (#384). */
export const BASE_DASH: DashStats = {
  distancePx: 120,
  durationMs: 150,
  invulnMs: 200,
  cooldownMs: 3000,
};

/**
 * The afterimage left along a dash. Each ghost is a copy of the hero's current
 * frame, tinted and fading, with a smoke wisp played on it; a puff marks the
 * take-off. All sprites are made once, `poolSize` ghosts, and reused; a ghost
 * past the pool is dropped, never queued.
 */
export const DASH_TRAIL = {
  /** Ghosts the pool holds: the base dash lays one per `spacingMs` of its length, so six. */
  poolSize: 6,
  /** Run-clock ms of dash between ghosts. */
  spacingMs: 25,
  /**
   * Pale lavender, 245° of hue: 45° or more from the boss's violet, the enemy
   * shot's magenta and every element colour, so it is never mistaken for a
   * spell or a hazard (`colors.test.ts`).
   */
  ghostTint: 0x968cff,
  /** Opacity a ghost starts at; under 0.6 so the hero stays the brightest thing on the path. */
  ghostAlpha: 0.55,
  /** Run-clock ms a ghost takes to fade out. */
  fadeMs: 260,
  /** Clip played over each ghost, once; absent from the atlas it is skipped. */
  wispClip: 'dash.wisp',
  /** Clip played once at the take-off point; absent from the atlas it is skipped. */
  burstClip: 'dash.burst',
  /** Hero-sized wisp scale. */
  wispScale: 0.6,
  wispAlpha: 0.5,
  burstScale: 1,
} as const;

/**
 * The cue that the hero is invulnerable: a tint, on for exactly the window, so
 * the player can learn its length. A tint, not alpha, so it never fights the
 * post-hit flicker. Brighter than the ghosts and the same hue family.
 */
export const DASH_CUE = {
  tint: 0xc0baff,
} as const;

/** The hero's dash pose, one clip per facing (`config/animations.ts` supplies the frames). */
export const DASH_POSE_CLIP = 'hero.dash';
