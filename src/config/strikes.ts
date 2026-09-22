import type { MeteorStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The sky strikes (#138, Phase 2 spec §9.2): which spell falls from above, the
 * numbers it starts at and the card a level-up shows for it.
 *
 * Meteor is the only one today. The mechanic is `spells/MeteorSpell.ts` over
 * the rules in `core/skyStrike.ts`, and a second strike would be one more row
 * here, the way Blizzard and Earthquake share `GroundAreaSpell`.
 *
 * Meteor's block is the spec's §9.2 table verbatim. How far a strike may land
 * from the target it picked is not in the table, so `METEOR_SCATTER_PX` is a
 * tuning value here: a scatter tight enough that a meteor aimed at a swarm
 * still lands on it, and wide enough that the crowd around the mark is what
 * takes the blast rather than one enemy every time. #147's balance pass owns it.
 *
 * Pure data, no Phaser import.
 */

export const STRIKE_SPELL_IDS = ['fire_meteor'] as const;

export type StrikeSpellId = (typeof STRIKE_SPELL_IDS)[number];

export function isStrikeSpellId(value: unknown): value is StrikeSpellId {
  return typeof value === 'string' && (STRIKE_SPELL_IDS as readonly string[]).includes(value);
}

/** Spec §9.2 base block. */
export const BASE_METEOR_STATS: Readonly<MeteorStats> = {
  cooldown: 3.2,
  damage: 60,
  aoeRadius: 130,
  aoeDamageFactor: 1,
  projectiles: 1,
  targetRange: 420,
  fallDelay: 1,
};

export const BASE_STRIKE_STATS = {
  fire_meteor: BASE_METEOR_STATS,
} as const satisfies Readonly<Record<StrikeSpellId, Readonly<MeteorStats>>>;

/**
 * How far from the target a strike may land, in px (tuning value, see above).
 * A quarter of Meteor's reach: the target stays inside the blast wherever the
 * point falls, so a strike never misses what it was aimed at by scattering.
 */
export const METEOR_SCATTER_PX = 24;

/**
 * How a coming strike reads on screen: the texture the marker is drawn with,
 * scaled to the blast it will cover, so the ground says exactly where to leave.
 * Its own art is #145.
 */
export const TELEGRAPH_TEXTURE = 'fx_telegraph' satisfies keyof typeof PLACEHOLDERS;

/** What a level-up card says about each strike (spec §7.1, cards per #132). */
export const STRIKE_CARDS: Readonly<Record<StrikeSpellId, SpellCard>> = {
  fire_meteor: {
    name: 'Meteor',
    color: PLACEHOLDERS.fx_telegraph.color,
    description: 'Calls a meteor down on the nearest enemy; it lands a moment later, hard.',
    stats: [
      ['Cooldown', '3.2 s'],
      ['Damage', '60'],
      ['Blast radius', '130'],
      ['Falls in', '1 s'],
    ],
  },
};
