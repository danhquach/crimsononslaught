import type { EarthShieldStats, IceShieldStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The two player shields (#134, Phase 2 spec §9): which spells they are, the
 * numbers they start at and the card a level-up shows for them.
 *
 * The pool itself is one mechanic (`core/shield.ts`), worn by two very
 * different spells: Ice Shield is a layer on the player that shatters into what
 * is nearby, Earth Shield is a ring of stones that is simply gone while the
 * pool is empty. What each one draws and what its break does lives with the
 * spell; the numbers live here.
 *
 * The blocks are the spec's §9.3 and §9.5 tables verbatim. The roster tickets
 * (#140-#143) own the rest of each element's spells and may fold these rows
 * into their own tables.
 *
 * Pure data, no Phaser import.
 */

export const SHIELD_SPELL_IDS = ['ice_shield', 'earth_shield'] as const;

export type ShieldSpellId = (typeof SHIELD_SPELL_IDS)[number];

export function isShieldSpellId(value: unknown): value is ShieldSpellId {
  return typeof value === 'string' && (SHIELD_SPELL_IDS as readonly string[]).includes(value);
}

/** Spec §9.3 base block. */
export const BASE_ICE_SHIELD_STATS: Readonly<IceShieldStats> = {
  shieldHp: 60,
  rechargeDelay: 6,
  breakDamage: 40,
  breakRadius: 120,
  slowPct: 0.4,
  slowDuration: 2,
};

/** Spec §9.5 base block. */
export const BASE_EARTH_SHIELD_STATS: Readonly<EarthShieldStats> = {
  count: 3,
  orbitRadius: 80,
  orbitSpeed: 2.5,
  size: 14,
  damage: 10,
  knockback: 60,
  hitCooldown: 0.4,
  shieldHp: 80,
  rechargeDelay: 8,
};

export const BASE_SHIELD_STATS = {
  ice_shield: BASE_ICE_SHIELD_STATS,
  earth_shield: BASE_EARTH_SHIELD_STATS,
} as const satisfies Readonly<Record<ShieldSpellId, Readonly<IceShieldStats | EarthShieldStats>>>;

/** What a level-up card says about each shield (spec §7.1, cards per #132). */
export const SHIELD_CARDS: Readonly<Record<ShieldSpellId, SpellCard>> = {
  ice_shield: {
    name: 'Ice Shield',
    color: PLACEHOLDERS.shield_ice.color,
    description: 'A layer of ice soaks up damage, regrows, and shatters into what is near.',
    stats: [
      ['Absorbs', '60'],
      ['Recharges in', '6 s'],
      ['Shatter', '40 in 120'],
      ['Slow', '40% for 2 s'],
    ],
  },
  earth_shield: {
    name: 'Earth Shield',
    color: PLACEHOLDERS.boulder.color,
    description: 'Stones circle you, hurl enemies back, and share a pool that shields you.',
    stats: [
      ['Absorbs', '80'],
      ['Returns in', '8 s'],
      ['Stones', '3'],
      ['Knockback', '60'],
    ],
  },
};
