import type { FireColumnStats, FireDragonStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The rest of the Fire roster (#140, Phase 2 spec §9.2): Fire Column and Fire
 * Dragon, which have no mechanic of their own to share the way Meteor shares
 * the sky strike or the companions share `CompanionSpell` — each is its own
 * class, `spells/FireColumnSpell.ts` and `spells/FireDragonSpell.ts`.
 *
 * The blocks are the spec's §9.2 table verbatim.
 *
 * Pure data, no Phaser import.
 */

export const FIRE_ROSTER_SPELL_IDS = ['fire_column', 'fire_dragon'] as const;

export type FireRosterSpellId = (typeof FIRE_ROSTER_SPELL_IDS)[number];

export function isFireRosterSpellId(value: unknown): value is FireRosterSpellId {
  return typeof value === 'string' && (FIRE_ROSTER_SPELL_IDS as readonly string[]).includes(value);
}

/** Spec §9.2 base block. */
export const BASE_FIRE_COLUMN_STATS: Readonly<FireColumnStats> = {
  cooldown: 2.2,
  damage: 18,
  radius: 55,
  projectiles: 1,
  speed: 120,
  range: 180,
  hitCooldown: 0.5,
  burn: 8,
  burnDuration: 3,
};

/** Spec §9.2 base block. */
export const BASE_FIRE_DRAGON_STATS: Readonly<FireDragonStats> = {
  cooldown: 2.5,
  damage: 45,
  aoeRadius: 30,
  aoeDamageFactor: 0.4,
  projectiles: 1,
  speed: 260,
  targetRange: 189,
  homingTurnRate: 4,
  duration: 3,
};

export const BASE_FIRE_ROSTER_STATS = {
  fire_column: BASE_FIRE_COLUMN_STATS,
  fire_dragon: BASE_FIRE_DRAGON_STATS,
} as const satisfies Readonly<
  Record<FireRosterSpellId, Readonly<FireColumnStats | FireDragonStats>>
>;

/** What a level-up card says about each spell (spec §7.1, cards per #132). */
export const FIRE_ROSTER_CARDS: Readonly<Record<FireRosterSpellId, SpellCard>> = {
  fire_column: {
    name: 'Fire Column',
    color: PLACEHOLDERS.fx_column.color,
    description: 'Sends a wide column of flame outward, burning everything it passes through.',
    stats: [
      ['Cooldown', '2.2 s'],
      ['Damage', '18'],
      ['Burn', '8 dps for 3.0 s'],
      ['Range', '180'],
    ],
  },
  fire_dragon: {
    name: 'Fire Dragon',
    color: 0xd50000,
    description: 'Launches a homing missile that curves onto its target for heavy damage.',
    stats: [
      ['Cooldown', '2.5 s'],
      ['Damage', '45'],
      ['Blast radius', '30'],
      ['Target range', '189'],
    ],
  },
};
