import type { Vec2 } from '../core/input';
import type { StormFade } from '../core/iceStorm';
import type { GroundAreaStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The two persistent ground areas (#135, Phase 2 spec §9): which spells they
 * are, the numbers they start at and the card a level-up shows for them.
 *
 * The mechanic is one class (`spells/GroundAreaSpell.ts`) over the rules in
 * `core/groundArea.ts`, so what separates Ice Storm from Earthquake is only the
 * row here: Ice buys the element's crowd control with a heavy slow, Earth buys
 * damage with a longer patch and a longer wait for it. Tornado (#136) is this
 * mechanic plus a drift and a pull and belongs to that ticket.
 *
 * Ice Storm's block is the spec's §9.3 table, its radius cut to 80 (#219).
 * Earthquake's §9.5 table
 * gives its cooldown, tick and radius but not its `duration` or the slow the
 * spec's prose promises it ("Earthquake slows instead" of carrying Earth's
 * knockback, §9.5), so those two are tuning values here: a patch that lives
 * longer than Ice Storm's on a longer cooldown, slowing by less than Ice's
 * signature 50%. #147's balance pass owns both numbers.
 *
 * Pure data, no Phaser import.
 */

export const AREA_SPELL_IDS = ['ice_blizzard', 'earth_quake'] as const;

export type AreaSpellId = (typeof AREA_SPELL_IDS)[number];

export function isAreaSpellId(value: unknown): value is AreaSpellId {
  return typeof value === 'string' && (AREA_SPELL_IDS as readonly string[]).includes(value);
}

/**
 * Spec §9.3 base block. The radius is 80 (#219): at 180 a patch covered two
 * thirds of the view's height; `targetRange` keeps its reach to the crowd.
 */
export const BASE_ICE_STORM_STATS: Readonly<GroundAreaStats> = {
  cooldown: 12,
  tickDamage: 6,
  tickRate: 0.5,
  radius: 80,
  duration: 6,
  targetRange: 180,
  slowPct: 0.5,
  slowDuration: 1,
};

/** Spec §9.5 base block; `duration` and the slow are the tuning values noted above. */
export const BASE_QUAKE_STATS: Readonly<GroundAreaStats> = {
  cooldown: 14,
  tickDamage: 8,
  tickRate: 0.5,
  radius: 180,
  duration: 8,
  targetRange: 162,
  slowPct: 0.3,
  slowDuration: 1,
};

export const BASE_AREA_STATS = {
  ice_blizzard: BASE_ICE_STORM_STATS,
  earth_quake: BASE_QUAKE_STATS,
} as const satisfies Readonly<Record<AreaSpellId, Readonly<GroundAreaStats>>>;

/**
 * The ring every patch is drawn with, scaled to the radius it actually covers,
 * so the ground says exactly where the ticks land. It is the outline over a
 * spell's own art and the whole look for a spell whose art has not landed, or
 * a run without the atlas (#179).
 */
export const AREA_TEXTURE = 'fx_area' satisfies keyof typeof PLACEHOLDERS;

/**
 * The sleet an ice storm falls as (#219): pieces of ice and snow that streak
 * across the patch like heavy rain slanted by the wind, each a frame of `clip`
 * picked at random and turned along its fall. They fade out toward the rim and
 * are gone at the radius, so the storm has no drawn border and ends exactly
 * where it stops ticking.
 */
export interface SleetRule {
  readonly clip: string;
  /** How far a piece falls in a second of run time, in px, slanted by the wind. */
  readonly velocity: Readonly<Vec2>;
  /** Each piece's speed varies by up to this share either way. */
  readonly speedJitter: number;
  /** Seconds of run time one piece is in the air. */
  readonly lifeS: number;
  /** Pieces in the air on average per 1000 px² of patch, so a wider storm is as thick. */
  readonly density: number;
  /** The share of the radius, in from the rim, over which a piece fades out. */
  readonly rimFade: number;
  /** Pieces of one storm that may be in the air at once; past it a piece is dropped. */
  readonly maxLive: number;
}

/** Shards that fall at random spots inside a patch (#219), each played once where the ice lands. */
export interface ShardRule {
  readonly clip: string;
  readonly perSecond: number;
  /** Shards of one patch that may be falling at once; past it a spawn is dropped. */
  readonly maxLive: number;
  /** How far from the centre a shard may land, as a share of the radius. */
  readonly reach: number;
  /** How big the shard is drawn against its art. */
  readonly scale: number;
}

/** A storm drawn as falling ice instead of the ring (#219): its sleet, its splashes and its fade. */
export interface StormLook {
  readonly sleet: SleetRule;
  readonly shards: ShardRule;
  /** The whole storm fades in when it lands and out as it runs down. */
  readonly fade: StormFade;
}

/**
 * What a patch is drawn with besides the ring (#179): the looping clip of its
 * own art, sized so the art spans the patch. A look without a clip is the ring
 * alone. Each spell that places patches passes its own look to the pool, so a
 * new area spell brings its art without the pool changing.
 *
 * A `storm` look (#219) is drawn in place of the ring whenever its clips are
 * in the atlas; without the atlas the ring alone draws.
 */
export interface AreaLook {
  readonly clip?: string;
  readonly storm?: StormLook;
}

/**
 * Ice Storm (#219): sleet falling steeply, slanted a little right by the wind,
 * over the crowd, and ice bursting on the stones where it lands. No frosted
 * floor and no rim: the sleet thins out toward the edge. Earthquake's sheet is
 * still being redrawn (#145), so it draws the ring until its clip lands here.
 */
export const AREA_LOOKS: Readonly<Record<AreaSpellId, AreaLook>> = {
  ice_blizzard: {
    storm: {
      sleet: {
        clip: 'ice.stormSleet',
        velocity: { x: 80, y: 420 },
        speedJitter: 0.15,
        lifeS: 0.3,
        density: 4,
        rimFade: 0.25,
        maxLive: 90,
      },
      // #219's scope change: at radius 80, at most 3 at once or they overlap.
      shards: { clip: 'ice.stormShard', perSecond: 3, maxLive: 3, reach: 0.85, scale: 0.6 },
      fade: { fadeInS: 0.4, fadeOutS: 0.6 },
    },
  },
  earth_quake: {},
};

/** What a level-up card says about each area (spec §7.1, cards per #132). */
export const AREA_CARDS: Readonly<Record<AreaSpellId, SpellCard>> = {
  ice_blizzard: {
    name: 'Ice Storm',
    color: PLACEHOLDERS.fx_nova.color,
    description: 'An ice storm settles on the crowd, slowing and grinding down everything inside.',
    stats: [
      ['Cooldown', '12 s'],
      ['Damage', '6 every 0.5 s'],
      ['Radius', '80'],
      ['Slow', '50% for 1 s'],
    ],
  },
  earth_quake: {
    name: 'Earthquake',
    color: PLACEHOLDERS.boulder.color,
    description: 'The ground splits open and keeps shaking whatever stands on it.',
    stats: [
      ['Cooldown', '14 s'],
      ['Damage', '8 every 0.5 s'],
      ['Radius', '180'],
      ['Lasts', '8 s'],
    ],
  },
};
