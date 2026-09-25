import type { FireDragonStats, FireWaveStats } from '../core/spellStats';
import type { SpellCard } from './spells';

/**
 * The rest of the Fire roster (#140, Phase 2 spec §9.2): Fire Wave (id
 * `fire_column`, CO-143) and Fire Dragon, which have no mechanic of their own
 * to share the way Meteor shares the sky strike or the companions share
 * `CompanionSpell` — each is its own class, `spells/FireWaveSpell.ts` and
 * `spells/FireDragonSpell.ts`.
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

/** Spec §9.2 base block, as Fire Wave (CO-143, #218). */
export const BASE_FIRE_WAVE_STATS: Readonly<FireWaveStats> = {
  cooldown: 2.2,
  damage: 18,
  arc: 95,
  speed: 260,
  range: 180,
  knockback: 8,
  burn: 8,
  burnDuration: 3,
};

/**
 * Where the arc sits in the `fire.wave` frames (CO-143), in native px,
 * measured from the cut art rather than the prompt: `tipX`/`tipY` is the
 * centre of the circle the flame front is drawn on (off the frame to the
 * left, the slice's tip) and `radius` is the distance from it to the front's
 * leading edge. The spell puts the sprite's origin on the tip, at the caster,
 * and scales it by `r / radius`, so the drawn front sits on the rim that
 * hits. `scripts/lib/fireWaveArt.test.mjs` re-measures both from the atlas.
 */
export const FIRE_WAVE_ART = { radius: 88, tipX: -24.5, tipY: 73.5 } as const;

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
  fire_column: BASE_FIRE_WAVE_STATS,
  fire_dragon: BASE_FIRE_DRAGON_STATS,
} as const satisfies Readonly<Record<FireRosterSpellId, Readonly<FireWaveStats | FireDragonStats>>>;

/** What a level-up card says about each spell (spec §7.1, cards per #132). */
export const FIRE_ROSTER_CARDS: Readonly<Record<FireRosterSpellId, SpellCard>> = {
  fire_column: {
    name: 'Fire Wave',
    color: 0xdd2c00,
    description:
      'Sends an arc of flame out from you, burning and nudging every enemy it sweeps over.',
    stats: [
      ['Cooldown', '2.2 s'],
      ['Damage', '18'],
      ['Burn', '8 dps for 3.0 s'],
      ['Arc', '95°'],
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
