import type { ChainLightningStats, SwordStats, TornadoStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The rest of the Lightning roster (#142, Phase 2 spec §9.4): Chain Lightning,
 * Tornado and Lightning Sword. Lightning Bolt is the element's default and
 * keeps the `lightning` id in `config/spells.ts`; Lightning Companion is one of
 * the four allies in `config/companions.ts`.
 *
 * Chain Lightning is Lightning Bolt with jumps, so the two share their rules
 * (`core/chainLightning.ts`); Lightning Bolt flies as a shot
 * (`spells/LightningBoltSpell.ts`, #202) and Chain Lightning lays its strips
 * instantly (`spells/ChainLightningSpell.ts`). Tornado is a ground area that drifts and
 * pulls (`spells/TornadoSpell.ts`); Lightning Sword is Earth's orbiting ring
 * with a blade on it (`spells/LightningSwordSpell.ts` over
 * `spells/OrbitingBodySpell.ts`).
 *
 * The blocks are the spec's §9.4 table verbatim.
 *
 * Pure data, no Phaser import.
 */

export const LIGHTNING_ROSTER_SPELL_IDS = [
  'lightning_chain',
  'lightning_tornado',
  'lightning_sword',
] as const;

export type LightningRosterSpellId = (typeof LIGHTNING_ROSTER_SPELL_IDS)[number];

export function isLightningRosterSpellId(value: unknown): value is LightningRosterSpellId {
  return (
    typeof value === 'string' && (LIGHTNING_ROSTER_SPELL_IDS as readonly string[]).includes(value)
  );
}

/** Spec §9.4 base block. */
export const BASE_CHAIN_LIGHTNING_STATS: Readonly<ChainLightningStats> = {
  cooldown: 1.4,
  damage: 12,
  strikes: 1,
  chains: 2,
  chainRange: 120,
  chainFalloff: 0.8,
  targetRange: 150,
  staggerDuration: 0.5,
  stunChance: 0.08,
  stunDuration: 2,
};

/** Spec §9.4 base block. */
export const BASE_TORNADO_STATS: Readonly<TornadoStats> = {
  cooldown: 9,
  tickDamage: 5,
  tickRate: 0.4,
  radius: 110,
  pullRadius: 150,
  pullForce: 90,
  speed: 60,
  targetRange: 162,
  duration: 5,
};

/** Spec §9.4 base block. */
export const BASE_SWORD_STATS: Readonly<SwordStats> = {
  count: 1,
  orbitRadius: 70,
  orbitSpeed: 3.2,
  damage: 16,
  size: 18,
  hitCooldown: 0.35,
  staggerDuration: 0.3,
};

export const BASE_LIGHTNING_ROSTER_STATS = {
  lightning_chain: BASE_CHAIN_LIGHTNING_STATS,
  lightning_tornado: BASE_TORNADO_STATS,
  lightning_sword: BASE_SWORD_STATS,
} as const satisfies Readonly<
  Record<LightningRosterSpellId, Readonly<ChainLightningStats | TornadoStats | SwordStats>>
>;

/**
 * The look a blade wears on the ring: the `lightning.sword` clip when the atlas
 * carries it, else the bolt placeholder bar. Either way it points out along the
 * radius, hilt toward the caster (#172).
 */
export const SWORD_TEXTURE = 'fx_bolt' satisfies keyof typeof PLACEHOLDERS;
export const SWORD_CLIP = 'lightning.sword';

/** What a level-up card says about each spell (spec §7.1, cards per #132). */
export const LIGHTNING_ROSTER_CARDS: Readonly<Record<LightningRosterSpellId, SpellCard>> = {
  lightning_chain: {
    name: 'Chain Lightning',
    color: PLACEHOLDERS.fx_bolt.color,
    description: 'A bolt arcs out from you to the nearest enemy and chains to others close by.',
    stats: [
      ['Cooldown', '1.4 s'],
      ['Damage', '12'],
      ['Chains', '2'],
      ['Chain range', '120'],
      ['Stun', '8% for 2 s'],
    ],
  },
  lightning_tornado: {
    name: 'Tornado',
    color: 0xb0bec5,
    description: 'A drifting vortex drags enemies into its eye and grinds them down.',
    stats: [
      ['Cooldown', '9 s'],
      ['Damage', '5 every 0.4 s'],
      ['Pull', '90 px/s within 150'],
      ['Lasts', '5 s'],
    ],
  },
  lightning_sword: {
    name: 'Lightning Sword',
    color: 0xfff176,
    description: 'A charged blade circles you, cutting and staggering whatever it passes.',
    stats: [
      ['Damage', '16'],
      ['Orbit radius', '70'],
      ['Stagger', '0.3 s'],
      ['Hits every', '0.35 s per enemy'],
    ],
  },
};
