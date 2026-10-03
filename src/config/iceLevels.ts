/**
 * What the Ice spells' levels 2 and 3 do beyond their stat adds (#328). The
 * stat adds themselves (a second arrow, four icicles, a second companion shot)
 * are `SPELL_LEVEL_STATS` in `spellLevels.ts`; these are the other level 2
 * and level 3 behaviours and the numbers they run on. First-cut values: the
 * bot sweep tunes them (#147's pass).
 *
 * Every freeze here is an unscaled constant that goes through
 * `Enemy.applyFrost`, and no passive stretches it. On the boss a freeze is no
 * freeze but a short slow (CO-221, `BOSS_CC_RESIST`), under its diminishing
 * returns (`BOSS_CC_DR`).
 *
 * Pure data, no Phaser import.
 */

/** Ice Arrow level 2: the volley's arrows fan out, `spreadDeg` from the first to the last. */
export const ICE_ARROW_FAN = { spreadDeg: 12 } as const;

/** Ice Arrow level 3, Shatter: an arrow that hits an already-slowed enemy throws `count` shards forward. */
export const SHATTER = {
  count: 3,
  spreadDeg: 30,
  damageFactor: 0.5,
  speed: 360,
  range: 90,
  clip: 'ice.arrow',
  drawScale: 0.55,
} as const;

/**
 * Shards the pool may ever hold. About 5 are live at the Haste clamp (2 arrows
 * x 3 shards, 0.25 s of flight each, one volley per 0.28 s), so this is well
 * over the 4x margin the other pools keep; a hit past it drops its surplus.
 */
export const MAX_LIVE_SHARDS = 24;

/**
 * Frost Nova Bomb level 3, Frost wave: where its roll ends it releases a
 * full-circle cold wave that grows from the bomb's core to its `radius` at
 * `speed` px/s (`core/frostNova.ts`'s `rolledOut`, `core/fireWave.ts`'s wave
 * with a half arc of pi). At 280 px/s the 110 px reach takes about 0.4 s, and
 * a bomb throws every 3.5 s, so one wave is out at a time per bomb.
 */
export const NOVA_WAVE = { speed: 280 } as const;

/**
 * Ice Shield level 3, Frost burst (#406): when the diamonds vanish, at the end
 * of their uptime or on a broken pool, each one releases a small full-circle
 * cold wave from where it hangs (`IceRingWave`, `core/fireWave.ts` with a half
 * arc of pi). A wave grows to `range` at `speed` px/s, chills each enemy it
 * sweeps over once (`slowPct` for `slowDuration` s, no freeze) and deals
 * `damageFactor` x the diamond's damage. At 240 px/s the 60 px reach takes
 * 0.25 s, so at most the ring's four waves are out at once.
 */
export const ICE_SHIELD_WAVE = {
  range: 60,
  speed: 240,
  damageFactor: 1.5,
  slowPct: 0.4,
  slowDuration: 1.5,
} as const;

/** Ice Companion level 3, Frost orb: every `every`th attack's first shot freezes its target and chills its neighbours. */
export const FROST_ORB = {
  every: 4,
  freezeS: 1,
  slowRadius: 50,
  slowPct: 0.4,
  slowDurationS: 1.5,
  clip: 'ice.bomb',
  drawScale: 0.5,
} as const;

/** Ice Storm level 2, Hail: every `everyS` a hailstone hits one enemy inside, for `damageFactor` x the tick damage. */
export const HAIL = { everyS: 1, damageFactor: 3, clip: 'ice.stormShard', drawScale: 1 } as const;

/** Ice Storm level 3, Deep freeze: the patch's last paid tick freezes everything inside for `freezeS`. */
export const DEEP_FREEZE = { freezeS: 1 } as const;

/**
 * Where the `ice.wave` frost ring sits in its cut frames (CO-227): the ring is
 * drawn about the frame's anchor, and `outerRadius[i]` is the distance from it
 * to frame `i`'s outer edge, in the frame's native px (the 95th percentile of
 * its opaque pixels' distances, so stray snow flecks do not count). The spell
 * scales the sprite by `radius / outerRadius[i]`. Frame 1 is the core burst
 * only. `scripts/lib/iceWaveArt.test.mjs` re-measures all four from the atlas.
 */
export const ICE_WAVE_ART = { outerRadius: [12, 35, 52, 56] } as const;
