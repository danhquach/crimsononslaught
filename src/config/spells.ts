/**
 * Spell identifiers. Exactly one spell is chosen per run (spec §2).
 * Base `SpellStats` per spell land with CO-030; this module only owns the ids
 * so scene payloads (CO-010) and the select screen (CO-011) share one source.
 */
export const SPELL_IDS = ['fire', 'ice', 'lightning', 'earth'] as const;

export type SpellId = (typeof SPELL_IDS)[number];

export function isSpellId(value: unknown): value is SpellId {
  return typeof value === 'string' && (SPELL_IDS as readonly string[]).includes(value);
}
