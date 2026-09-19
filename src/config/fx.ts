import { ANIMATIONS } from './animations';
import { ENEMY_ARCHETYPES, MAX_LIVE_ENEMIES } from './enemies';
import { BASE_SPELL_STATS } from './spells';

/**
 * Spell FX tunables (CO-082): how the atlas effects are sized and paced
 * against the live stat blocks, and how many may be on screen.
 *
 * Pure data, no Phaser import. `core/fx.ts` turns these into scales and
 * poses; `systems/FxPool.ts`, `systems/OverlayPool.ts` and the spells draw
 * them.
 */

/**
 * A fire explosion is drawn at `aoeRadius / EXPLOSION_SCALE_RADIUS`: scale 1
 * for a 40 px blast, so the base 50 px blast is a quarter larger than the art.
 */
export const EXPLOSION_SCALE_RADIUS = 40;

/** A nova pulse is drawn at `radius / NOVA_SCALE_RADIUS`: scale 1 at the base 90 px radius. */
export const NOVA_SCALE_RADIUS = 90;

/**
 * The boulder's spin plays at its authored frame rate at the base orbit speed
 * and speeds up in proportion, so a faster ring visibly rolls faster.
 */
export const SPIN_BASE_ORBIT_SPEED = BASE_SPELL_STATS.earth.orbitSpeed;

/** An enemy with a body this large or larger burns with the big flame; the tank is the smallest such. */
export const LARGE_BURN_MIN_RADIUS = ENEMY_ARCHETYPES.tank.radius;

/**
 * One-shot effects (explosions, impacts, novas, dust) that may play at once.
 * A burst past this is dropped, never queued, the rule every pool follows.
 * Sized for a maxed fire build at `?timeScale=10`, where casts land ten
 * times a second and each clip is a fraction of a second.
 *
 * Re-measured for several actives (CO-109), headless at seed 1 over whole
 * runs: the peak is 17-23 of these at `?timeScale=10` with one spell or with
 * three, and the pool saturates at `?timeScale=30` either way — one maxed fire
 * build already peaked at 63 there. All four at once (past what a run may
 * equip) saturates it at `?timeScale=10` too. Frame rate held at 60 fps in
 * every one of those runs, so what another active costs is dropped bursts at
 * the edges, never frames; the number itself is #147's tuning pass to move.
 */
export const MAX_LIVE_FX = 64;

/**
 * Status overlays that may be out at once. One enemy shows at most one overlay
 * whatever is on it — `statusOverlay` picks a single clip by priority, so three
 * actives stacking a freeze, a stun and a burn still draw one — so the cap is
 * the enemy pool's own: `MAX_LIVE_ENEMIES` plus the boss's slot.
 */
export const MAX_LIVE_OVERLAYS = MAX_LIVE_ENEMIES + 1;

/**
 * Persistent ground areas (#135) that may be on the ground at once, across
 * every spell casting them. One area spell holds at most two — its 6-8 s patch
 * against a 12-14 s cooldown, halved at most by a stacked Haste — and only the
 * `?loadout=` hook can equip both, so the cap is several times what a real run
 * reaches and exists to bound the pool rather than to shape play. Past it a
 * cast places nothing, the rule every pool follows.
 */
export const MAX_LIVE_AREAS = 16;

/**
 * A ground area is drawn at `radius / AREA_SCALE_RADIUS`, so the ring covers
 * exactly the patch that ticks: scale 1 at the 100 px half-width of the
 * `fx_area` placeholder (`config/colors.ts`, held to it by `fx.test.ts`).
 */
export const AREA_SCALE_RADIUS = 100;

/**
 * Sky-strike telegraphs (#138) that may be counting down at once, across every
 * spell casting them. One Meteor holds at most one — a 1 s fall against a 4 s
 * cooldown, halved at most by a stacked Haste — so the cap is far above what a
 * run reaches and exists to bound the pool rather than to shape play. Past it
 * a cast lands nothing, the rule every pool follows.
 */
export const MAX_LIVE_TELEGRAPHS = 8;

/**
 * A telegraph is drawn at `radius / TELEGRAPH_SCALE_RADIUS`, so the ring covers
 * exactly the blast to come: scale 1 at the 100 px half-width of the
 * `fx_telegraph` placeholder (`config/colors.ts`, held to it by `fx.test.ts`).
 */
export const TELEGRAPH_SCALE_RADIUS = 100;

/** Effects sit above enemies so a hit reads even in a crowd. */
export const FX_DEPTH = 5;

/**
 * Ground areas are on the ground: below the enemies standing in them and the
 * effects that play over them, above the arena floor (`ARENA_DEPTH`).
 */
export const AREA_DEPTH = -1;

/** The arena floor, under everything the run puts on it. */
export const ARENA_DEPTH = -2;

/** The chain segment clip; a stretched segment plays through it once per jump. */
export const CHAIN_CLIP = 'lightning.chain';

const chain = ANIMATIONS.find((anim) => anim.name === CHAIN_CLIP);
if (!chain) throw new Error(`${CHAIN_CLIP} is not an atlas animation`);

/** Frames in the chain clip and how fast they play; the segment cycles them on the run clock. */
export const CHAIN_FRAME_COUNT = chain.frames.length;
export const CHAIN_FRAME_RATE = chain.frameRate;
