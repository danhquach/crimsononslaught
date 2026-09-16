import { PLACEHOLDERS } from './colors';

/**
 * Spell identifiers and the card each one shows on the select screen (spec §2,
 * §5 "Spells"). Exactly one spell is chosen per run. Order here is card order,
 * so keys 1–4 map to it. Base `SpellStats` per spell land with CO-030; the
 * `stats` strings below are a display-only summary of the spec's base values.
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
    name: 'Fireball',
    color: PLACEHOLDERS.proj_fire.color,
    description: 'Hurls fireballs at the nearest enemy; each explodes on hit.',
    stats: [
      ['Cooldown', '1.2 s'],
      ['Damage', '12'],
      ['Blast radius', '40'],
      ['Projectiles', '1'],
    ],
  },
  ice: {
    name: 'Frost Nova',
    color: PLACEHOLDERS.fx_nova.color,
    description: 'Pulses a freezing ring that damages and slows everything nearby.',
    stats: [
      ['Cooldown', '2.0 s'],
      ['Damage', '8'],
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
      ['Damage', '10'],
      ['Chains', '2'],
      ['Chain range', '120'],
    ],
  },
  earth: {
    name: 'Orbiting Boulders',
    color: PLACEHOLDERS.boulder.color,
    description: 'Boulders circle you, crushing and knocking back whatever they touch.',
    stats: [
      ['Boulders', '2'],
      ['Damage', '10'],
      ['Orbit radius', '80'],
      ['Knockback', '60'],
    ],
  },
};

/** Keyboard shortcut: `'1'`–`'4'` (KeyboardEvent.key) pick the card in that slot. */
export function spellIdForKey(key: string): SpellId | undefined {
  if (!/^[1-4]$/.test(key)) return undefined;
  return SPELL_IDS[Number(key) - 1];
}
