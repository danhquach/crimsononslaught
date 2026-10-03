import type { NovaBombStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The rest of the Ice roster (#141, Phase 2 spec §9.3): Frost Nova Bomb, the
 * one Ice spell with no mechanic to share the way Ice Shield, Ice Companion
 * and Ice Storm share theirs — it is its own class, `spells/NovaBombSpell.ts`.
 * Since CO-182 it is a slow spinning ice urchin that rolls toward the densest
 * group, sprays icicles in a spiral and bursts into its freezing ring inside
 * the pack, rather than Phase 1's Frost Nova thrown at the nearest enemy.
 *
 * The block is the CO-182 rework table, not the spec's original §9.3 one.
 *
 * Pure data, no Phaser import.
 */

export const ICE_ROSTER_SPELL_IDS = ['ice_nova_bomb'] as const;

export type IceRosterSpellId = (typeof ICE_ROSTER_SPELL_IDS)[number];

export function isIceRosterSpellId(value: unknown): value is IceRosterSpellId {
  return typeof value === 'string' && (ICE_ROSTER_SPELL_IDS as readonly string[]).includes(value);
}

/**
 * The CO-182 rework base block (`docs/superpowers/specs/2026-09-28-frost-nova-bomb-rework-design.md`
 * §4), not the §9.3 table it replaces.
 */
export const BASE_NOVA_BOMB_STATS: Readonly<NovaBombStats> = {
  cooldown: 3.5,
  damage: 28,
  radius: 110,
  speed: 80,
  range: 240,
  slowPct: 0.4,
  slowDuration: 2,
  freezeChance: 0.15,
  freezeDuration: 1,
  throwInterval: 0.25,
  icicles: 2,
  icicleDamage: 14,
  icicleSpeed: 320,
  icicleRange: 110,
};

export const BASE_ICE_ROSTER_STATS = {
  ice_nova_bomb: BASE_NOVA_BOMB_STATS,
} as const satisfies Readonly<Record<IceRosterSpellId, Readonly<NovaBombStats>>>;

/** What a level-up card says about each spell (spec §7.1, cards per #132). */
export const ICE_ROSTER_CARDS: Readonly<Record<IceRosterSpellId, SpellCard>> = {
  ice_nova_bomb: {
    name: 'Frost Nova Bomb',
    color: PLACEHOLDERS.fx_nova.color,
    description: 'Rolls a spinning ice bomb through the crowd, spraying icicles as it goes.',
    stats: [
      ['Cooldown', '3.5 s'],
      ['Icicles', '14 each'],
      ['Wave (Lv3)', '28 in 110'],
      ['Slow', '40% for 2 s'],
      ['Freeze', '15% for 1 s'],
    ],
  },
};
