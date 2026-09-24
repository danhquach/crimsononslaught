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
      ['Blast radius', '65'],
      ['Projectiles', '1'],
    ],
  },
  ice: {
    name: 'Ice Arrow',
    color: PLACEHOLDERS.proj_ice.color,
    description: 'Fires a fast arrow at the nearest enemy; a chill on hit, no blast.',
    stats: [
      ['Cooldown', '0.8 s'],
      ['Damage', '10'],
      ['Range', '189'],
      ['Slow', '20% for 1.0 s'],
    ],
  },
  lightning: {
    name: 'Lightning Bolt',
    color: PLACEHOLDERS.fx_bolt.color,
    description: 'A bolt strikes the nearest enemy, staggering it; sometimes it stuns.',
    stats: [
      ['Cooldown', '0.9 s'],
      ['Damage', '14'],
      ['Stagger', '0.5 s'],
      ['Stun', '8% for 2 s'],
    ],
  },
  earth: {
    name: 'Earth Spike',
    color: PLACEHOLDERS.boulder.color,
    description:
      'A spike erupts under a nearby enemy, hurling the group back and leaving it bleeding.',
    stats: [
      ['Cooldown', '1.1 s'],
      ['Damage', '16'],
      ['Radius', '55'],
      ['Knockback', '70'],
      ['Bleed', '4 dps for 3 s'],
    ],
  },
};

/**
 * Spec §5 base values, one block per spell. A run never casts these numbers
 * directly: the `Spellbook` copies the block and scales it against the run's
 * player profile (Phase 2 spec §6.2). The field meanings live with the types in
 * `core/spellStats.ts`.
 *
 * Two fields the spec's base table skips: `aoeDamageFactor` and `chainFalloff`
 * hold the defaults the spec states in prose (half damage in the blast, 80% per
 * chain). Fire's `range` is a tuning value the spec never gives a baseline for.
 * Ice's block is Ice Arrow's (Phase 2 spec §9.3): Frost Nova lives on as Frost
 * Nova Bomb in `config/iceRoster.ts`. Lightning's is Lightning Bolt's
 * (spec §9.4): Chain Lightning lives on as `lightning_chain` in
 * `config/lightningRoster.ts`. Earth's is Earth Spike's (spec §9.5): Orbiting
 * Boulders lives on as Earth Shield in `config/shields.ts`.
 */
export const BASE_SPELL_STATS: Readonly<{
  [S in SpellId]: Readonly<SpellStatsBySpell[S]>;
}> = {
  fire: {
    cooldown: 1,
    damage: 12,
    aoeRadius: 65,
    aoeDamageFactor: 0.5,
    projectiles: 1,
    speed: 350,
    range: 150,
  },
  ice: {
    cooldown: 0.8,
    damage: 10,
    projectiles: 1,
    speed: 380,
    range: 189,
    slowPct: 0.2,
    slowDuration: 1,
  },
  lightning: {
    cooldown: 0.9,
    damage: 14,
    strikes: 1,
    targetRange: 150,
    staggerDuration: 0.5,
    stunChance: 0.08,
    stunDuration: 2,
  },
  earth: {
    cooldown: 1.1,
    damage: 16,
    radius: 55,
    targetRange: 144,
    knockback: 70,
    bleed: 4,
    bleedDuration: 3,
  },
};

/** Spec §5 Fire: burn ticks for this long after a hit. A run's passives never scale it. */
export const BURN_DURATION = 2;

/** Spec §5 Ice: how long a freeze lasts for a hit that names no `freezeDuration` of its own. */
export const FREEZE_DURATION = 1;

/**
 * Spec §5 Earth: one stone of the ring can hit the same enemy this often, a
 * window every stone shares (`Enemy.tryBoulderHit`). Earth Shield is the ring
 * now (spec §9.5); a run's passives never scale it.
 */
export const BOULDER_HIT_COOLDOWN = 0.4;

/** Keyboard shortcut: `'1'`–`'4'` (KeyboardEvent.key) pick the card in that slot. */
export function spellIdForKey(key: string): SpellId | undefined {
  if (!/^[1-4]$/.test(key)) return undefined;
  return SPELL_IDS[Number(key) - 1];
}
