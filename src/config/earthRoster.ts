import type { BoulderStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The rest of the Earth roster (#143, Phase 2 spec §9.5): Boulder, the one
 * Earth spell with no mechanic to share the way Earth Shield, Earthquake and
 * the Earth Companion share theirs. Earth Spike is the element's default and
 * keeps the `earth` id in `config/spells.ts`; Earth Shield is Phase 1's
 * Orbiting Boulders block, in `config/shields.ts`.
 *
 * Boulder is a projectile — the pooled `entities/Projectile.ts` Fire and Ice
 * shoot — thrown rather than orbited, so it is its own class,
 * `spells/RollingBoulderSpell.ts`, over the rules in `core/rollingBoulder.ts`.
 *
 * The block is the spec's §9.5 table verbatim.
 *
 * Pure data, no Phaser import.
 */

export const EARTH_ROSTER_SPELL_IDS = ['earth_boulder'] as const;

export type EarthRosterSpellId = (typeof EARTH_ROSTER_SPELL_IDS)[number];

export function isEarthRosterSpellId(value: unknown): value is EarthRosterSpellId {
  return typeof value === 'string' && (EARTH_ROSTER_SPELL_IDS as readonly string[]).includes(value);
}

/** Spec §9.5 base block. */
export const BASE_BOULDER_STATS: Readonly<BoulderStats> = {
  cooldown: 2,
  damage: 40,
  radius: 36,
  speed: 280,
  range: 460,
  pierce: 3,
  knockback: 120,
};

export const BASE_EARTH_ROSTER_STATS = {
  earth_boulder: BASE_BOULDER_STATS,
} as const satisfies Readonly<Record<EarthRosterSpellId, Readonly<BoulderStats>>>;

/**
 * The look a thrown boulder wears. Its own art is #145; until it lands it is
 * the ring's own stone placeholder, scaled up to the `radius` the spec gives
 * it, so the heavy throw reads as a bigger version of the stones that circle
 * the player rather than as a fireball.
 */
export const ROLLING_BOULDER_TEXTURE = 'boulder' satisfies keyof typeof PLACEHOLDERS;

/** The clip a boulder rolls with in the air (CO-082), shared with the ring. */
export const ROLLING_BOULDER_CLIP = 'earth.spin';

/** What a level-up card says about each spell (spec §7.1, cards per #132). */
export const EARTH_ROSTER_CARDS: Readonly<Record<EarthRosterSpellId, SpellCard>> = {
  earth_boulder: {
    name: 'Boulder',
    color: PLACEHOLDERS.boulder.color,
    description: 'Hurls a heavy stone that rolls through the crowd, flattening what it touches.',
    stats: [
      ['Cooldown', '2 s'],
      ['Damage', '40'],
      ['Pierces', '3 enemies'],
      ['Knockback', '120'],
    ],
  },
};
