import { ANIMATIONS } from './animations';
import { PLACEHOLDERS } from './colors';
import { ENEMY_ARCHETYPES, MAX_LIVE_ENEMIES } from './enemies';
import { BASE_EARTH_SHIELD_STATS } from './shields';

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
 * The half-width of the frost ring in `ice.spikeRing`'s frames, in native px
 * (CO-182). The bomb no longer draws that burst (#406); the art test
 * (`scripts/lib/frostNovaBombArt.test.mjs`) still pins the atlas frames to it.
 */
export const SPIKE_RING_SCALE_RADIUS = 61;

/**
 * The boulder's spin plays at its authored frame rate at the base orbit speed
 * and speeds up in proportion, so a faster ring visibly rolls faster. Earth
 * Shield is the ring the base is read from (spec §9.5): #143 made `earth`
 * itself Earth Spike, which has no orbit.
 */
export const SPIN_BASE_ORBIT_SPEED = BASE_EARTH_SHIELD_STATS.orbitSpeed;

/** A stunned enemy is filled the bolt's yellow so the stun reads on screen. */
export const STUN_TINT = PLACEHOLDERS.fx_bolt.color;

/** A frozen enemy is filled the nova's blue: a solid block of ice, the freeze's own look. */
export const FROST_TINT = PLACEHOLDERS.fx_nova.color;

/**
 * A slowed enemy that is not frozen is multiplied by this light blue (#219),
 * so it keeps its own colours and reads as chilled, never as frozen solid.
 */
export const SLOW_TINT = 0xb3e5fc;

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
 * every spell casting them. One area spell holds at most two casts' patches —
 * its 4-8 s patch against a 9-14 s cooldown, cut to 0.35 x by a stacked Haste —
 * and from level 2 an Earthquake cast opens 2 (#330), about 3.3 alive at the
 * floor, 13 with the margin of four; the Earth Companion's seismic patches
 * (`MAX_LIVE_SEISMIC_PATCHES`, 6) share the pool: 13 + 6 = 19 of 24. Only the
 * `?loadout=` hook can equip more than one area spell, so the cap is several
 * times what a real run reaches and exists to bound the pool rather than to
 * shape play. Past it a cast places nothing, the rule every pool follows.
 */
export const MAX_LIVE_AREAS = 24;

/**
 * A ground area is drawn at `radius / AREA_SCALE_RADIUS`, so the ring covers
 * exactly the patch that ticks: scale 1 at the 100 px half-width of the
 * `fx_area` placeholder (`config/colors.ts`, held to it by `fx.test.ts`). A
 * spell's own art under the ring is sized from its art box instead
 * (`areaArtScale`, #179).
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
 * How opaque a clip is drawn, by clip name (#347). These clips play above the
 * crowd (`FX_DEPTH`, or among it for the sword) with mostly solid art, so
 * each is drawn at a flat runtime alpha and the enemies, shots and pickups
 * under it read through: the biggest, most solid bursts go lowest. Nothing
 * goes below 0.6, so the element colours hold, and the meteor keeps 0.75
 * because it is the warning. A clip not listed draws solid. A flat runtime
 * alpha, not baked into the atlas page, as `AreaLook.alpha` is; the flame
 * front multiplies its own fade-out by it.
 *
 * Keyed by clip, so every caster of a clip shares it, the exploder enemy's
 * blast (`fire.explode` in `GameScene.ts`) included.
 */
export const FX_ALPHA: Readonly<Record<string, number>> = {
  'fire.explode': 0.6,
  'ice.nova': 0.6,
  'fire.wave': 0.6,
  'ice.shatter': 0.75,
  'fire.meteor': 0.75,
  'lightning.sword': 0.75,
};

/**
 * Damage numbers (#125) sit above the effects and the shield aura (6), so a
 * blast never hides what it dealt.
 */
export const NUMBER_DEPTH = 7;

/**
 * Ground areas are on the ground: below the enemies standing in them and the
 * effects that play over them, above the arena's props (`PROP_DEPTH`).
 */
export const AREA_DEPTH = -1;

/**
 * A patch's own art (#179) lies just under its ring, so the outline of the
 * ground that ticks is never hidden by the art, and over the arena's props.
 */
export const AREA_ART_DEPTH = -1.25;

/**
 * An ice storm's sleet (#219) falls through the air over the enemies standing
 * in it, as rain would, and under the effects, overlays and damage numbers, so
 * a hit or a status still reads through the storm.
 */
export const AREA_SLEET_DEPTH = 4.5;

/**
 * The arena's scatter props (#120) lie on the floor and under everything the
 * run puts there, ground areas included, so decoration never hides play.
 */
export const PROP_DEPTH = -1.5;

/**
 * The mark under an elite (#126) lies on the ground at its feet: over the
 * ground areas, so a patch never hides one, and under every enemy, so it never
 * covers the elite's own sprite or its status overlay.
 */
export const ELITE_MARK_DEPTH = -0.5;

/**
 * #126: the clip the mark under an elite loops, and how wide it is drawn: its
 * art spans `span` times its host's body diameter, so a tank's is as plain as
 * a swarm's.
 */
export const ELITE_MARK = { clip: 'status.elite', span: 2.4 } as const;

/**
 * #388: the enraged boss's ember ring loops under it and its one-off burst
 * plays as it enrages; each is drawn `span` times the boss's body diameter
 * wide. The ring lies over the elite marks and under every entity at depth 0,
 * so it never covers the boss's own sprite; the burst is a one-off drawn at
 * `FX_DEPTH`, over the crowd.
 */
export const BOSS_AURA = { clip: 'boss.enrageAura', span: 2.4 } as const;
export const BOSS_BURST = { clip: 'boss.enrageBurst', span: 3 } as const;
export const BOSS_AURA_DEPTH = -0.2;

/**
 * CO-222: the Ground slam's floor warning, a translucent red disc under a
 * bright rim, scaled so the rim's outer edge sits on the slam's radius; it lies
 * over the enrage ring and under every entity. The shockwave plays once at the
 * same depth and scale, a ring of fire on the floor round the boss and the hero.
 */
export const BOSS_SLAM_FX = {
  rim: 'boss.slamWarnRim',
  fill: 'boss.slamWarnFill',
  shock: 'boss.slamShock',
  // Toned down after the first in-game look read too bright on the dark floor.
  rimAlpha: 0.55,
  fillAlpha: 0.2,
  shockAlpha: 1,
} as const;
export const BOSS_SLAM_WARN_DEPTH = -0.15;

/**
 * CO-232: Leap's floor warning at the locked landing point, the slam's
 * treatment (a rim and a disc scaled so the rim's outer edge is the 90 px
 * radius, the shockwave once on landing). Alphas are above the slam's (0.55 and 0.2), at rim 0.7 and fill 0.3: its disc is darker, and
 * the dark floor swallows 20% of it, so it needs more to read.
 */
export const BOSS_LEAP_FX = {
  rim: 'boss.leapWarnRim',
  fill: 'boss.leapWarnFill',
  shock: 'boss.leapShock',
  rimAlpha: 0.7,
  fillAlpha: 0.3,
  shockAlpha: 1,
} as const;

/**
 * CO-224: Summon's floor cue. A circle loops where each pack member will appear
 * through the wind-up (drawn at game size, about 44 px wide, the circle's
 * radius in `BOSS_SUMMON`), and a burst plays once where one lands. Both lie at
 * the slam warning's depth, under every entity.
 */
export const BOSS_SUMMON_FX = {
  circle: 'boss.summonCircle',
  burst: 'boss.summonBurst',
  circleAlpha: 0.9,
} as const;

/**
 * CO-225: the enraged boss's chain charge. A red streak trails behind every
 * enraged charge (the art is drawn heading right, so it is turned to the
 * charge's direction); its head sits `trailBackPx` behind the boss's centre
 * along the line it charges on and the sprite is drawn `trailLengthPx` long.
 * A four-spike glint plays once over the boss on each chained telegraph, drawn
 * `flashPx` wide. The trail lies over the aura and the slam warning and under
 * the dash and every entity.
 */
export const BOSS_CHAIN_FX = {
  trail: 'boss.chainTrail',
  flash: 'boss.chainFlash',
  trailLengthPx: 140,
  trailBackPx: 60,
  flashPx: 90,
} as const;
export const BOSS_TRAIL_DEPTH = -0.12;

/**
 * The dash's afterimages and wisps (#384) lie just under the hero, over the
 * ground areas and the elite marks and under the entities drawn at depth 0, so
 * the trail never covers the hero it follows.
 */
export const DASH_DEPTH = -0.1;

/** The arena floor, under everything the run puts on it. */
export const ARENA_DEPTH = -2;

/** The chain segment clip; a stretched segment plays through it once per jump. */
export const CHAIN_CLIP = 'lightning.chain';

const chain = ANIMATIONS.find((anim) => anim.name === CHAIN_CLIP);
if (!chain) throw new Error(`${CHAIN_CLIP} is not an atlas animation`);

/** Frames in the chain clip and how fast they play; the segment cycles them on the run clock. */
export const CHAIN_FRAME_COUNT = chain.frames.length;
export const CHAIN_FRAME_RATE = chain.frameRate;
