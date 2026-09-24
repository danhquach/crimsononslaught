import type { CompanionStats } from '../core/spellStats';
import type { SpellCard } from './spells';
import { PLACEHOLDERS, type TextureKey } from './colors';

/**
 * The four companion allies (#133, Phase 2 spec §9): which spells they are,
 * which flavour each one fights in, the numbers they start at and the card a
 * level-up shows for them.
 *
 * The mechanic is one class (`spells/CompanionSpell.ts`) reading these rows, so
 * the element's identity lives here rather than in four subclasses: the flavour
 * decides how it moves and strikes, and the optional fields of its stat block
 * decide what a hit leaves behind.
 *
 * The blocks are the spec's §9 tables. `chaseSpeed` for the two ranged
 * companions is the one number the spec does not give — it only states their
 * leash — so it is a tuning value here, set above `PLAYER_SPEED` (180) so an
 * ally that falls behind a running player can catch up rather than trail
 * further every second. The roster tickets (#140-#143) own the rest of each
 * element's spells and may fold these rows into their own tables.
 *
 * Pure data, no Phaser import.
 */

export const COMPANION_SPELL_IDS = [
  'fire_companion',
  'ice_companion',
  'lightning_companion',
  'earth_companion',
] as const;

export type CompanionSpellId = (typeof COMPANION_SPELL_IDS)[number];

export function isCompanionSpellId(value: unknown): value is CompanionSpellId {
  return typeof value === 'string' && (COMPANION_SPELL_IDS as readonly string[]).includes(value);
}

/**
 * How a companion fights. `ranged` hovers by the player and shoots; `melee`
 * charges what comes inside its leash and swings in `COMPANION_REACH`.
 */
export type CompanionKind = 'ranged' | 'melee';

export const COMPANION_KINDS: Readonly<Record<CompanionSpellId, CompanionKind>> = {
  fire_companion: 'ranged',
  ice_companion: 'ranged',
  lightning_companion: 'melee',
  earth_companion: 'melee',
};

/** px/s a ranged companion walks at; see the file note on the spec's silence. */
const RANGED_FOLLOW_SPEED = 220;

/**
 * How far past an enemy's own radius a melee companion's swing reaches, in px.
 * A mechanic tunable, not a per-spell stat: it is what "in melee" means for
 * every companion, and no passive scales it.
 */
export const COMPANION_REACH = 24;

/**
 * Shots one ranged companion's pool may ever hold. At the base blocks a bolt is
 * in the air about 0.8 s against a 1.2-1.4 s cadence, so one companion keeps
 * roughly one alive; the cap is many times that because a stacked Haste and a
 * widened `targetRange` both raise the steady count, and a pooled sprite costs
 * nothing until it flies. `companions.test.ts` holds the margin at 4x.
 */
export const MAX_COMPANION_SHOTS = 8;

/** Spec §9 base blocks, one per companion. */
export const BASE_COMPANION_STATS: Readonly<Record<CompanionSpellId, Readonly<CompanionStats>>> = {
  fire_companion: {
    attackCooldown: 1.2,
    damage: 8,
    targetRange: 260,
    leashRadius: 60,
    chaseSpeed: RANGED_FOLLOW_SPEED,
    projectiles: 1,
    speed: 320,
    burn: 2,
    burnDuration: 2,
  },
  ice_companion: {
    attackCooldown: 1.4,
    damage: 7,
    targetRange: 260,
    leashRadius: 60,
    chaseSpeed: RANGED_FOLLOW_SPEED,
    projectiles: 1,
    speed: 320,
    slowPct: 0.25,
    slowDuration: 1.5,
  },
  lightning_companion: {
    attackCooldown: 0.8,
    damage: 9,
    targetRange: 200,
    leashRadius: 220,
    chaseSpeed: 240,
    staggerDuration: 0.3,
  },
  earth_companion: {
    attackCooldown: 1.6,
    damage: 14,
    targetRange: 200,
    leashRadius: 200,
    chaseSpeed: 200,
    knockback: 80,
  },
};

