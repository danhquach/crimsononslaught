/**
 * The shape of a run's loadout as data (Phase 2 spec §3, §9): the four
 * elements, the five spells each one owns, and the levels at which the two
 * extra active slots unlock.
 *
 * Only ids live here. A spell's stat block is its roster ticket's job
 * (#140-#143), so this file can land before a single new spell exists and
 * `core/loadout.ts` can be written against the ids alone.
 *
 * The four default spells keep the Phase 1 ids (spec §9.1), so `RosterSpellId`
 * is a superset of `config/spells.ts`'s `SpellId`; the two collapse into one
 * union when the Phase 1 select screen is reworked (#132).
 *
 * Pure data, no Phaser import.
 */

/** Spec §3.2: a run is locked to one element for its whole length. */
export const ELEMENTS = ['fire', 'ice', 'lightning', 'earth'] as const;

export type ElementId = (typeof ELEMENTS)[number];

export function isElementId(value: unknown): value is ElementId {
  return typeof value === 'string' && (ELEMENTS as readonly string[]).includes(value);
}

/**
 * Spec §9.2-§9.5. The default spell is first in each list; the other four are
 * what the two active slots draw from.
 */
export const SPELLS_BY_ELEMENT = {
  fire: ['fire', 'fire_meteor', 'fire_column', 'fire_companion', 'fire_dragon'],
  ice: ['ice', 'ice_nova_bomb', 'ice_shield', 'ice_companion', 'ice_blizzard'],
  lightning: [
    'lightning',
    'lightning_chain',
    'lightning_tornado',
    'lightning_companion',
    'lightning_sword',
  ],
  earth: ['earth', 'earth_boulder', 'earth_shield', 'earth_quake', 'earth_companion'],
} as const satisfies Readonly<Record<ElementId, readonly string[]>>;

/** Every spell in the Phase 2 roster, across all four elements. */
export type RosterSpellId = (typeof SPELLS_BY_ELEMENT)[ElementId][number];

export const ROSTER_SPELL_IDS: readonly RosterSpellId[] = ELEMENTS.flatMap(
  (element) => SPELLS_BY_ELEMENT[element] as readonly RosterSpellId[],
);

export function isRosterSpellId(value: unknown): value is RosterSpellId {
  return typeof value === 'string' && (ROSTER_SPELL_IDS as readonly string[]).includes(value);
}

/**
 * Spec §9.1: the default spell of each element keeps the element's own id, so
 * payloads and e2e selectors do not churn.
 */
export const DEFAULT_SPELL_BY_ELEMENT = {
  fire: 'fire',
  ice: 'ice',
  lightning: 'lightning',
  earth: 'earth',
} as const satisfies Readonly<Record<ElementId, RosterSpellId>>;

/** The element a spell belongs to, or `undefined` for an id outside the roster. */
export function elementOf(spellId: string): ElementId | undefined {
  return ELEMENTS.find((element) =>
    (SPELLS_BY_ELEMENT[element] as readonly string[]).includes(spellId),
  );
}

/**
 * Active slot 2 unlocks at level 2, slot 3 at level 5. Index is the slot index
 * (0 = the first extra slot); the default spell needs no unlock.
 *
 * The spec's §3.1 first guess was 3 and 7. CO-125's baseline sweep never got a
 * mortal run past level 7, so slot 3 existed only on paper: see
 * `docs/tuning/phase2-balance.md` round 1.
 */
export const SLOT_UNLOCK_LEVELS: readonly [number, number] = [2, 5];
