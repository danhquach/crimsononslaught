import type { NovaBombStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The rest of the Ice roster (#141, Phase 2 spec §9.3): Frost Nova Bomb, the
 * one Ice spell with no mechanic to share the way Ice Shield, Ice Companion
 * and Blizzard share theirs — it is its own class, `spells/NovaBombSpell.ts`,
 * Phase 1's Frost Nova thrown rather than pulsed from the player.
 *
 * The block is the spec's §9.3 table verbatim.
 *
 * Pure data, no Phaser import.
 */

export const ICE_ROSTER_SPELL_IDS = ['ice_nova_bomb'] as const;

export type IceRosterSpellId = (typeof ICE_ROSTER_SPELL_IDS)[number];

export function isIceRosterSpellId(value: unknown): value is IceRosterSpellId {
  return typeof value === 'string' && (ICE_ROSTER_SPELL_IDS as readonly string[]).includes(value);
}

/** Spec §9.3 base block. */
export const BASE_NOVA_BOMB_STATS: Readonly<NovaBombStats> = {
  cooldown: 2.2,
  damage: 24,
  radius: 110,
  speed: 220,
  range: 300,
  slowPct: 0.4,
  slowDuration: 2,
  freezeChance: 0.15,
  freezeDuration: 1,
};

export const BASE_ICE_ROSTER_STATS = {
  ice_nova_bomb: BASE_NOVA_BOMB_STATS,
} as const satisfies Readonly<Record<IceRosterSpellId, Readonly<NovaBombStats>>>;

/** What a level-up card says about each spell (spec §7.1, cards per #132). */
export const ICE_ROSTER_CARDS: Readonly<Record<IceRosterSpellId, SpellCard>> = {
  ice_nova_bomb: {
    name: 'Frost Nova Bomb',
    color: PLACEHOLDERS.fx_nova.color,
    description: 'Lobs a slow bomb that bursts into a freezing ring, slowing the whole group.',
    stats: [
      ['Cooldown', '2.2 s'],
      ['Damage', '24'],
      ['Radius', '110'],
      ['Slow', '40% for 2 s'],
      ['Freeze', '15% for 1 s'],
    ],
  },
};
