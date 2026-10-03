import type { EarthShieldStats, IceShieldStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The two player shields (#134, Phase 2 spec §9): which spells they are, the
 * numbers they start at and the card a level-up shows for them.
 *
 * The pool itself is one mechanic (`core/shield.ts`), worn by two spells that
 * are both rings on a timer (#406: out 5 s, gone 3 s, the pool full only while
 * the ring is out): Ice Shield's diamonds chill what they cut, Earth Shield's
 * stones shove it. What each one draws and does lives with the spell; the
 * numbers live here.
 *
 * The blocks are the spec's §9.3 and §9.5 tables, with `uptime` and `recharge`
 * in place of `rechargeDelay` (#406). The roster tickets
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

/** Spec §9.3 base block, as #406 reshaped it: a ring of diamonds on a timer. */
export const BASE_ICE_SHIELD_STATS: Readonly<IceShieldStats> = {
  count: 3,
  orbitRadius: 70,
  orbitSpeed: 3,
  size: 14,
  damage: 12,
  hitCooldown: 0.4,
  slowPct: 0.4,
  slowDuration: 2,
  shieldHp: 50,
  uptime: 5,
  recharge: 3,
};

/** Spec §9.5 base block. */
export const BASE_EARTH_SHIELD_STATS: Readonly<EarthShieldStats> = {
  count: 3,
  orbitRadius: 80,
  orbitSpeed: 2.5,
  size: 14,
  damage: 20,
  knockback: 60,
  hitCooldown: 0.4,
  shieldHp: 80,
  uptime: 5,
  recharge: 3,
};

export const BASE_SHIELD_STATS = {
  ice_shield: BASE_ICE_SHIELD_STATS,
  earth_shield: BASE_EARTH_SHIELD_STATS,
} as const satisfies Readonly<Record<ShieldSpellId, Readonly<IceShieldStats | EarthShieldStats>>>;

/**
 * The look a diamond wears on the ring (#406): the `ice.diamond` clip when the
 * atlas carries it, else the ice bolt's placeholder diamond. It stays upright.
 */
export const DIAMOND_TEXTURE = 'proj_ice' satisfies keyof typeof PLACEHOLDERS;
export const DIAMOND_CLIP = 'ice.diamond';

/** What a level-up card says about each shield (spec §7.1, cards per #132). */
export const SHIELD_CARDS: Readonly<Record<ShieldSpellId, SpellCard>> = {
  ice_shield: {
    name: 'Ice Shield',
    color: PLACEHOLDERS.shield_ice.color,
    description: 'Ice diamonds circle you for 5 s, chilling what they cut and soaking hits.',
    stats: [
      ['Absorbs', '50 while out'],
      ['Diamonds', '3'],
      ['Damage', '12'],
      ['Out', '5 s, back in 3 s'],
    ],
  },
  earth_shield: {
    name: 'Earth Shield',
    color: PLACEHOLDERS.boulder.color,
    description:
      'Stones circle you for a while, hurl enemies back, and share a pool that shields you.',
    stats: [
      ['Absorbs', '80 while out'],
      ['Out', '5 s, back in 3 s'],
      ['Stones', '3'],
      ['Knockback', '60'],
    ],
  },
};
