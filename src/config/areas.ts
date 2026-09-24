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
  targetRange: 180,
  slowPct: 0.5,
  slowDuration: 1,
};

/** Spec §9.5 base block; `duration` and the slow are the tuning values noted above. */
export const BASE_QUAKE_STATS: Readonly<GroundAreaStats> = {
  cooldown: 14,
  tickDamage: 8,
  tickRate: 0.5,
  radius: 180,
  duration: 8,
  targetRange: 162,
  slowPct: 0.3,
  slowDuration: 1,
};

export const BASE_AREA_STATS = {
  ice_blizzard: BASE_BLIZZARD_STATS,
  earth_quake: BASE_QUAKE_STATS,
} as const satisfies Readonly<Record<AreaSpellId, Readonly<GroundAreaStats>>>;

/**
 * The ring every patch is drawn with, scaled to the radius it actually covers,
 * so the ground says exactly where the ticks land. It is the outline over a
 * spell's own art and the whole look for a spell whose art has not landed, or
 * a run without the atlas (#179).
 */
export const AREA_TEXTURE = 'fx_area' satisfies keyof typeof PLACEHOLDERS;

/**
 * What a patch is drawn with besides the ring (#179): the looping clip of its
 * own art, sized so the art spans the patch. A look without a clip is the ring
 * alone. Each spell that places patches passes its own look to the pool, so a
 * new area spell brings its art without the pool changing.
 */
export interface AreaLook {
  readonly clip?: string;
}

/**
 * Blizzard's art is #145's cut. Earthquake's sheet is still being redrawn
 * (#145), so it draws the ring until its clip lands here.
 */
export const AREA_LOOKS: Readonly<Record<AreaSpellId, AreaLook>> = {
  ice_blizzard: { clip: 'ice.blizzard' },
  earth_quake: {},
};

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
      ['Radius', '180'],
      ['Lasts', '8 s'],
    ],
  },
};
