import type { MeteorStats } from '../core/spellStats';
import type { AreaLook } from './areas';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The sky strikes (#138, Phase 2 spec §9.2): which spell falls from above, the
 * numbers it starts at and the card a level-up shows for it.
 *
 * Meteor is the only one today. The mechanic is `spells/MeteorSpell.ts` over
 * the rules in `core/skyStrike.ts`, and a second strike would be one more row
 * here, the way Ice Storm and Earthquake share `GroundAreaSpell`.
 *
 * Meteor's block is the CO-167 rework spec's §4 table, which replaced §9.2's.
 * How far a strike may land from the target it picked is not in the table, so
 * `METEOR_SCATTER_PX` is a
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

/** Rework spec §4 base block (CO-167). */
export const BASE_METEOR_STATS: Readonly<MeteorStats> = {
  cooldown: 3.2,
  damage: 60,
  aoeRadius: 70,
  aoeDamageFactor: 1,
  aoeEdgeFactor: 0.4,
  projectiles: 1,
  targetRange: 189,
  fallDelay: 1,
  pondRadius: 45,
  pondDuration: 1.5,
  pondTickDamage: 5,
  pondTickRate: 0.5,
};

export const BASE_STRIKE_STATS = {
  fire_meteor: BASE_METEOR_STATS,
} as const satisfies Readonly<Record<StrikeSpellId, Readonly<MeteorStats>>>;

/**
 * How far from the target a strike may land, in px (tuning value, see above).
 * About a third of Meteor's reach: the target stays inside the blast wherever
 * the point falls, so a strike never misses what it was aimed at by scattering.
 */
export const METEOR_SCATTER_PX = 24;

/**
 * The meteor's path (CO-167, rework spec §3): it comes in along a heading
 * `METEOR_FALL_ANGLE_DEG` off vertical, down and to the right, from
 * `METEOR_FALL_PX` back along it, and reaches the point as `fallDelay` ends.
 */
export const METEOR_FALL_ANGLE_DEG = 35;
export const METEOR_FALL_PX = 300;

/** The falling body (#145's art), drawn rock first along the path. */
export const METEOR_CLIP = 'fire.meteor';

/**
 * What a strike in the air is drawn with when the atlas did not supply
 * `METEOR_CLIP`: a generated placeholder, so a missing atlas only costs the art.
 */
export const TELEGRAPH_TEXTURE = 'fx_telegraph' satisfies keyof typeof PLACEHOLDERS;

/**
 * The magma pond a landing leaves (CO-167, rework spec §5): its simmer loop,
 * drawn without the ring, and the fade over its last moments.
 */
export const METEOR_POND_LOOK: AreaLook = { clip: 'fire.pond', ringless: true, fadeOutS: 0.3 };

/** What a level-up card says about each strike (spec §7.1, cards per #132). */
export const STRIKE_CARDS: Readonly<Record<StrikeSpellId, SpellCard>> = {
  fire_meteor: {
    name: 'Meteor',
    color: PLACEHOLDERS.fx_telegraph.color,
    description:
      'Drops a meteor on the nearest enemy. It hits hardest at the centre and leaves a burning pool.',
    stats: [
      ['Cooldown', '3.2 s'],
      ['Damage', '60'],
      ['Blast radius', '70'],
      ['Falls in', '1 s'],
      ['Pool', '1.5 s'],
    ],
  },
};
