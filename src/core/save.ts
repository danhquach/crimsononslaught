import { upgradeById } from '../config/meta';
import type { Outcome, RunStats } from './scenePayloads';

/**
 * The player's saved state and every rule that reads or writes it (CO-101):
 * the schema, its version, parsing anything storage hands back without ever
 * throwing, migrating an older save forward, and recording a finished run.
 *
 * Nothing here touches storage. `storage/localSave.ts` moves the JSON string in
 * and out of `localStorage`; the scenes hand it to `parseSave` and take
 * `serializeSave` back. The run loop never sees this module — Boot parses once,
 * Result records once — so a run stays a function of its seed and the save it
 * started with.
 *
 * Pure TS, no Phaser import.
 */

/** Bump when the shape changes, and add a step to `MIGRATIONS` that lifts the previous shape. */
export const SAVE_VERSION = 1;

/** Lifetime totals, aggregated from each run's `RunStats` on Result. */
export interface SaveProfile {
  runs: number;
  wins: number;
  bestTimeMs: number;
  bestLevel: number;
  totalKills: number;
  /** Spell id -> runs started with it. */
  spellCounts: Record<string, number>;
}

/** Settings that outlive the session (#121, #124 fill this in). Primitives only. */
export type SaveSettings = Record<string, string | number | boolean>;

export interface Save {
  version: number;
  profile: SaveProfile;
  currency: number;
  /** Upgrade id -> ranks bought. */
  upgrades: Record<string, number>;
  settings: SaveSettings;
}

export function emptySave(): Save {
  return {
    version: SAVE_VERSION,
    profile: { runs: 0, wins: 0, bestTimeMs: 0, bestLevel: 0, totalKills: 0, spellCounts: {} },
    currency: 0,
    upgrades: {},
    settings: {},
  };
}

/**
 * Lifts a save of version `n` to version `n + 1`. Keyed by the version it
 * reads. A step receives a plain object and returns a plain object: the final
 * shape is checked once, after the last step, by `isSave`.
 */
export type MigrationStep = (old: Record<string, unknown>) => Record<string, unknown>;

/** No migrations yet: version 1 is the first shape. */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = {};

/** `empty`: nothing stored. `reset`: something was stored and could not be used; `reason` says why. */
export type ParseStatus = 'ok' | 'empty' | 'reset';

export interface ParsedSave {
  save: Save;
  status: ParseStatus;
  reason?: string;
}

/**
 * Turn whatever storage returned into a usable save. Never throws: bad JSON, a
 * wrong shape, or a version this build cannot read all give a fresh save and a
 * `reset` status so the caller can tell the player and overwrite the bad entry.
 */
export function parseSave(
  json: string | null,
  migrations: Readonly<Record<number, MigrationStep>> = MIGRATIONS,
  version: number = SAVE_VERSION,
): ParsedSave {
  if (json === null || json === '') return { save: emptySave(), status: 'empty' };

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { save: emptySave(), status: 'reset', reason: 'not valid JSON' };
  }

  const migrated = migrate(data, migrations, version);
  if (!migrated.ok) return { save: emptySave(), status: 'reset', reason: migrated.reason };
  return { save: migrated.save, status: 'ok' };
}

export type MigrateResult =
  { readonly ok: true; readonly save: Save } | { readonly ok: false; readonly reason: string };

/**
 * Walk a stored object forward one version at a time until it reads as
 * `version`, then check the shape. A version above `version` was written by a
 * newer build and is refused rather than guessed at; a version with no step is
 * a shape this build has forgotten how to read.
 */
export function migrate(
  data: unknown,
  migrations: Readonly<Record<number, MigrationStep>> = MIGRATIONS,
  version: number = SAVE_VERSION,
): MigrateResult {
  if (!isRecord(data)) return { ok: false, reason: 'not an object' };
  let current: Record<string, unknown> = data;
  let from = current.version;
  if (!Number.isInteger(from)) return { ok: false, reason: 'no version' };
  if ((from as number) > version)
    return { ok: false, reason: `version ${from} is newer than ${version}` };

  while (from !== version) {
    const step = migrations[from as number];
    if (!step) return { ok: false, reason: `no migration from version ${from}` };
    current = { ...step(current), version: (from as number) + 1 };
    from = current.version;
  }

  if (!isSave(current)) return { ok: false, reason: 'wrong shape' };
  return { ok: true, save: normalizeUpgrades(current) };
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save);
}

/**
 * Fold one finished run into the save: counters up, bests kept as maxima, the
 * run's spell tallied, and `earned` — the Embers it collected, `stats.embers`
 * (#195) — added to the balance. Returns a new save; the one passed in is
 * untouched.
 */
export function recordRun(save: Save, stats: RunStats, outcome: Outcome, earned: number): Save {
  const profile = save.profile;
  return {
    ...save,
    profile: {
      runs: profile.runs + 1,
      wins: profile.wins + (outcome === 'win' ? 1 : 0),
      bestTimeMs: Math.max(profile.bestTimeMs, stats.timeSurvivedMs),
      bestLevel: Math.max(profile.bestLevel, stats.level),
      totalKills: profile.totalKills + stats.kills,
      spellCounts: {
        ...profile.spellCounts,
        [stats.spellId]: (profile.spellCounts[stats.spellId] ?? 0) + 1,
      },
    },
    currency: save.currency + Math.max(0, Math.floor(earned)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isFiniteNonNegative = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

function isCountRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isCount);
}

function isSaveProfile(value: unknown): value is SaveProfile {
  return (
    isRecord(value) &&
    isCount(value.runs) &&
    isCount(value.wins) &&
    isFiniteNonNegative(value.bestTimeMs) &&
    isCount(value.bestLevel) &&
    isCount(value.totalKills) &&
    isCountRecord(value.spellCounts)
  );
}

function isSettings(value: unknown): value is SaveSettings {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (v) =>
        typeof v === 'string' ||
        typeof v === 'boolean' ||
        (typeof v === 'number' && Number.isFinite(v)),
    )
  );
}

/** Structural check of the current shape. Version is checked by `migrate`, not here. */
export function isSave(value: unknown): value is Save {
  return (
    isRecord(value) &&
    Number.isInteger(value.version) &&
    isSaveProfile(value.profile) &&
    isCount(value.currency) &&
    isCountRecord(value.upgrades) &&
    isSettings(value.settings)
  );
}

/**
 * Drop upgrades this build no longer has and cap the rest at their `maxRank`,
 * so a save from a build with a different upgrade list still loads and
 * `resolveProfile` — which throws on both — never sees them. A rank of 0 is
 * "not owned" and is dropped too.
 */
function normalizeUpgrades(save: Save): Save {
  const upgrades: Record<string, number> = {};
  for (const [id, rank] of Object.entries(save.upgrades)) {
    const upgrade = upgradeById(id);
    if (!upgrade || rank < 1) continue;
    upgrades[id] = Math.min(rank, upgrade.maxRank);
  }
  return { ...save, upgrades };
}
