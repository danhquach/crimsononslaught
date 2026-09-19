import type { GroundAreaStats } from '../core/spellStats';
import { PLACEHOLDERS } from './colors';
import type { SpellCard } from './spells';

/**
 * The two persistent ground areas (#135, Phase 2 spec §9): which spells they
 * are, the numbers they start at and the card a level-up shows for them.
 *
 * The mechanic is one class (`spells/GroundAreaSpell.ts`) over the rules in
 * `core/groundArea.ts`, so what separates Blizzard from Earthquake is only the
 * row here: Ice buys the element's crowd control with a heavy slow, Earth buys
 * damage with a longer patch and a longer wait for it. Tornado (#136) is this
 * mechanic plus a drift and a pull and belongs to that ticket.
 *
 * Blizzard's block is the spec's §9.3 table verbatim. Earthquake's §9.5 table
 * gives its cooldown, tick and radius but not its `duration` or the slow the
 * spec's prose promises it ("Earthquake slows instead" of carrying Earth's
 * knockback, §9.5), so those two are tuning values here: a patch that lives
 * longer than Blizzard's on a longer cooldown, slowing by less than Ice's
 * signature 50%. #147's balance pass owns both numbers.
 *
 * Pure data, no Phaser import.
 */

export const AREA_SPELL_IDS = ['ice_blizzard', 'earth_quake'] as const;

export type AreaSpellId = (typeof AREA_SPELL_IDS)[number];

export function isAreaSpellId(value: unknown): value is AreaSpellId {
  return typeof value === 'string' && (AREA_SPELL_IDS as readonly string[]).includes(value);
}

/** Spec §9.3 base block. */
export const BASE_BLIZZARD_STATS: Readonly<GroundAreaStats> = {
  cooldown: 12,
  tickDamage: 6,
  tickRate: 0.5,
  radius: 180,
  duration: 6,
  targetRange: 400,
  slowPct: 0.5,
  slowDuration: 1,
};

/** Spec §9.5 base block; `duration` and the slow are the tuning values noted above. */
export const BASE_QUAKE_STATS: Readonly<GroundAreaStats> = {
  cooldown: 14,
  tickDamage: 8,
  tickRate: 0.5,
  radius: 160,
  duration: 8,
  targetRange: 360,
  slowPct: 0.3,
  slowDuration: 1,
};

export const BASE_AREA_STATS = {
  ice_blizzard: BASE_BLIZZARD_STATS,
  earth_quake: BASE_QUAKE_STATS,
} as const satisfies Readonly<Record<AreaSpellId, Readonly<GroundAreaStats>>>;

/**
 * How a patch reads on screen: the texture it is drawn with, scaled to the
 * radius it actually covers, so the ground says exactly where the ticks land.
 *
 * Both use the one `fx_area` placeholder, the way all four companions share a
 * disc (#133): their own art is #145, and a ring that outlines the patch is
 * what the mechanic needs read correctly until then.
 */
export const AREA_TEXTURE = 'fx_area' satisfies keyof typeof PLACEHOLDERS;

/** What a level-up card says about each area (spec §7.1, cards per #132). */
export const AREA_CARDS: Readonly<Record<AreaSpellId, SpellCard>> = {
  ice_blizzard: {
    name: 'Blizzard',
    color: PLACEHOLDERS.fx_nova.color,
    description: 'A freezing storm settles on the crowd, chilling and grinding it down.',
    stats: [
      ['Cooldown', '12 s'],
      ['Damage', '6 every 0.5 s'],
      ['Radius', '180'],
      ['Slow', '50% for 1 s'],
    ],
  },
  earth_quake: {
    name: 'Earthquake',
    color: PLACEHOLDERS.boulder.color,
    description: 'The ground splits open and keeps shaking whatever stands on it.',
    stats: [
      ['Cooldown', '14 s'],
      ['Damage', '8 every 0.5 s'],
      ['Radius', '160'],
      ['Lasts', '8 s'],
    ],
  },
};
