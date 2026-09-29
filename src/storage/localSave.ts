/**
 * The one place the game touches `localStorage` (CO-101). Moves the save's JSON
 * string in and out under a versioned key and nothing more: what the string
 * means is `core/save.ts`'s business, which is why this file sits outside the
 * core layer and core is forbidden from importing it (`eslint.config.js`).
 *
 * Every call is wrapped: a private window, a disabled store or a full quota
 * throws from `localStorage`, and none of those may stop the game booting or a
 * run ending. A failed store returns `false` so the caller can say so.
 */

export const SAVE_STORAGE_KEY = 'co.save.v1';

/** The stored JSON, or `null` when nothing is stored or storage is unavailable. */
export function loadSaveJson(): string | null {
  try {
    return localStorage.getItem(SAVE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Whether the latest `storeSaveJson` threw; a later good write clears it (#316). */
let lastStoreFailed = false;

/**
 * True when the last write to storage failed — blocked, full or unavailable —
 * so progress made since is not being kept. Read by the screens that tell the
 * player (`core/save.ts saveNotice`); every write goes through `storeSaveJson`,
 * so no caller has to report its own failure.
 */
export function saveStoreFailed(): boolean {
  return lastStoreFailed;
}

export function storeSaveJson(json: string): boolean {
  try {
    localStorage.setItem(SAVE_STORAGE_KEY, json);
    lastStoreFailed = false;
    return true;
  } catch {
    lastStoreFailed = true;
    return false;
  }
}

export function clearSaveJson(): boolean {
  try {
    localStorage.removeItem(SAVE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
