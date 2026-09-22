import type { SpellStatsBySpell } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';

/**
 * Spell identifiers, the card each one shows on the select screen (spec §2,
 * §5 "Spells") and the base stat block a run starts with. Exactly one spell is
 * chosen per run. Order here is card order, so keys 1–4 map to it. The `stats`
 * strings on a card are a display-only summary of `BASE_SPELL_STATS`.
 */
export const SPELL_IDS = ['fire', 'ice', 'lightning', 'earth'] as const;

export type SpellId = (typeof SPELL_IDS)[number];

export function isSpellId(value: unknown): value is SpellId {
  return typeof value === 'string' && (SPELL_IDS as readonly string[]).includes(value);
}

export interface SpellCard {
  name: string;
  /** 24-bit RGB, shared with the spell's projectile / fx placeholder. */
  color: number;
  /** One line, no line breaks. */
  description: string;
  /** `[label, value]` pairs, shown in order. */
  stats: readonly (readonly [label: string, value: string])[];
}

export const SPELL_CARDS: Readonly<Record<SpellId, SpellCard>> = {
  fire: {
    name: 'Fire Bolt',
    color: PLACEHOLDERS.proj_fire.color,
    description: 'Fires a fast bolt at the nearest enemy; a small explosion on hit.',
    stats: [
      ['Cooldown', '1.0 s'],
      ['Damage', '12'],
      ['Blast radius', '50'],
      ['Projectiles', '1'],
    ],
  },
  ice: {
    name: 'Frost Nova',
    color: PLACEHOLDERS.fx_nova.color,
    description: 'Pulses a freezing ring that damages and slows everything nearby.',
    stats: [
      ['Cooldown', '1.4 s'],
      ['Damage', '12'],
      ['Radius', '90'],
      ['Slow', '30% for 1.5 s'],
    ],
  },
  lightning: {
    name: 'Chain Lightning',
    color: PLACEHOLDERS.fx_bolt.color,
    description: 'Bolts strike the nearest enemy and chain to others close by.',
    stats: [
      ['Cooldown', '1.0 s'],
      ['Damage', '12'],
      ['Chains', '2'],
      ['Chain range', '120'],
    ],
  },
  earth: {
    name: 'Orbiting Boulders',
    color: PLACEHOLDERS.boulder.color,
    description: 'Boulders circle you, crushing and knocking back whatever they touch.',
    stats: [
      ['Boulders', '3'],
      ['Damage', '10'],
      ['Orbit radius', '80'],
      ['Knockback', '60'],
    ],
  },
};

/**
 * Spec §5 base values, one block per spell. A run never casts these numbers
 * directly: the `Spellbook` copies the block and scales it against the run's
 * player profile (Phase 2 spec §6.2). The field meanings live with the types in
 * `core/spellStats.ts`.
 *
 * Four fields the spec's base table skips: `aoeDamageFactor` and `chainFalloff`
 * hold the defaults the spec states in prose (half damage in the blast, 80% per
 * chain), and `shatterBonus` / `crushMultiplier` start at "no bonus". Fire's
 * `range` is a tuning value the spec never gives a baseline for.
 */
export const BASE_SPELL_STATS: Readonly<{
  [S in SpellId]: Readonly<SpellStatsBySpell[S]>;
}> = {
  fire: {
    cooldown: 1,
    damage: 12,
    aoeRadius: 50,
    aoeDamageFactor: 0.5,
    projectiles: 1,
    speed: 350,
    range: 400,
  },
  ice: {
    cooldown: 1.4,
    damage: 12,
    radius: 90,
    slowPct: 0.3,
    slowDuration: 1.5,
    freezeChance: 0,
    shatterBonus: 0,
  },
  lightning: {
    cooldown: 1,
    damage: 12,
    chains: 2,
    chainRange: 120,
    strikes: 1,
    stun: 0,
    chainFalloff: 0.8,
  },
  earth: {
    count: 3,
    orbitRadius: 80,
    orbitSpeed: 2.5,
    damage: 10,
    knockback: 60,
    size: 14,
    crushMultiplier: 1,
  },
};

/** Spec §5 Fire: burn ticks for this long after a hit. A run's passives never scale it. */
export const BURN_DURATION = 2;

/** Spec §5 Ice: a freeze is a full stop for this long. A run's passives never scale it. */
export const FREEZE_DURATION = 1;

/** Spec §5 Earth: one boulder can hit the same enemy this often. A run's passives never scale it. */
export const BOULDER_HIT_COOLDOWN = 0.4;

/** Keyboard shortcut: `'1'`–`'4'` (KeyboardEvent.key) pick the card in that slot. */
export function spellIdForKey(key: string): SpellId | undefined {
  if (!/^[1-4]$/.test(key)) return undefined;
  return SPELL_IDS[Number(key) - 1];
}
