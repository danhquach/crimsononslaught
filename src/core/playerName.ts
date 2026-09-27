import type { Rng } from './rng';
import type { Save } from './save';

/**
 * The profile's player name (CO-165): the rules for a name the player types,
 * and the `Player` + 9 digits name a new profile starts with.
 *
 * ASCII only on purpose: the menu fonts render it, and it rules out look-alike,
 * zero-width and right-to-left characters in a name shown back to the player.
 *
 * Pure TS, no Phaser import.
 */

export const PLAYER_NAME_MAX = 16;

/** The label Boot derives the name's own RNG stream from, so a run's draws never move. */
export const PLAYER_NAME_STREAM = 'playerName';

const ALLOWED = /^[A-Za-z0-9_ ]+$/;

export type PlayerNameResult =
  { readonly ok: true; readonly name: string } | { readonly ok: false; readonly reason: string };

/** `Player` and 9 digits, leading zeros kept: always 15 characters, so always valid. */
export function generatePlayerName(rng: Pick<Rng, 'int'>): string {
  return 'Player' + String(rng.int(0, 999_999_999)).padStart(9, '0');
}

/** Trim, then check length and characters. The reason is shown to the player as is. */
export function validatePlayerName(raw: string): PlayerNameResult {
  const name = raw.trim();
  if (name === '') return { ok: false, reason: "Name can't be empty." };
  if (name.length > PLAYER_NAME_MAX)
    return { ok: false, reason: `${PLAYER_NAME_MAX} characters at most.` };
  if (!ALLOWED.test(name))
    return { ok: false, reason: 'Letters, numbers, spaces and underscores only.' };
  return { ok: true, name };
}

/**
 * The same save when its name is already valid; otherwise a copy with the name
 * trimmed, or with a generated one when trimming does not make it valid. Covers
 * a first launch, a migrated older save, a reset and a hand-edited name in one
 * rule.
 */
export function ensurePlayerName(save: Save, rng: Pick<Rng, 'int'>): Save {
  const checked = validatePlayerName(save.profile.name);
  if (checked.ok && checked.name === save.profile.name) return save;
  const name = checked.ok ? checked.name : generatePlayerName(rng);
  return { ...save, profile: { ...save.profile, name } };
}
