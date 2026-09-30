import { isRosterSpellId, type RosterSpellId } from '../config/loadout';
import type { SpellStatBlock, SpellStatField } from '../config/spellFields';
import type { SpellLevel, SpellLevelStatTable, SpellLevelTable } from '../config/spellLevels';
import { SPELL_LEVELS } from '../config/spellLevels';

/**
 * The stat adds a spell level brings (#327), applied to a spell's base block
 * before the profile scales it (spec §6.2). The fields these touch are
 * `unscaled` in `config/spellFields.ts`, so a passive never multiplies a
 * level's add. What a level does beyond stats is the spell's own rule.
 *
 * Pure TS, no Phaser import.
 */

type StatAdds = Partial<Record<SpellStatField, number>>;

/** The adds of levels 2 to `level` summed, so level 3 carries level 2's too. */
export function levelStatAdds(table: SpellLevelStatTable, id: string, level: SpellLevel): StatAdds {
  const out: StatAdds = {};
  // Own keys only, the guard `spellLevelText` uses: an id is player-reachable via `?loadout=`.
  if (!Object.hasOwn(table, id)) return out;
  const row = table[id as keyof SpellLevelStatTable];
  for (const step of [2, 3] as const) {
    if (step > level) break;
    for (const [field, amount] of Object.entries(row?.[step] ?? {})) {
      out[field as SpellStatField] = (out[field as SpellStatField] ?? 0) + amount;
    }
  }
  return out;
}

/** `base` with `adds` added to the fields it already carries; never creates a key. */
export function applyLevelStats(base: SpellStatBlock, adds: StatAdds): SpellStatBlock {
  const out: StatAdds = { ...base };
  for (const [field, amount] of Object.entries(adds)) {
    const current = out[field as SpellStatField];
    if (current !== undefined) out[field as SpellStatField] = current + amount;
  }
  return out;
}

/**
 * Boot-time check of the stat table (like `validateSpellLevels`): one line per
 * problem, never throws. Every key is a roster spell, every step is level 2 or
 * 3, every field is one the spell's base block carries with a finite amount
 * above 0, and every spell with adds has its level text.
 */
export function validateSpellLevelStats(
  table: SpellLevelStatTable,
  baseFor: (id: RosterSpellId) => SpellStatBlock | undefined,
  texts: SpellLevelTable = SPELL_LEVELS,
): string[] {
  const problems: string[] = [];
  for (const key of Object.getOwnPropertyNames(table)) {
    if (!isRosterSpellId(key)) {
      problems.push(`spell level stats: "${key}" is not a roster spell`);
      continue;
    }
    const base = baseFor(key);
    if (!base) problems.push(`spell level stats: "${key}" has no base block`);
    if (!Object.hasOwn(texts, key)) problems.push(`spell level stats: "${key}" has no level text`);
    const row: Readonly<Record<string, StatAdds | undefined>> = table[key] ?? {};
    for (const step of Object.getOwnPropertyNames(row)) {
      if (step !== '2' && step !== '3') {
        problems.push(`spell level stats: "${key}" level "${step}" is not 2 or 3`);
        continue;
      }
      for (const [field, amount] of Object.entries(row[step] ?? {})) {
        if (base && base[field as SpellStatField] === undefined) {
          problems.push(`spell level stats: "${key}" has no "${field}" to add to`);
        } else if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
          problems.push(`spell level stats: "${key}" level ${step} "${field}" must be > 0`);
        }
      }
    }
  }
  return problems;
}