/**
 * How a companion reads on screen: the clips it plays (CO-082 pool,
 * `systems/FxPool.ts`) — `muzzle` at the ally as a shot leaves, `hit` where an
 * attack lands, drawn at `hitScale` — and, for a ranged one, the look its bolt
 * wears in the air.
 *
 * Borrowed from the Phase 1 effects so every element reads as itself from day
 * one; the companions' own effects are #145, and `FxPool.burst` is a no-op for
 * a clip the atlas does not carry, so a missing one costs nothing.
 */
export interface CompanionLook {
  /**
   * The clip prefix of its own character sheet (#184): it plays
   * `<sprite>.<idle|move|attack>.<facing>` from it, so a fifth companion brings
   * its creature by naming one here.
   */
  readonly sprite: CompanionSprite;
  readonly muzzle?: string;
  readonly hit: string;
  readonly hitScale?: number;
  /**
   * Ranged only: the look its bolt wears (`entities/Projectile.ts`'s
   * `ProjectileLook`, matched structurally so this file stays engine-free).
   * Without one its bolts would fly as Fire's, whatever element it is.
   */
  readonly shot?: { readonly texture: TextureKey; readonly clip?: string };
}

/** Each companion's character sheet in the atlas (CO-124). */
export type CompanionSprite =
  'companionFire' | 'companionIce' | 'companionLightning' | 'companionEarth';

/**
 * The scale every companion is drawn at (#184), chosen rather than inherited
 * from the placeholder. The cut sized each sheet so the idle art stands about
 * as tall as the 24 px disc it replaces, so native size is the size the disc
 * held; `companions.test.ts` pins the idle art to 24 ± 4 px. Fixed rather than
 * fitted to a frame, so a frame gaining margin (#150) never resizes the ally.
 */
export const COMPANION_DRAW_SCALE = 1;

export const COMPANION_FX: Readonly<Record<CompanionSpellId, CompanionLook>> = {
  // The blast clip stands in for a bolt that has no area, so it is drawn small.
  fire_companion: {
    sprite: 'companionFire',
    muzzle: 'fire.spawn',
    hit: 'fire.explode',
    hitScale: 0.5,
    shot: { texture: 'proj_fire', clip: 'fire.fly' },
  },
  // No ice flight art yet (#145), so the bolt flies as its placeholder.
  ice_companion: { sprite: 'companionIce', hit: 'ice.shatter', shot: { texture: 'proj_ice' } },
  lightning_companion: { sprite: 'companionLightning', hit: 'lightning.impact' },
  earth_companion: { sprite: 'companionEarth', hit: 'earth.impact' },
};

/** What a level-up card says about each companion (spec §7.1, cards per #132). */
export const COMPANION_CARDS: Readonly<Record<CompanionSpellId, SpellCard>> = {
  fire_companion: {
    name: 'Fire Companion',
    color: PLACEHOLDERS.proj_fire.color,
    description: 'A burning ally follows you and shoots what comes close.',
    stats: [
      ['Attack every', '1.2 s'],
      ['Damage', '8'],
      ['Range', '260'],
      ['Burn', '2 dps for 2 s'],
    ],
  },
  ice_companion: {
    name: 'Ice Companion',
    color: PLACEHOLDERS.fx_nova.color,
    description: 'A frozen ally follows you and chills what it shoots.',
    stats: [
      ['Attack every', '1.4 s'],
      ['Damage', '7'],
      ['Range', '260'],
      ['Slow', '25% for 1.5 s'],
    ],
  },
  lightning_companion: {
    name: 'Lightning Companion',
    color: PLACEHOLDERS.fx_bolt.color,
    description: 'A charged ally runs down nearby enemies and staggers them.',
    stats: [
      ['Attack every', '0.8 s'],
      ['Damage', '9'],
      ['Chase range', '200'],
      ['Leash', '220'],
    ],
  },
  earth_companion: {
    name: 'Earth Companion',
    color: PLACEHOLDERS.boulder.color,
    description: 'A stone ally charges nearby enemies and hurls them back.',
    stats: [
      ['Attack every', '1.6 s'],
      ['Damage', '14'],
      ['Chase range', '200'],
      ['Knockback', '80'],
    ],
  },
};
