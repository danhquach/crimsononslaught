import { isRosterSpellId, type RosterSpellId } from './loadout';

/**
 * Spell levels as data (#326): every equipped spell, the element's default
 * included, is level 1 to `MAX_SPELL_LEVEL`. A level-up can offer the next level
 * of a spell; what each level adds is this table's text, and the spell's own
 * ticket (#327-#330) fills its entry in when it builds the behaviour.
 *
 * A spell is offered an upgrade only while it has an entry, the same way only a
 * castable spell is offered as an active, so the table ships EMPTY and the
 * system lands before any level does. Levels live in the run, never in a save.
 *
 * Pure data, no Phaser import.
 */

/** Level 1 is what a spell is equipped at; 3 is the last upgrade. */
export const MAX_SPELL_LEVEL = 3;

export type SpellLevel = 1 | 2 | 3;

/** True for an integer level from 1 to `MAX_SPELL_LEVEL`, and for nothing else. */
export function isSpellLevel(value: unknown): value is SpellLevel {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SPELL_LEVEL
  );
}

/**
 * Longest level text, so the card shows it in one or two lines: measured in the
 * level-up card (15px Georgia, 192px wide), realistic words wrap to two lines up
 * to 52 to 57 characters, so the cap leaves the room a wider CI font needs.
 */
export const SPELL_LEVEL_TEXT_MAX = 48;

/** What levels 2 and 3 add, as the level-up card reads them. */
export type SpellLevelEntry = Readonly<{ 2: string; 3: string }>;

/** A spell without an entry has no upgrade to offer yet. */
export type SpellLevelTable = Readonly<Partial<Record<RosterSpellId, SpellLevelEntry>>>;

/** What each spell's levels 2 and 3 add. Empty until the element tickets land. */
export const SPELL_LEVELS: SpellLevelTable = {};

/** The text for `level` of `id`, or `undefined` when the spell has no entry or the level is 1. */
export function spellLevelText(
  table: SpellLevelTable,
  id: RosterSpellId,
  level: number,
): string | undefined {
  if (!Object.hasOwn(table, id) || (level !== 2 && level !== 3)) return undefined;
  return table[id]?.[level];
}

/** Printable ASCII, so a card never draws a glyph the game's font lacks. */
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

/**
 * Boot-time check of the level table (like `validateLoadoutConfig`): one line
 * per problem, never throws. Every key is a roster spell, every entry has both
 * texts, each non-empty printable ASCII of at most `SPELL_LEVEL_TEXT_MAX`.
 */
export function validateSpellLevels(table: SpellLevelTable = SPELL_LEVELS): string[] {
  const problems: string[] = [];
  for (const key of Object.getOwnPropertyNames(table)) {
    if (!isRosterSpellId(key)) {
      problems.push(`spell levels: "${key}" is not a roster spell`);
      continue;
    }
    for (const level of [2, 3] as const) {
      const text = table[key]?.[level];
      if (typeof text !== 'string' || text.length === 0) {
        problems.push(`spell levels: "${key}" level ${level} has no text`);
      } else if (text.length > SPELL_LEVEL_TEXT_MAX) {
        problems.push(
          `spell levels: "${key}" level ${level} text is ${text.length} characters, over ${SPELL_LEVEL_TEXT_MAX}`,
        );
      } else if (!PRINTABLE_ASCII.test(text)) {
        problems.push(`spell levels: "${key}" level ${level} text is not printable ASCII`);
      }
    }
  }
  return problems;
}
