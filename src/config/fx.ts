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
 */
export const MAX_LIVE_FX = 64;

/**
 * Status overlays that may be out at once. One enemy shows at most one overlay
 * (a run has one spell, and a freeze outranks its slow), so the cap is the
 * enemy pool's own: `MAX_LIVE_ENEMIES` plus the boss's slot.
 */
export const MAX_LIVE_OVERLAYS = MAX_LIVE_ENEMIES + 1;

/** Effects sit above enemies so a hit reads even in a crowd. */
export const FX_DEPTH = 5;

/** The chain segment clip; a stretched segment plays through it once per jump. */
export const CHAIN_CLIP = 'lightning.chain';

const chain = ANIMATIONS.find((anim) => anim.name === CHAIN_CLIP);
if (!chain) throw new Error(`${CHAIN_CLIP} is not an atlas animation`);

/** Frames in the chain clip and how fast they play; the segment cycles them on the run clock. */
export const CHAIN_FRAME_COUNT = chain.frames.length;
export const CHAIN_FRAME_RATE = chain.frameRate;
